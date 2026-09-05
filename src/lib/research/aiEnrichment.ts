import { GoogleGenAI } from "@google/genai";
import type { StoryCandidate } from "../types.ts";
import type { StoredStorySource } from "../archive/types.ts";
import { validateSourceCluster } from "../archive/clusterIntegrity.ts";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import { assessNarrationQuality } from "./narrationRewriter.ts";
import { CLAIM_VALIDATION_VERSION, validateRewriteSet, type AiClaimRewrite } from "./aiClaimValidator.ts";
import { persistResearchClaims, researchStoryCandidate } from "./storyResearch.ts";
import { deepenLinkedSources } from "./sourceDeepening.ts";
import type { AiNarration, AiNarrationSegment, ResearchClaim } from "./types.ts";

export type AiUsage = { requests: number; inputTokens: number; outputTokens: number };
export type AiGateway = {
  model: string;
  rewrite(claims: ResearchClaim[], sources: StoredStorySource[], candidate: StoryCandidate, correction?: Record<string, string[]>): Promise<{ outputs: AiClaimRewrite[]; usage: AiUsage }>;
  writeStory(claims: ResearchClaim[], candidate: StoryCandidate): Promise<{ segments: AiNarrationSegment[]; usage: AiUsage }>;
};

const rewriteSchema = { type: "object", properties: { rewrites: { type: "array", items: { type: "object", properties: {
  claimId: { type: "string" }, spokenText: { type: "string" }, preservedClaimType: { type: "string", enum: ["VERIFIED", "REPORTED", "DISPUTED", "UNRESOLVED", "FOLKLORE", "THEORY", "EXPLAINED_LATER"] },
  preservedSourceIds: { type: "array", items: { type: "string" } } }, required: ["claimId", "spokenText", "preservedClaimType", "preservedSourceIds"] } } }, required: ["rewrites"] };
const storySchema = { type: "object", properties: { segments: { type: "array", items: { type: "object", properties: {
  role: { type: "string", enum: ["HOOK", "CONTEXT", "DEVELOPMENT", "TURN_PAYOFF"] }, text: { type: "string" }, claimIds: { type: "array", items: { type: "string" } },
  sourceIds: { type: "array", items: { type: "string" } } }, required: ["role", "text", "claimIds", "sourceIds"] } } }, required: ["segments"] };

