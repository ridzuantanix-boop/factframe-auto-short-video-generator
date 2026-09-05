import { createStoryStore } from "../src/lib/discovery/store.ts";
import { validateClaimRewrite } from "../src/lib/research/aiClaimValidator.ts";
import { persistResearchClaims } from "../src/lib/research/storyResearch.ts";
import { readJson, writeAudit } from "./audit-lib.mjs";

const apply = process.argv.includes("--apply"); const prior = await readJson("audit/ai-enrichment-report.json");
let persistedAudit = null; try { persistedAudit = await readJson("audit/validator-audit.json"); } catch { /* First audit run has no persisted fallback. */ }
// Human review of all 50 Phase 5 claim attempts. These 14 materially omit an age/count, remove negation,
// are empty/OCR fragments, or replace the original legal/action meaning; the remaining 36 are safe rewrites.
const MANUALLY_TRUE_REJECT_IDS = new Set(["f118ce66492809417729965f2c21996f", "5731d894c6147bf30b4e2eaa4f3609ee", "76e923e8f7c4f901a1f31a4182a195ce",
  "ab82ab5a7e446b4e4961599329fbc59c", "6c6ca8af99e60ccdab114ff4e33b16d2", "3a443ede4c200f8bd8b0bae06ebd5208", "3fe3eae58885a89cef38c871b28ca4ad",
  "e83b4300f99055b54c4fbfc1847b4b38", "72b1bccb2a803e4df8289ab59103dab0", "75afb5a0203d48cccf920acdc8234587", "d5f11415f37c869711e96511570a68ba",
  "45795002648671c375f595355094df4d", "74236e2f995847b87658298d8e4dea2a", "b9c61a29ff1c3dadedd108af25ebd6cb"]);
const store = createStoryStore(); const packages = new Map(); const candidates = new Map(); const sources = new Map();
const reportAttempts = prior.details.flatMap((detail) => detail.failures.filter((failure) => failure.claimId && failure.attemptedSpokenText !== undefined)
  .map((failure) => ({ candidateId: detail.candidateId, title: detail.title, oldReasons: failure.reasons, ...failure })));
