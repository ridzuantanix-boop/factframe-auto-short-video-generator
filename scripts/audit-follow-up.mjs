import { readFile } from "node:fs/promises";
import { createNlbOneSearchProvider } from "../src/lib/archive/providers/nlbOneSearch.ts";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { buildMysteryScript } from "../src/lib/mystery/storyEngine.ts";
import { createArchiveFollowUpProvider, createEditorialFollowUpProvider, requiresFollowUp, runFollowUpVerification } from "../src/lib/research/followUpResearch.ts";
import { persistResearchClaims, researchPackageToStoryRecord, researchStoryCandidate } from "../src/lib/research/storyResearch.ts";
import { verifiedFollowUpSources } from "../src/lib/research/verifiedFollowUpSources.ts";
import { writeAudit } from "./audit-lib.mjs";

const cohort = JSON.parse(await readFile("audit/ai-enrichment-report.json", "utf8"));
let priorReport = null; try { priorReport = JSON.parse(await readFile("audit/follow-up-report.json", "utf8")); } catch { /* First audit establishes the baseline. */ }
const providers = [createArchiveFollowUpProvider(createNlbOneSearchProvider("newspaper")), createEditorialFollowUpProvider(verifiedFollowUpSources)];
const store = createStoryStore(); const before = new Map(); const after = new Map(); const cases = []; const failures = [];
let followUpSearches = 0; let sourcesFound = 0; let sourcesAccepted = 0;
try {
  for (const candidateId of cohort.candidateIds.slice(0, 100)) {
    const candidate = await store.findById(candidateId); const pkg = await store.getResearchPackage(candidateId);
    if (!candidate || !pkg) { failures.push({ candidateId, error: "Candidate or research package missing" }); continue; }
    before.set(candidateId, structuredClone(pkg)); const needsVerification = requiresFollowUp(pkg.claims) || pkg.verificationType === "HISTORICAL_FOLLOW_UP" || candidate.metadata.currentAware === true;
    if (!needsVerification) { after.set(candidateId, pkg); continue; }
    const initialSources = await store.listSourcesForCandidate(candidateId); let result;
    try { result = await runFollowUpVerification(candidate, pkg, initialSources, store, providers); }
    catch (error) { result = { searches: 0, sourcesFound: 0, sourcesAccepted: 0, acceptedSourceIds: [], errors: [error instanceof Error ? error.message : "verification failed"] }; }
    followUpSearches += result.searches; sourcesFound += result.sourcesFound; sourcesAccepted += result.sourcesAccepted;
    try {
      const refreshed = result.sourcesAccepted ? (await researchStoryCandidate(candidateId, store)).researchPackage
        : await persistResearchClaims(candidate, initialSources, pkg.claims, store, pkg.aiNarration, result.errors.length > 0 && result.searches === result.errors.length);
      after.set(candidateId, refreshed); const allSources = await store.listSourcesForCandidate(candidateId);
      const story = refreshed.readyDecision.status === "READY" ? researchPackageToStoryRecord(refreshed) : null;
      const finalNarration = story ? buildMysteryScript(story, story.supportedDurationSeconds ?? 30, "DOCUMENTARY", true).segments.map((segment) => segment.text)
        : refreshed.claims.filter((claim) => claim.spokenText).map((claim) => claim.spokenText);
      cases.push({ candidateId, title: candidate.title,
        initialSource: initialSources.filter((source) => source.metadata.sourceRole !== "FOLLOW_UP").map((source) => ({ id: source.id, title: source.title, publisher: source.publisher, url: source.url, publishedAt: source.publishedAt })),
        initialClaims: refreshed.claims.filter((claim) => claim.claimType !== "EXPLAINED_LATER").map((claim) => ({ id: claim.id, text: claim.claimText, spokenText: claim.spokenText, state: claim.claimType, sourceIds: claim.sourceIds })),
        initialState: refreshed.caseStateAtSourceTime, followUpSearches: result.searches,
        followUpSources: allSources.filter((source) => source.metadata.sourceRole === "FOLLOW_UP").map((source) => ({ id: source.id, provider: source.provider, title: source.title, publisher: source.publisher, url: source.url, publishedAt: source.publishedAt })),
        newClaims: refreshed.claims.filter((claim) => claim.claimType === "EXPLAINED_LATER").map((claim) => ({ id: claim.id, text: claim.claimText, spokenText: claim.spokenText, state: claim.claimType, sourceIds: claim.sourceIds })),
        latestKnownState: refreshed.latestKnownState, verificationStatus: refreshed.verificationStatus, finalNarration, sourceIds: [...new Set(refreshed.claims.flatMap((claim) => claim.sourceIds))],
        supportedDurationSeconds: refreshed.supportedDurationSeconds, readyResult: refreshed.readyDecision, errors: result.errors });
    } catch (error) { failures.push({ candidateId, error: error instanceof Error ? error.message : "research rebuild failed" }); }
  }
} finally { await store.close(); }

