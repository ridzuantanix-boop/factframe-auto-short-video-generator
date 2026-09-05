import { readJson, writeAudit } from "./audit-lib.mjs";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { buildMysteryScript, passesQualityGate } from "../src/lib/mystery/storyEngine.ts";
import { researchPackageToStoryRecord } from "../src/lib/research/storyResearch.ts";

const batch = await readJson("audit/research-enrichment-report.json"); const store = createStoryStore();
const packages = []; try { for (const id of batch.candidateIds) { const value = await store.getResearchPackage(id); if (value) packages.push(value); } } finally { await store.close(); }
const requiredTypes = ["DISAPPEARANCE", "MYSTERIOUS_DEATH", "CRIME_MYSTERY", "DISASTER", "PARANORMAL_REPORT", "FOLKLORE", "HISTORICAL_INCIDENT"];
const selected = []; const used = new Set();
for (const type of requiredTypes) {
  const item = packages.find((value) => value.storyType === type && value.readyDecision.status === "READY" && !used.has(value.storyCandidateId))
    ?? packages.find((value) => value.storyType === type && !used.has(value.storyCandidateId));
  if (item) { selected.push(item); used.add(item.storyCandidateId); }
}
const readyExample = packages.find((value) => value.readyDecision.status === "READY" && !used.has(value.storyCandidateId));
if (readyExample) { selected.push(readyExample); used.add(readyExample.storyCandidateId); }
for (const item of packages) { if (selected.length >= 10) break; if (!used.has(item.storyCandidateId)) { selected.push(item); used.add(item.storyCandidateId); } }
const examples = selected.slice(0, 10).map((value) => {
  const story = researchPackageToStoryRecord(value); const script = value.readyDecision.status === "READY" ? buildMysteryScript(story, 30, "DOCUMENTARY", true) : null;
  return { candidate: { id: value.storyCandidateId, title: value.title, storyType: value.storyType, historicalContext: value.historicalContext },
    sources: value.sources, claims: value.claims, timeline: value.timeline, hookCandidates: value.hookCandidates, payoff: value.payoff,
    researchScore: value.researchScore, readyDecision: value.readyDecision, narration: script ? { text: script.segments.map((segment) => segment.text).join(" "), segments: script.segments,
      sourceCoverage: script.sourceCoverage, unsupportedClaims: script.unsupportedClaims, passesQualityGate: passesQualityGate(script) } : null };
});
const invalidLinks = packages.flatMap((value) => { const ids = new Set(value.sources.map((source) => source.id)); return value.claims.filter((claim) => !claim.sourceIds.length || claim.sourceIds.some((id) => !ids.has(id))).map((claim) => claim.id); });
const readyNarrations = examples.filter((item) => item.narration); const report = { generatedAt: new Date().toISOString(), candidatesProcessed: batch.candidatesProcessed,
  claimsExtracted: batch.rawClaimsExtracted, uniqueClaims: batch.totalClaims, claimsMerged: batch.claimsMerged, averageClaimsPerStory: batch.averageClaimsPerStory,
  storiesPromotedReady: batch.storiesPromotedReady, storiesKeptPartial: batch.storiesKeptPartial, averageSourceCoverage: batch.averageSourceCoverage,
  unsupportedClaims: batch.unsupportedClaims, failures: batch.failures, invalidClaimSourceLinks: invalidLinks.length, exportedExamples: examples.length,
  readyExampleNarrations: readyNarrations.length, readyNarrationsPassingQualityGate: readyNarrations.filter((item) => item.narration.passesQualityGate).length };
const examplesFile = await writeAudit("research-examples.json", { generatedAt: report.generatedAt, examples });
const auditFile = await writeAudit("research-audit.json", report); console.log(JSON.stringify({ ...report, examplesFile, auditFile }, null, 2));
if (report.candidatesProcessed < 100) throw new Error("Phase 4 audit requires at least 100 processed candidates.");
if (report.invalidClaimSourceLinks || report.unsupportedClaims) throw new Error("Research audit found unsupported claims or invalid source links.");
if (report.exportedExamples < 10 || !report.readyNarrationsPassingQualityGate) throw new Error("Research audit requires ten examples and at least one READY narration that passes the script quality gate.");
