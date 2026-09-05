import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import type { StoryIndexStatus } from "../types.ts";
import { createGeminiGateway, enrichCandidateWithAi, type AiGateway } from "./aiEnrichment.ts";

type BatchDetail = { candidateId: string; title: string; storyType: string; status: string; claimsSent: number; rewritten: number; rejected: number; retries: number;
  cacheHits: number; storyCacheHit: boolean; storyGenerated: boolean; sourcePagesAttempted: number; sourcesDeepened: number;
  usage: { requests: number; inputTokens: number; outputTokens: number }; failures: Array<{ claimId?: string; attemptedSpokenText?: string; reasons: string[] }> };

export type AiBatchOptions = { limit?: number; status?: StoryIndexStatus | "ALL"; region?: string; category?: string; minSources?: number; minClaims?: number;
  concurrency?: number; delayMs?: number; candidateIds?: string[]; gateway?: AiGateway | null; store?: StoryStore };
const TYPES = ["DISAPPEARANCE", "CRIME_MYSTERY", "MYSTERIOUS_DEATH", "DISASTER", "HISTORICAL_INCIDENT", "PARANORMAL_REPORT", "FOLKLORE"];
function diverse<T extends { id: string; storyType: string }>(items: T[], limit: number) {
  const output: T[] = []; const used = new Set<string>();
  for (const type of TYPES) { const item = items.find((value) => value.storyType === type); if (item) { output.push(item); used.add(item.id); } }
  for (const item of items) { if (output.length >= limit) break; if (!used.has(item.id)) { output.push(item); used.add(item.id); } } return output.slice(0, limit);
}
function eligibleClaims(packages: Array<{ claims: Array<{ spokenText: string; rewriteMethod: string; confidence: string; ocrQuality: number }> }>) {
  return packages.flatMap((item) => item.claims).filter((claim) => claim.confidence !== "LOW" && claim.ocrQuality >= .65);
}
function coverage(packages: Array<{ claims: Array<{ spokenText: string; rewriteMethod: string; confidence: string; ocrQuality: number }> }>, methods?: string[]) {
  const claims = eligibleClaims(packages); const spoken = claims.filter((claim) => claim.spokenText && (!methods || methods.includes(claim.rewriteMethod)));
  return claims.length ? Number((spoken.length / claims.length).toFixed(3)) : 0;
}