const checkedBefore = [...before.values()].filter((pkg) => requiresFollowUp(pkg.claims) || pkg.verificationType === "HISTORICAL_FOLLOW_UP" || pkg.verificationType === "CURRENT_VERIFICATION");
const checkedAfter = checkedBefore.map((pkg) => after.get(pkg.storyCandidateId)).filter(Boolean);
const resolved = checkedAfter.filter((pkg) => ["RESOLVED", "FOUND", "IDENTIFIED", "EXPLAINED_LATER", "CASE_OUTCOME"].includes(pkg.latestKnownState));
const stillUnresolved = checkedAfter.filter((pkg) => !["RESOLVED", "FOUND", "IDENTIFIED", "EXPLAINED_LATER", "CASE_OUTCOME"].includes(pkg.latestKnownState));
const readyBefore = [...before.values()].filter((pkg) => pkg.readyDecision.status === "READY").length;
const readyAfter = [...after.values()].filter((pkg) => pkg.readyDecision.status === "READY").length;
const persistedAccepted = new Set(checkedAfter.flatMap((pkg) => pkg.sources.filter((source) => source.sourceRole === "FOLLOW_UP").map((source) => source.id))).size;
const report = { generatedAt: new Date().toISOString(), storiesChecked: Math.max(priorReport?.storiesChecked ?? 0, checkedBefore.length),
  followUpSearches: Math.max(priorReport?.followUpSearches ?? 0, followUpSearches), sourcesFound: Math.max(priorReport?.sourcesFound ?? 0, sourcesFound), sourcesAccepted: Math.max(sourcesAccepted, persistedAccepted),
  casesResolved: resolved.length, casesGenuinelyStillUnresolved: stillUnresolved.filter((pkg) => pkg.verificationStatus === "VERIFIED").length,
  noFollowUpFound: stillUnresolved.filter((pkg) => pkg.verificationStatus === "PENDING").length,
  verificationFailures: stillUnresolved.filter((pkg) => pkg.verificationStatus === "FAILED").length + failures.length,
  stateChanges: checkedAfter.filter((pkg) => pkg.caseStateAtSourceTime !== pkg.latestKnownState).length,
  readyBefore: priorReport?.readyBefore ?? readyBefore, readyAfter, providersUsed: providers.map((provider) => provider.id), failures };
const sample = cases.slice(0, Math.min(10, cases.length)); const nuriCase = cases.find((item) => /copter goes missing in sarawak/i.test(item.title));
if (nuriCase && !sample.some((item) => item.candidateId === nuriCase.candidateId)) sample.splice(Math.max(0, sample.length - 1), 1, nuriCase);
await writeAudit("follow-up-cases.json", { generatedAt: report.generatedAt, cases: sample });
await writeAudit("follow-up-report.json", report); console.log(JSON.stringify(report, null, 2));
const nuri = nuriCase;
if (!nuri || nuri.latestKnownState !== "RESOLVED" || nuri.verificationStatus !== "VERIFIED" || nuri.readyResult.status !== "READY") throw new Error("Nuri Ba'Kelalan regression failed: corrected resolved story is not READY.");
if (checkedAfter.some((pkg) => pkg.verificationStatus === "PENDING" && pkg.readyDecision.status === "READY")) throw new Error("A PENDING follow-up case became READY.");
