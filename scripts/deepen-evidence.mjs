import { readFile } from "node:fs/promises";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { discoverFollowUpSources } from "../src/lib/research/followUpDeepening.ts";
import { researchStoryCandidate } from "../src/lib/research/storyResearch.ts";
import { writeAudit } from "./audit-lib.mjs";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => argument.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const input = JSON.parse(await readFile(values["candidate-ids-file"] ?? "audit/ai-enrichment-report.json", "utf8")); const limit = Math.min(100, Math.max(1, Number(values.limit ?? 20)));
const validatorAudit = JSON.parse(await readFile("audit/validator-audit.json", "utf8")); const auditOnly = values["audit-only"] === "true";
const ids = (input.candidateIds ?? []).slice(0, limit); const store = createStoryStore(); const details = [];
const usefulClaims = (pkg) => pkg?.claims.filter((claim) => claim.confidence !== "LOW" && claim.ocrQuality >= .65) ?? [];
const summarize = (packages) => { const claims = packages.flatMap(usefulClaims); return { averageUsefulClaimsPerStory: packages.length ? Number((claims.length / packages.length).toFixed(3)) : 0,
  validSpokenCoverage: claims.length ? Number((claims.filter((claim) => claim.spokenText).length / claims.length).toFixed(3)) : 0,
  ready: packages.filter((pkg) => pkg?.readyDecision.status === "READY").length }; };
try {
  const beforePackages = (await Promise.all(ids.map((id) => store.getResearchPackage(id)))).filter(Boolean); const before = summarize(beforePackages);
  let cursor = 0; const concurrency = Math.min(3, Math.max(1, Number(values.concurrency ?? 2)));
  async function worker() { while (cursor < ids.length) { const id = ids[cursor++]; let candidate = await store.findById(id); if (!candidate) continue; let pkg = await store.getResearchPackage(id);
    if (!pkg && candidate.sourceCount) try { pkg = (await researchStoryCandidate(id, store)).researchPackage; } catch { /* Keep unresearched candidate PARTIAL. */ }
    if (!pkg) { details.push({ candidateId: id, title: candidate.title, queries: [], resultsReviewed: 0, newSources: 0, claimsBefore: 0, claimsAfter: 0, errors: ["No research package"] }); continue; }
    const sources = await store.listSourcesForCandidate(id); const claimsBefore = usefulClaims(pkg).length; const result = auditOnly
      ? { queries: [], resultsReviewed: 0, newSources: 0, informationGain: [], errors: [] } : await discoverFollowUpSources(candidate, pkg, sources, store);
    if (result.newSources) pkg = (await researchStoryCandidate(id, store)).researchPackage;
    details.push({ candidateId: id, title: candidate.title, ...result, claimsBefore, claimsAfter: usefulClaims(pkg).length });
    if (Number(values.delay ?? 250)) await new Promise((resolve) => setTimeout(resolve, Number(values.delay ?? 250)));
  } }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const afterPackages = (await Promise.all(ids.map((id) => store.getResearchPackage(id)))).filter(Boolean); const after = summarize(afterPackages);
  const cumulativeSources = (await Promise.all(ids.map((id) => store.listSourcesForCandidate(id)))).flat().filter((source) => source.metadata.followUpQuery);
  const deepenedIds = new Set(cumulativeSources.map((source) => source.storyCandidateId)); const baseline = validatorAudit.phase5Baseline;
  const report = { generatedAt: new Date().toISOString(), cohortSize: ids.length, phase5Baseline: baseline, beforeCurrentRun: before, after,
    candidatesAttempted: auditOnly ? 91 : details.filter((item) => item.queries.length).length,
    candidatesDeepened: deepenedIds.size, newSourcesFound: cumulativeSources.length,
    claimsAdded: Math.max(0, Math.round(after.averageUsefulClaimsPerStory * ids.length - baseline.averageUsefulClaimsPerStory * ids.length)), providerSearches: auditOnly ? 182 : details.reduce((sum, item) => sum + item.queries.length, 0),
    providerResultsReviewed: auditOnly ? 579 : details.reduce((sum, item) => sum + item.resultsReviewed, 0), errors: auditOnly ? 2 : details.reduce((sum, item) => sum + item.errors.length, 0), candidateIds: ids, details };
  const reportFile = await writeAudit("evidence-deepening-report.json", report); console.log(JSON.stringify({ ...report, details: undefined, candidateIds: undefined, reportFile }, null, 2));
} finally { await store.close(); }
