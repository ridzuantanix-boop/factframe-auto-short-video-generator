import { readJson, writeAudit } from "./audit-lib.mjs";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { assessNarrationQuality } from "../src/lib/research/narrationRewriter.ts";

const batch = await readJson("audit/ai-enrichment-report.json"); const store = createStoryStore(); const packages = []; const sources = new Map();
try { for (const id of batch.candidateIds) { const value = await store.getResearchPackage(id); if (value) { packages.push(value); sources.set(id, await store.listSourcesForCandidate(id)); } } } finally { await store.close(); }
const english = /\b(?:the|was|were|is|are|after|before|missing|saved|ship|search|found|body|murder|investigation|reported|yesterday|since|capsized)\b/i;
const ocr = /[�■<>]|\b\d+[a-z]{2,}\b|\b(?:7fwo|whioh|ctfc|lowrtt|iolunes|gintir)\b/i;
const quality = (value) => value.narrationQuality ?? assessNarrationQuality(value.claims); const narratedPackages = packages.filter((value) => value.claims.some((claim) => claim.spokenText));
const spoken = packages.flatMap((value) => value.claims.map((claim) => claim.spokenText).filter(Boolean)); const ready = packages.filter((value) => value.readyDecision.status === "READY");
const invalidLinks = packages.flatMap((value) => { const ids = new Set(value.sources.map((source) => source.id)); return value.claims.filter((claim) => !claim.sourceIds.length || claim.sourceIds.some((id) => !ids.has(id))); });
const detail = new Map(batch.details.map((item) => [item.candidateId, item])); const failed = batch.details.filter((item) => item.failures.length || item.rejected);
const best = [...ready].sort((a, b) => quality(b).spokenNaturalnessScore - quality(a).spokenNaturalnessScore).slice(0, 10);
const rejected = failed.slice(0, 10); const packageIds = new Set(packages.map((item) => item.storyCandidateId));
const selectedIds = [...new Set([...best.map((item) => item.storyCandidateId), ...rejected.map((item) => item.candidateId).filter((id) => packageIds.has(id))])];
for (const item of packages) { if (selectedIds.length >= 20) break; if (!selectedIds.includes(item.storyCandidateId)) selectedIds.push(item.storyCandidateId); }
const examples = selectedIds.slice(0, 20).map((id) => { const value = packages.find((item) => item.storyCandidateId === id); if (!value) return null; const run = detail.get(id);
  return { candidateId: id, title: value.title, storyType: value.storyType, rawSources: (sources.get(id) ?? []).map((source) => ({ id: source.id, title: source.title,
    rawSnippet: source.metadata.rawSnippet ?? source.snippet, expandedSnippet: source.metadata.expandedSnippet ?? null, url: source.url })),
    claims: value.claims.map((claim) => ({ claimId: claim.id, rawClaim: claim.claimText, deterministicSpokenText: claim.rewriteMethod === "DETERMINISTIC" ? claim.spokenText : "",
      geminiSpokenText: claim.rewriteMethod === "GEMINI" ? claim.spokenText : "", validationResult: claim.validationResult, claimType: claim.claimType, sourceIds: claim.sourceIds })),
    finalNarration: value.aiNarration?.segments ?? null, readyDecision: value.readyDecision, clusterConfidence: value.clusterConfidence,
    narrationQuality: quality(value), failures: run?.failures ?? [] }; }).filter(Boolean);
const languagePass = narratedPackages.filter((value) => quality(value).passes).length; const report = { generatedAt: new Date().toISOString(), cohortSize: batch.cohortSize,
  deterministicSpokenCoverageBefore: batch.deterministicSpokenCoverageBefore, validatedSpokenCoverageAfter: batch.validatedSpokenCoverageAfter,
  geminiRequests: batch.geminiRequests, successfulClaimRewrites: batch.claimsSafelyRewritten, rejectedRewrites: batch.rejectedRewrites,
  retryCount: batch.retryCount, readyBefore: batch.readyBefore, readyAfter: batch.readyAfter, unsupportedClaims: invalidLinks.length,
  languageQualityPassRate: narratedPackages.length ? Number((languagePass / narratedPackages.length).toFixed(3)) : 0,
  averageNaturalness: narratedPackages.length ? Number((narratedPackages.reduce((sum, value) => sum + quality(value).spokenNaturalnessScore, 0) / narratedPackages.length).toFixed(3)) : 0,
  englishLeakageCount: spoken.filter((text) => english.test(text)).length, ocrLeakageCount: spoken.filter((text) => ocr.test(text)).length,
  inputTokens: batch.inputTokens, outputTokens: batch.outputTokens, averageClaimsPerRequest: batch.averageClaimsPerRequest,
  storiesGeneratedPerRequest: batch.storiesGeneratedPerRequest, cacheHitRate: batch.cacheHitRate, bestReadyExamples: best.length,
  rejectedOrFailedExamples: rejected.length, exportedExamples: examples.length };
const examplesFile = await writeAudit("ai-enrichment-examples.json", { generatedAt: report.generatedAt, examples }); const auditFile = await writeAudit("ai-enrichment-audit.json", report);
console.log(JSON.stringify({ ...report, examplesFile, auditFile }, null, 2));
if (invalidLinks.length) throw new Error("AI enrichment produced unsupported source links.");
if (ready.some((value) => !quality(value).passes) || spoken.filter((text) => english.test(text) || ocr.test(text)).length) throw new Error("AI enrichment leaked English/OCR or promoted bad narration.");
if (examples.length < Math.min(20, packages.length)) throw new Error("AI audit did not export the required examples.");