// The current AI report is replaced by each controlled pass. Keep this audit reproducible by falling back to the
// already-captured Phase 5 cohort rather than requiring another Gemini run to recreate the original 50 outputs.
const attempts = reportAttempts.length === 50 ? reportAttempts : (persistedAudit?.results ?? []).map((item) => ({
  candidateId: item.candidateId, title: item.title, oldReasons: item.oldReasons, claimId: item.claimId,
  attemptedSpokenText: item.attemptedSpokenText, reasons: item.oldReasons,
}));
try {
  for (const attempt of attempts) { if (packages.has(attempt.candidateId)) continue; packages.set(attempt.candidateId, await store.getResearchPackage(attempt.candidateId));
    candidates.set(attempt.candidateId, await store.findById(attempt.candidateId)); sources.set(attempt.candidateId, await store.listSourcesForCandidate(attempt.candidateId)); }
  const results = attempts.map((attempt) => { const pkg = packages.get(attempt.candidateId); const claim = pkg?.claims.find((item) => item.id === attempt.claimId);
    if (!claim) return { ...attempt, rawClaim: null, status: "UNCERTAIN", validation: null, entityTypeError: false };
    const validation = validateClaimRewrite(claim, { claimId: claim.id, spokenText: attempt.attemptedSpokenText, preservedClaimType: claim.claimType, preservedSourceIds: claim.sourceIds });
    const entityTypeError = attempt.oldReasons.some((reason) => reason.startsWith("named person omitted"))
      && !Object.values(validation.entityTypes ?? {}).includes("PERSON");
    return { ...attempt, rawClaim: claim.claimText, claimType: claim.claimType, sourceIds: claim.sourceIds, status: validation.valid ? "RECOVERED_FALSE_REJECT" : "TRUE_REJECT_RETAINED",
      manualVerdict: MANUALLY_TRUE_REJECT_IDS.has(claim.id) ? "TRUE_REJECT" : "FALSE_REJECT", validation, entityTypeError };
  });
  if (apply) for (const candidateId of [...new Set(results.filter((item) => item.status === "RECOVERED_FALSE_REJECT").map((item) => item.candidateId))]) {
    const pkg = packages.get(candidateId); const candidate = candidates.get(candidateId); if (!pkg || !candidate) continue;
    const byClaim = new Map(results.filter((item) => item.candidateId === candidateId && item.status === "RECOVERED_FALSE_REJECT").map((item) => [item.claimId, item]));
    const claims = pkg.claims.map((claim) => { const recovered = byClaim.get(claim.id); if (!recovered) return claim; return { ...claim, spokenText: recovered.attemptedSpokenText,
      rewriteMethod: "GEMINI", rewriteModel: claim.rewriteModel ?? prior.model ?? null, validatedAt: recovered.validation.checkedAt, validationVersion: recovered.validation.version, validationResult: recovered.validation }; });
    await persistResearchClaims(candidate, sources.get(candidateId), claims, store);
  }
  const recovered = results.filter((item) => item.status === "RECOVERED_FALSE_REJECT").length; const retained = results.filter((item) => item.status === "TRUE_REJECT_RETAINED").length;
  const uncertain = results.filter((item) => item.status === "UNCERTAIN").length; const softWarnings = results.reduce((sum, item) => sum + (item.validation?.softWarnings?.length ?? 0), 0);
  const hardFailures = results.filter((item) => item.validation && !item.validation.valid); const correctHardFailures = hardFailures.filter((item) => item.manualVerdict === "TRUE_REJECT").length;
  const phase5Baseline = reportAttempts.length === 50 ? { cohortSize: prior.cohortSize, validSpokenCoverage: prior.validatedSpokenCoverageAfter,
    averageUsefulClaimsPerStory: prior.eligibleClaimCount / prior.cohortSize, ready: prior.readyAfter, geminiRequestsPerStory: prior.geminiRequests / prior.cohortSize,
    retryRate: prior.geminiRequests ? prior.retryCount / prior.geminiRequests : 0, inputTokens: prior.inputTokens, outputTokens: prior.outputTokens } : persistedAudit?.phase5Baseline;
  const report = { generatedAt: new Date().toISOString(), validationVersion: results.find((item) => item.validation)?.validation.version ?? null,
    phase5Baseline,
    oldRejects: attempts.length, manuallyInspected: results.length, recoveredFalseRejects: recovered, trueRejectsRetained: retained, uncertain,
    hardFailPrecision: hardFailures.length ? Number((correctHardFailures / hardFailures.length).toFixed(3)) : null, falseRejectionRateAmongHardFails: hardFailures.length ? Number(((hardFailures.length - correctHardFailures) / hardFailures.length).toFixed(3)) : 0,
    softWarningCount: softWarnings, entityTypeErrorsRecovered: results.filter((item) => item.entityTypeError && item.status === "RECOVERED_FALSE_REJECT").length,
    numberPreservationIssues: results.filter((item) => item.validation?.hardFails?.some((reason) => /number|age|toll|count/.test(reason))).length,
    datePreservationIssues: results.filter((item) => item.validation?.hardFails?.some((reason) => /date/.test(reason))).length, applied: apply || Boolean(persistedAudit?.applied), results };
  const auditFile = await writeAudit("validator-audit.json", report); console.log(JSON.stringify({ ...report, results: undefined, auditFile }, null, 2));
  if (attempts.length !== 50) throw new Error(`Expected 50 Phase 5 rejected rewrites, found ${attempts.length}.`);
  if (results.some((item) => item.validation && (item.validation.valid === (item.manualVerdict === "TRUE_REJECT")))) throw new Error("Entity-aware validator disagrees with the 50-item manual review.");
} finally { await store.close(); }
