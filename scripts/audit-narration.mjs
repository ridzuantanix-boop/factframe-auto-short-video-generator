import { readJson, writeAudit } from "./audit-lib.mjs";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { buildMysteryScript, passesQualityGate } from "../src/lib/mystery/storyEngine.ts";
import { researchPackageToStoryRecord } from "../src/lib/research/storyResearch.ts";

const batch = await readJson("audit/research-enrichment-report.json"); const repair = await readJson("audit/cluster-repair-report.json");
const store = createStoryStore(); const packages = []; const rawSources = new Map();
try { for (const id of batch.candidateIds) { const value = await store.getResearchPackage(id); if (value) { packages.push(value); rawSources.set(id, await store.listSourcesForCandidate(id)); } } } finally { await store.close(); }
const english = /\b(?:the|was|were|is|are|after|before|missing|saved|ship|search|still|found|body|murder|investigation|arrested|reported|yesterday|since|capsized|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const ocr = /[�■<>]|\b\d+[a-z]{2,}\b|\b(?:7fwo|whioh|ctfc|lowrtt|iolunes|gintir)\b/i;
const spoken = packages.flatMap((value) => value.claims.map((claim) => claim.spokenText).filter(Boolean));
const narratable = packages.filter((value) => value.claims.some((claim) => Boolean(claim.spokenText)));
const ready = packages.filter((value) => value.readyDecision.status === "READY");
const built = ready.map((value) => { const script = buildMysteryScript(researchPackageToStoryRecord(value), 30, "DOCUMENTARY", true); return { value, script }; });
const required = ["DISAPPEARANCE", "MYSTERIOUS_DEATH", "CRIME_MYSTERY", "DISASTER", "PARANORMAL_REPORT", "FOLKLORE", "HISTORICAL_INCIDENT"];
const selected = []; const used = new Set(); const sarawak = packages.find((value) => /boat helmsman/i.test(value.title));
if (sarawak) { selected.push(sarawak); used.add(sarawak.storyCandidateId); }
for (const type of required) { const item = packages.find((value) => value.storyType === type && !used.has(value.storyCandidateId)); if (item) { selected.push(item); used.add(item.storyCandidateId); } }
for (const item of packages) { if (selected.length >= 10) break; if (!used.has(item.storyCandidateId)) { selected.push(item); used.add(item.storyCandidateId); } }
const examples = selected.slice(0, Math.max(10, selected.length)).map((value) => {
  const match = built.find((item) => item.value.storyCandidateId === value.storyCandidateId);
  return { candidateId: value.storyCandidateId, title: value.title, storyType: value.storyType, clusterConfidence: value.clusterConfidence,
    sources: (rawSources.get(value.storyCandidateId) ?? []).map((source) => ({ id: source.id, title: source.title, publisher: source.publisher,
      url: source.url, date: source.publishedAt, rawSnippet: source.snippet })),
    before: value.claims.map((claim) => ({ claimText: claim.claimText, sourceIds: claim.sourceIds })),
    after: value.claims.map((claim) => ({ spokenText: claim.spokenText, sourceIds: claim.sourceIds })),
    finalNarration: match?.script.segments.map((segment) => segment.text).join(" ") ?? value.claims.map((claim) => claim.spokenText).filter(Boolean).join(" "),
    narrationQuality: value.narrationQuality, readyDecision: value.readyDecision,
    scriptQuality: match ? { storytellingScore: match.script.storytellingScore, structureScore: match.script.structureScore,
      sourceQualityScore: match.script.sourceQualityScore, narrationQualityScore: match.script.narrationQualityScore,
      repetitionScore: match.script.repetitionScore, passes: passesQualityGate(match.script) } : null };
});
const confidence = packages.reduce((counts, value) => ({ ...counts, [value.clusterConfidence]: (counts[value.clusterConfidence] ?? 0) + 1 }), {});
const report = { generatedAt: new Date().toISOString(), originalCandidatesChecked: repair.originalCandidatesChecked,
  resultingCandidatesChecked: packages.length, suspiciousClustersFound: repair.suspiciousClustersFound, candidatesSplit: repair.candidatesSplit,
  newClustersCreated: repair.newClustersCreated, sourcesReassigned: repair.sourcesReassigned, claimsBefore: repair.claimsBefore,
  claimsAfter: packages.reduce((sum, value) => sum + value.claims.length, 0), readyBefore: repair.readyBefore, readyAfter: ready.length,
  narratablePackages: narratable.length, spokenClaimCoverage: Number((packages.reduce((sum, value) => sum + value.claims.filter((claim) => Boolean(claim.spokenText)).length, 0) / Math.max(1, packages.reduce((sum, value) => sum + value.claims.length, 0))).toFixed(3)),
  malayLanguageRatio: narratable.length ? Number((narratable.reduce((sum, value) => sum + value.narrationQuality.malayLanguageRatio, 0) / narratable.length).toFixed(3)) : 0,
  spokenNaturalnessScore: narratable.length ? Number((narratable.reduce((sum, value) => sum + value.narrationQuality.spokenNaturalnessScore, 0) / narratable.length).toFixed(3)) : 0,
  rawEnglishLeakageCount: spoken.filter((text) => english.test(text)).length, ocrLeakageCount: spoken.filter((text) => ocr.test(text)).length,
  clusterConfidenceDistribution: confidence, readyNarrationsPassing: built.filter((item) => passesQualityGate(item.script)).length,
  readyNarrationsFailing: built.filter((item) => !passesQualityGate(item.script)).length, exportedExamples: examples.length };
const examplesFile = await writeAudit("narration-examples.json", { generatedAt: report.generatedAt, examples });
const auditFile = await writeAudit("narration-audit.json", report); console.log(JSON.stringify({ ...report, examplesFile, auditFile }, null, 2));
if (packages.length < 100 || examples.length < 10) throw new Error("Narration audit requires the repaired 100-candidate cohort and ten examples.");
if (!ready.length || report.readyNarrationsFailing || report.rawEnglishLeakageCount || report.ocrLeakageCount) throw new Error("READY narration leaked English/OCR or failed a quality gate.");
if (!sarawak || sarawak.readyDecision.status !== "READY" || sarawak.narrationQuality.passes !== true) throw new Error("Sarawak boat story is not READY with natural Malay narration.");