function usage(response: { usage?: { total_input_tokens?: number; total_output_tokens?: number } }): AiUsage {
  return { requests: 1, inputTokens: response.usage?.total_input_tokens ?? 0, outputTokens: response.usage?.total_output_tokens ?? 0 };
}
export function createGeminiGateway(apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_TEXT_MODEL || "gemini-3.7-flash"): AiGateway | null {
  if (!apiKey || process.env.DEMO_MODE === "true") return null; const client = new GoogleGenAI({ apiKey });
  return { model,
    async rewrite(claims, sources, candidate, correction = {}) {
      const sourceIds = new Set(sources.map((source) => source.id));
      const input = claims.map((claim) => ({ id: claim.id, claimText: claim.claimText, claimType: claim.claimType, confidence: claim.confidence,
        sourceIds: (claim.sourceIds ?? []).filter((id) => sourceIds.has(id)), date: claim.eventDate ?? null, people: claim.people ?? [], locations: claim.locations ?? [],
        storyType: candidate.storyType, historicalContext: candidate.metadata.historicalContext ?? null }));
      const correctionText = Object.keys(correction).length ? ` PEMBETULAN KHUSUS SETIAP CLAIM=${JSON.stringify(correction)}. Ikut pembetulan claimId masing-masing sahaja.` : "";
      const prompt = `Tulis semula setiap claim sebagai SATU ayat lisan Bahasa Melayu Malaysia yang ringkas dan semula jadi. Claim ialah satu-satunya fakta; jangan tambah nama, nombor, tarikh, lokasi, sebab, motif, emosi, urutan atau hasil. Kekalkan claimId, claimType dan sourceIds tepat. Jangan terjemah nama khas. REPORTED mesti menyatakan ia laporan/dakwaan. FOLKLORE mesti kekal legenda/cerita rakyat. UNRESOLVED mesti kekal belum pasti/masih hilang. Jika teks kabur, pulangkan spokenText kosong. Elak bahasa Indonesia, tajuk huruf besar, dateline dan serpihan OCR.${correctionText}\nINPUT=${JSON.stringify(input)}`;
      const response = await client.interactions.create({ model, input: prompt, response_format: { type: "text", mime_type: "application/json", schema: rewriteSchema } });
      const parsed = JSON.parse(response.output_text ?? "{}") as { rewrites?: AiClaimRewrite[] };
      return { outputs: Array.isArray(parsed.rewrites) ? parsed.rewrites : [], usage: usage(response) };
    },
    async writeStory(claims, candidate) {
      const approved = claims.filter((claim) => claim.spokenText).map((claim) => ({ claimId: claim.id, spokenText: claim.spokenText, claimType: claim.claimType,
        sourceIds: claim.sourceIds ?? [], date: claim.eventDate ?? null, people: claim.people ?? [], locations: claim.locations ?? [] }));
      const prompt = `Susun dokumentari pendek Bahasa Melayu Malaysia menggunakan HANYA approved claims ini. Jangan tambah motif, emosi, kronologi, sebab, hasil, lokasi, nama atau unsur ghaib. Hasilkan empat segmen: HOOK, CONTEXT, DEVELOPMENT, TURN_PAYOFF. Soalan/open loop tidak wajib dan jangan cipta satu segmen khas untuknya. Setiap segmen mesti menyenaraikan claimIds yang digunakan dan sourceIds mesti tepat sebagai gabungan sourceIds claim tersebut. Kekalkan status laporan, legenda dan belum selesai. Ayat pendek, manusiawi, tanpa "Tahukah anda", "Ini ialah kisah", atau "Rekod arkib membuka".\nCONTEXT=${JSON.stringify({ title: candidate.title, storyType: candidate.storyType, historicalContext: candidate.metadata.historicalContext ?? null, approvedClaims: approved })}`;
      const response = await client.interactions.create({ model, input: prompt, response_format: { type: "text", mime_type: "application/json", schema: storySchema } });
      const parsed = JSON.parse(response.output_text ?? "{}") as { segments?: AiNarrationSegment[] };
      return { segments: Array.isArray(parsed.segments) ? parsed.segments : [], usage: usage(response) };
    } };
}