export async function enrichAiBatch(options: AiBatchOptions = {}) {
  const store = options.store ?? createStoryStore(); const owns = !options.store; await store.migrate(); const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const all = options.candidateIds?.length ? await store.listResearchCandidatesByIds(options.candidateIds)
    : await store.listResearchCandidates({ status: options.status ?? "PARTIAL", region: options.region, category: options.category,
      minSources: options.minSources ?? 1, minClaims: options.minClaims ?? 1, limit: 500 });
  const filtered = all.filter((item) => (options.status ?? "PARTIAL") === "ALL" || item.status === (options.status ?? "PARTIAL"))
    .filter((item) => item.sourceCount >= (options.minSources ?? 1) && item.claimCount >= (options.minClaims ?? 1));
  const candidates = diverse(filtered, limit); const beforePackages = (await Promise.all(candidates.map((item) => store.getResearchPackage(item.id)))).filter(Boolean);
  const readyBefore = beforePackages.filter((item) => item.readyDecision.status === "READY").length; const gateway = options.gateway === undefined ? createGeminiGateway() : options.gateway;
  let cursor = 0; const details: BatchDetail[] = []; const concurrency = Math.min(2, Math.max(1, options.concurrency ?? 1));
  const delayMs = Math.max(0, Math.min(60_000, options.delayMs ?? 3500));
  async function worker() { while (cursor < candidates.length) { const candidate = candidates[cursor++]; try {
    const result = await enrichCandidateWithAi(candidate.id, gateway, store); details.push({ candidateId: candidate.id, title: candidate.title, storyType: candidate.storyType,
      status: result.package.readyDecision.status, claimsSent: result.claimsSent, rewritten: result.rewritten, rejected: result.rejected, retries: result.retries,
      cacheHits: result.cacheHits, storyCacheHit: result.storyCacheHit, storyGenerated: result.storyGenerated, sourcePagesAttempted: result.sourcePagesAttempted,
      sourcesDeepened: result.sourcesDeepened, usage: result.usage, failures: result.failures });
  } catch (error) { details.push({ candidateId: candidate.id, title: candidate.title, storyType: candidate.storyType, status: "PARTIAL", claimsSent: 0, rewritten: 0,
    rejected: 0, retries: 0, cacheHits: 0, storyCacheHit: false, storyGenerated: false, sourcePagesAttempted: 0, sourcesDeepened: 0,
    usage: { requests: 0, inputTokens: 0, outputTokens: 0 }, failures: [{ reasons: [error instanceof Error ? error.message : "AI enrichment failed"] }] }); }
    if (delayMs && details.find((item) => item.candidateId === candidate.id)?.usage.requests) await new Promise((resolve) => setTimeout(resolve, delayMs)); } }
  try { await Promise.all(Array.from({ length: concurrency }, () => worker())); const afterPackages = (await Promise.all(candidates.map((item) => store.getResearchPackage(item.id)))).filter(Boolean);
    const requests = details.reduce((sum, item) => sum + item.usage.requests, 0); const claimsSent = details.reduce((sum, item) => sum + item.claimsSent, 0);
    const cacheHits = details.reduce((sum, item) => sum + item.cacheHits + Number(item.storyCacheHit), 0); const generatedStories = details.filter((item) => item.storyGenerated && !item.storyCacheHit).length;
    const eligibleAfter = eligibleClaims(afterPackages); const validatedGeminiClaims = eligibleAfter.filter((claim) => claim.spokenText && claim.rewriteMethod === "GEMINI").length;
    return { generatedAt: new Date().toISOString(), model: gateway?.model ?? null, geminiAvailable: Boolean(gateway), cohortSize: candidates.length,
      candidateIds: candidates.map((item) => item.id), storyTypes: Object.fromEntries(TYPES.map((type) => [type, candidates.filter((item) => item.storyType === type).length])),
      deterministicSpokenCoverageBefore: coverage(beforePackages, ["DETERMINISTIC"]), validatedSpokenCoverageAfter: coverage(afterPackages, ["DETERMINISTIC", "GEMINI"]),
      eligibleClaimCount: eligibleAfter.length, readyBefore, readyAfter: afterPackages.filter((item) => item.readyDecision.status === "READY").length, claimsSent,
      claimsSafelyRewritten: validatedGeminiClaims, claimsSafelyRewrittenThisRun: details.reduce((sum, item) => sum + item.rewritten, 0),
      rejectedRewrites: details.reduce((sum, item) => sum + item.rejected, 0),
      retryCount: details.reduce((sum, item) => sum + item.retries, 0), geminiRequests: requests, averageClaimsPerRequest: requests ? Number((claimsSent / requests).toFixed(3)) : 0,
      inputTokens: details.reduce((sum, item) => sum + item.usage.inputTokens, 0), outputTokens: details.reduce((sum, item) => sum + item.usage.outputTokens, 0),
      storiesGenerated: generatedStories, storiesGeneratedPerRequest: requests ? Number((generatedStories / requests).toFixed(3)) : 0,
      cacheHits, cacheHitRate: claimsSent + cacheHits ? Number((cacheHits / (claimsSent + cacheHits)).toFixed(3)) : 0,
      sourcePagesAttempted: details.reduce((sum, item) => sum + item.sourcePagesAttempted, 0), sourcesDeepened: details.reduce((sum, item) => sum + item.sourcesDeepened, 0), details };
  } finally { if (owns) await store.close(); }
}
