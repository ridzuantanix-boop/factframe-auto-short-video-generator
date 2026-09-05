import { readFile } from "node:fs/promises";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { buildMysteryScript, passesQualityGate } from "../src/lib/mystery/storyEngine.ts";
import { persistResearchClaims, researchPackageToStoryRecord } from "../src/lib/research/storyResearch.ts";
import { writeAudit } from "./audit-lib.mjs";

const cohort = JSON.parse(await readFile("audit/ai-enrichment-report.json", "utf8"));
let manualReviews = []; try { manualReviews = JSON.parse(await readFile("audit/readiness-manual-review.json", "utf8")).reviews ?? []; } catch { /* First run exports samples for review. */ }
let priorReport = null; let priorStories = []; try { priorReport = JSON.parse(await readFile("audit/readiness-report.json", "utf8"));
  priorStories = JSON.parse(await readFile("audit/readiness-ready-stories.json", "utf8")).stories ?? []; } catch { /* First readiness audit has no baseline artifact. */ }
const reviewById = new Map(manualReviews.map((review) => [review.candidateId, review])); const store = createStoryStore();
const before = new Map(); const after = new Map(); const failures = [];
try {
  for (const candidateId of cohort.candidateIds.slice(0, 100)) {
    const candidate = await store.findById(candidateId); const pkg = await store.getResearchPackage(candidateId);
    if (!candidate || !pkg) { failures.push({ candidateId, reason: "Candidate or research package missing" }); continue; }
    before.set(candidateId, pkg);
    try { const sources = await store.listSourcesForCandidate(candidateId); after.set(candidateId, await persistResearchClaims(candidate, sources, pkg.claims, store, pkg.aiNarration)); }
    catch (error) { failures.push({ candidateId, reason: error instanceof Error ? error.message : "Readiness recalculation failed" }); }
  }
} finally { await store.close(); }

const readyBefore = [...before.values()].filter((pkg) => pkg.readyDecision.status === "READY");
const readyAfter = [...after.values()].filter((pkg) => pkg.readyDecision.status === "READY");
const priorNewIds = new Set(priorStories.map((story) => story.candidateId));
const newlyReady = readyAfter.filter((pkg) => before.get(pkg.storyCandidateId)?.readyDecision.status !== "READY" || priorNewIds.has(pkg.storyCandidateId));
const exported = newlyReady.map((pkg) => {
  const story = researchPackageToStoryRecord(pkg); const script = buildMysteryScript(story, 60, "DOCUMENTARY", true); const review = reviewById.get(pkg.storyCandidateId) ?? null;
  return { candidateId: pkg.storyCandidateId, title: pkg.title, storyType: pkg.storyType, sources: pkg.sources.map((source) => ({ id: source.id, title: source.title, publisher: source.publisher, url: source.url, reliabilityLevel: source.reliabilityLevel })),
    claims: pkg.claims.map((claim) => ({ id: claim.id, claimText: claim.claimText, claimType: claim.claimType, confidence: claim.confidence, sourceIds: claim.sourceIds })),
    spokenClaims: pkg.claims.filter((claim) => claim.spokenText).map((claim) => ({ id: claim.id, spokenText: claim.spokenText, sourceIds: claim.sourceIds })),
    finalNarration: script.segments.map((segment) => ({ role: segment.role, text: segment.text, sourceIds: segment.sourceIds })),
    supportedDurationSeconds: pkg.supportedDurationSeconds, supportedDurationBand: pkg.supportedDurationBand, estimatedNarrationSeconds: pkg.estimatedNarrationSeconds,
    storyCompletenessScore: pkg.storyCompletenessScore, endingType: pkg.endingType, sourceCoverage: pkg.sourceCoverage, unsupportedClaims: pkg.unsupportedClaimCount,
    scriptQualityPass: passesQualityGate(script), readyReason: pkg.readyDecision.reasons, manualReview: review };
});
const reviewed = exported.filter((item) => item.manualReview); const passed = reviewed.filter((item) => item.manualReview.verdict === "PASS");
const bands = ["MICRO", "SHORT", "STANDARD", "LONG"]; const report = { generatedAt: new Date().toISOString(), totalEvaluated: before.size,
  readyBefore: priorReport?.readyBefore ?? readyBefore.length, readyAfter: readyAfter.length, newlyReady: newlyReady.length,
  durationDistribution: Object.fromEntries(bands.map((band) => [band, readyAfter.filter((pkg) => pkg.supportedDurationBand === band).length])),
  averageClaimsPerReadyStory: readyAfter.length ? Number((readyAfter.reduce((sum, pkg) => sum + pkg.distinctUsefulClaimCount, 0) / readyAfter.length).toFixed(2)) : 0,
  averageSupportedDuration: readyAfter.length ? Number((readyAfter.reduce((sum, pkg) => sum + pkg.supportedDurationSeconds, 0) / readyAfter.length).toFixed(1)) : 0,
  unsupportedClaimCount: readyAfter.reduce((sum, pkg) => sum + pkg.unsupportedClaimCount, 0), manualReviewsCompleted: reviewed.length,
  manualReviewPassRate: reviewed.length ? Number((passed.length / reviewed.length).toFixed(3)) : null, recalculationFailures: failures.length, failures };
const storiesFile = await writeAudit("readiness-ready-stories.json", { generatedAt: report.generatedAt, stories: exported });
const reportFile = await writeAudit("readiness-report.json", report); console.log(JSON.stringify({ ...report, storiesFile, reportFile }, null, 2));
if (readyAfter.some((pkg) => pkg.unsupportedClaimCount || pkg.sourceCoverage < 1)) throw new Error("Adaptive readiness promoted unsupported claims.");
if (exported.some((item) => !item.scriptQualityPass)) throw new Error("A newly READY story failed the final script quality gate.");