function validateStorySegments(segments: AiNarrationSegment[], claims: ResearchClaim[]) {
  const reasons: string[] = []; const known = new Map(claims.map((claim) => [claim.id, claim])); const required = ["HOOK", "CONTEXT", "DEVELOPMENT", "TURN_PAYOFF"];
  if (segments.length !== 4 || required.some((role) => !segments.some((segment) => segment.role === role))) reasons.push("required story roles missing");
  const english = /\b(?:the|was|were|is|are|after|before|missing|saved|ship|search|found|body|murder|investigation|reported|yesterday|since)\b/i;
  for (const segment of segments) {
    if (!segment.claimIds.length || segment.claimIds.some((id) => !known.has(id))) { reasons.push("unknown or missing story claim ID"); continue; }
    const expectedSources = [...new Set(segment.claimIds.flatMap((id) => known.get(id)?.sourceIds ?? []))].sort();
    if (expectedSources.length !== segment.sourceIds.length || expectedSources.some((id) => !segment.sourceIds.includes(id))) reasons.push("story source IDs changed");
    const inputText = segment.claimIds.map((id) => known.get(id)?.claimText ?? "").join(" ");
    const allowedNumbers = new Set(inputText.match(/\b\d+\b/g) ?? []); if ((segment.text.match(/\b\d+\b/g) ?? []).some((number) => !allowedNumbers.has(number))) reasons.push("story added a number");
    if (english.test(segment.text) || !/[.!?]$/.test(segment.text.trim())) reasons.push("story language quality failed");
    const types = segment.claimIds.map((id) => known.get(id)?.claimType);
    if (types.includes("FOLKLORE") && !/legenda|cerita rakyat|cerita yang tersebar/i.test(segment.text)) reasons.push("story asserted folklore as fact");
    if (types.includes("REPORTED") && !/laporan|dilaporkan|mendakwa|direkodkan|menurut/i.test(segment.text)) reasons.push("story asserted a report as fact");
    if (types.includes("UNRESOLVED") && !/masih|belum|hilang|tidak diketahui|tidak dapat dipastikan/i.test(segment.text)) reasons.push("story removed uncertainty");
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export type EnrichAiResult = { package: Awaited<ReturnType<typeof persistResearchClaims>>; usage: AiUsage; claimsSent: number; rewritten: number; rejected: number; retries: number;
  primaryRewriteRequests: number; retryRequests: number; storyRequests: number; cacheHits: number; storyCacheHit: boolean; storyGenerated: boolean; sourcePagesAttempted: number; sourcesDeepened: number;
  failures: Array<{ claimId?: string; attemptedSpokenText?: string; reasons: string[] }> };

export async function enrichCandidateWithAi(candidateId: string, gateway: AiGateway | null = createGeminiGateway(), store: StoryStore = createStoryStore(),
  options: { newSourceClaimsOnly?: boolean } = {}): Promise<EnrichAiResult> {
  const candidate = await store.findById(candidateId); if (!candidate) throw new Error(`Story candidate not found: ${candidateId}`);
  let existing = await store.getResearchPackage(candidate.id); if (!existing) throw new Error("Run deterministic research before AI enrichment.");
  let sources = await store.listSourcesForCandidate(candidate.id); const deepening = await deepenLinkedSources(sources, store);
  if (deepening.enriched) { existing = (await researchStoryCandidate(candidate.id, store)).researchPackage; sources = await store.listSourcesForCandidate(candidate.id); }
  const usageTotal: AiUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
  let primaryRewriteRequests = 0; let retryRequests = 0; let storyRequests = 0;
  const callRewrite = async (items: ResearchClaim[], correction?: Record<string, string[]>) => { usageTotal.requests += 1; if (correction) retryRequests += 1; else primaryRewriteRequests += 1;
    const response = await gateway!.rewrite(items, sources, candidate, correction);
    usageTotal.inputTokens += response.usage.inputTokens; usageTotal.outputTokens += response.usage.outputTokens; return response; };
  const callStory = async (items: ResearchClaim[]) => { usageTotal.requests += 1; storyRequests += 1; const response = await gateway!.writeStory(items, candidate);
    usageTotal.inputTokens += response.usage.inputTokens; usageTotal.outputTokens += response.usage.outputTokens; return response; };
  const claims = existing.claims.map((claim) => ({ ...claim, rewriteMethod: claim.rewriteMethod ?? (claim.spokenText ? "DETERMINISTIC" : "NONE"),
    rewriteModel: claim.rewriteModel ?? null, validatedAt: claim.validatedAt ?? null, validationVersion: claim.validationVersion ?? null,
    validationResult: claim.validationResult ?? null }));
  for (const claim of claims.filter((item) => item.rewriteMethod === "GEMINI" && item.spokenText && item.validationVersion !== CLAIM_VALIDATION_VERSION)) {
    const validation = validateRewriteSet([claim], [{ claimId: claim.id, spokenText: claim.spokenText, preservedClaimType: claim.claimType, preservedSourceIds: claim.sourceIds }]).accepted[0]?.result;
    if (validation) { claim.validatedAt = validation.checkedAt; claim.validationVersion = validation.version; claim.validationResult = validation; }
    else { claim.spokenText = ""; claim.rewriteMethod = "NONE"; claim.rewriteModel = null; claim.validatedAt = null; claim.validationVersion = null; claim.validationResult = null; }
  }
  const cached = claims.filter((claim) => claim.rewriteMethod === "GEMINI" && claim.spokenText && claim.validationResult?.valid && claim.validationVersion === CLAIM_VALIDATION_VERSION);
  const followUpSourceIds = new Set(sources.filter((source) => source.metadata.followUpQuery).map((source) => source.id));
  const pending = claims.filter((claim) => !claim.spokenText && claim.confidence !== "LOW" && claim.ocrQuality >= .65
    && (!options.newSourceClaimsOnly || claim.sourceIds.some((id) => followUpSourceIds.has(id)))); const failures: Array<{ claimId?: string; attemptedSpokenText?: string; reasons: string[] }> = [];
  let rewritten = 0; let rejected = 0; let retries = 0;
  if (gateway && pending.length) {
    try { let response = await callRewrite(pending); let validation = validateRewriteSet(pending, response.outputs);
      const accept = (items: typeof validation.accepted) => { for (const item of items) { const target = claims.find((claim) => claim.id === item.claim.id)!;
        target.spokenText = item.output.spokenText.trim(); target.rewriteMethod = "GEMINI"; target.rewriteModel = gateway.model; target.validatedAt = item.result.checkedAt;
        target.validationVersion = item.result.version; target.validationResult = item.result; rewritten += 1; } };
      accept(validation.accepted);
      if (validation.rejected.length) {
        const initialRejected = validation.rejected; const retryable = initialRejected.filter((item) => item.claim && item.output?.spokenText && item.result.reasons.length <= 2
          && item.result.reasons.some((reason) => /number|date|uncertainty|reported|folklore|negation|omitted|changed/.test(reason)));
        const retryIds = new Set(retryable.map((item) => item.claim!.id)); const finalRejected = initialRejected.filter((item) => !item.claim || !retryIds.has(item.claim.id));
        const retryClaims = retryable.flatMap((item) => item.claim ? [item.claim] : []); if (retryClaims.length) { retries += 1;
          const corrections = Object.fromEntries(retryable.map((item) => [item.claim!.id, item.result.reasons])); response = await callRewrite(retryClaims, corrections);
          validation = validateRewriteSet(retryClaims, response.outputs); accept(validation.accepted); finalRejected.push(...validation.rejected); }
        rejected += finalRejected.length; failures.push(...finalRejected.map((item) => ({ claimId: item.claim?.id, attemptedSpokenText: item.output?.spokenText, reasons: item.result.reasons })));
      }
    } catch (error) { rejected += pending.length - rewritten; failures.push({ reasons: [error instanceof Error ? error.message : "Gemini rewrite unavailable"] }); }
  }
  let aiNarration: AiNarration | undefined; let storyCacheHit = false; const quality = assessNarrationQuality(claims); const coherent = validateSourceCluster(sources);
  const useful = claims.filter((claim) => claim.spokenText && claim.confidence !== "LOW" && claim.ocrQuality >= .65);
  if (existing.aiNarration?.validationVersion === CLAIM_VALIDATION_VERSION && validateStorySegments(existing.aiNarration.segments, useful).valid) { aiNarration = existing.aiNarration; storyCacheHit = true; }
  else if (gateway && (!options.newSourceClaimsOnly || rewritten > 0) && useful.length >= 3 && quality.passes && coherent.confidence !== "LOW" && !existing.requiresCurrentVerification) {
    try { const story = await callStory(useful); const validation = validateStorySegments(story.segments, useful);
      if (validation.valid) aiNarration = { segments: story.segments, model: gateway.model, generatedAt: new Date().toISOString(), validationVersion: CLAIM_VALIDATION_VERSION,
        requestCount: story.usage.requests, inputTokens: story.usage.inputTokens, outputTokens: story.usage.outputTokens };
      else failures.push({ reasons: validation.reasons });
    } catch (error) { failures.push({ reasons: [error instanceof Error ? error.message : "story generation failed"] }); }
  }
  const packageValue = await persistResearchClaims(candidate, sources, claims, store, aiNarration);
  return { package: packageValue, usage: usageTotal, claimsSent: pending.length, rewritten, rejected, retries, primaryRewriteRequests, retryRequests, storyRequests, cacheHits: cached.length, storyCacheHit,
    storyGenerated: Boolean(aiNarration), sourcePagesAttempted: deepening.attempted, sourcesDeepened: deepening.enriched, failures };
}
