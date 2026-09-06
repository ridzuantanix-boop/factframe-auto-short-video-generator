import { createHash } from "node:crypto";
import type { ArchiveDocument, DiscoveryProvider, StoredStorySource } from "../archive/types.ts";
import type { StoryCandidate } from "../types.ts";
import type { StoryStore } from "../discovery/store.ts";
import type { ResearchClaim, ResearchPackage, StoryCaseState, VerificationStatus, VerificationType } from "./types.ts";
import { logFailure } from "../server/structuredLog.ts";

export const FOLLOW_UP_WINDOWS_DAYS = [1, 7, 30, 365] as const;
const PENDING = /\b(?:missing|hilang|search(?:ing)?|pencarian|investigat(?:e|ion|ing)|siasatan|unknown|tidak diketahui|awaiting|pending|belum ditemui|masih dicari|trial pending|accused|suspected|arrested|charged|didakwa|disyaki|ditangkap|direman)\b/i;
const RESOLVED = /\b(?:found|ditemui|dijumpai|recovered|identified|resolved|explained|survived|selamat|convicted|disabitkan|acquitted|dibebaskan|case closed)\b/i;
const GENERIC = new Set("the and with from into near after before reported report missing search investigation case incident accident crash found malaysia malaya sarawak sabah people person yesterday today".split(" "));
const CURRENT_TTL_SECONDS = 7 * 24 * 60 * 60;

function tokens(value: string) { return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2 && !GENERIC.has(token)); }
function timestamp(value: string | null | undefined) { const result = value ? Date.parse(value) : Number.NaN; return Number.isFinite(result) ? result : null; }
function claimText(claim: ResearchClaim) { return `${claim.claimText} ${claim.spokenText}`; }
function pendingState(value: string): StoryCaseState {
  if (/trial pending|accused|suspected|arrested|charged|didakwa|disyaki|ditangkap|direman/i.test(value)) return "TRIAL_PENDING";
  if (/investigat|siasatan/i.test(value)) return "INVESTIGATION_ONGOING";
  if (/search|pencarian|dicari/i.test(value)) return "SEARCH_ONGOING";
  if (/reported missing/i.test(value)) return "REPORTED_MISSING";
  if (/missing|hilang/i.test(value)) return "MISSING";
  if (/cause unknown/i.test(value)) return "CAUSE_UNKNOWN";
  if (/awaiting|pending/i.test(value)) return "AWAITING_RESULT";
  return "UNRESOLVED";
}

export function requiresFollowUp(claims: ResearchClaim[]) {
  return claims.some((claim) => claim.claimType === "UNRESOLVED" || PENDING.test(claimText(claim)));
}

export function buildFollowUpQuery(candidate: Pick<StoryCandidate, "title" | "summary" | "region">, pkg: Pick<ResearchPackage, "people" | "locations" | "claims">, sources: StoredStorySource[]) {
  const sourceText = sources.map((source) => `${source.title} ${source.snippet}`).join(" ");
  const years = sources.map((source) => source.publishedAt?.slice(0, 4)).filter(Boolean);
  const identifiers = [...pkg.people.flatMap(tokens), ...tokens(`${candidate.title} ${candidate.summary} ${sourceText}`),
    ...pkg.locations.flatMap(tokens), ...years.map(String)];
  return [...new Set(identifiers)].slice(0, 10).join(" ");
}

export type VerificationSnapshot = {
  caseStateAtSourceTime: StoryCaseState; latestKnownState: StoryCaseState; resolutionClaimIds: string[]; resolutionSourceIds: string[];
  resolvedAt: string | null; verificationStatus: VerificationStatus; verificationType: VerificationType; verifiedAt: string | null;
  verificationTTL: number | null; nextVerificationDue: string | null; requiresCurrentVerification: boolean;
};

export function evaluateVerification(claims: ResearchClaim[], sources: StoredStorySource[], options: {
  now?: string; mutableCurrent?: boolean; prior?: Partial<Pick<ResearchPackage, "verificationStatus" | "verificationType" | "verifiedAt" | "verificationTTL" | "nextVerificationDue">> | null;
  providerFailed?: boolean;
} = {}): VerificationSnapshot {
  const now = options.now ?? new Date().toISOString(); const ordered = [...claims].sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
  const initialPending = ordered.find((claim) => claim.claimType === "UNRESOLVED" || PENDING.test(claimText(claim)));
  const resolutionClaims = ordered.filter((claim) => claim.claimType === "EXPLAINED_LATER");
  const sourceIds = new Set(sources.map((source) => source.id));
  const validResolutionClaims = resolutionClaims.filter((claim) => claim.sourceIds.length && claim.sourceIds.every((id) => sourceIds.has(id)));
  const caseStateAtSourceTime = initialPending ? pendingState(claimText(initialPending)) : "DOCUMENTED";
  const latestResolution = validResolutionClaims.at(-1); const resolvedAt = latestResolution?.eventDate ?? null;
  const latestKnownState: StoryCaseState = latestResolution ? (/found|ditemui|dijumpai|recovered/i.test(claimText(latestResolution)) ? "FOUND" : "RESOLVED") : initialPending ? caseStateAtSourceTime : "DOCUMENTED";
  const verificationType: VerificationType = options.mutableCurrent ? "CURRENT_VERIFICATION" : initialPending ? "HISTORICAL_FOLLOW_UP" : null;
  if (!verificationType) return { caseStateAtSourceTime, latestKnownState, resolutionClaimIds: [], resolutionSourceIds: [], resolvedAt: null,
    verificationStatus: "NOT_REQUIRED", verificationType: null, verifiedAt: null, verificationTTL: null, nextVerificationDue: null, requiresCurrentVerification: false };
  if (verificationType === "CURRENT_VERIFICATION") {
    const verifiedAt = options.prior?.verificationType === "CURRENT_VERIFICATION" && options.prior.verificationStatus === "VERIFIED" ? options.prior.verifiedAt ?? null : null;
    const expiry = verifiedAt ? new Date(Date.parse(verifiedAt) + CURRENT_TTL_SECONDS * 1000).toISOString() : null;
    const stale = Boolean(expiry && Date.parse(expiry) <= Date.parse(now)); const status: VerificationStatus = stale ? "STALE" : verifiedAt ? "VERIFIED" : options.providerFailed ? "FAILED" : "PENDING";
    return { caseStateAtSourceTime, latestKnownState, resolutionClaimIds: validResolutionClaims.map((claim) => claim.id), resolutionSourceIds: [...new Set(validResolutionClaims.flatMap((claim) => claim.sourceIds))],
      resolvedAt, verificationStatus: status, verificationType, verifiedAt, verificationTTL: CURRENT_TTL_SECONDS, nextVerificationDue: expiry, requiresCurrentVerification: status !== "VERIFIED" };
  }
  const verified = validResolutionClaims.length > 0; const status: VerificationStatus = verified ? "VERIFIED" : options.providerFailed ? "FAILED" : "PENDING";
  return { caseStateAtSourceTime, latestKnownState, resolutionClaimIds: validResolutionClaims.map((claim) => claim.id), resolutionSourceIds: [...new Set(validResolutionClaims.flatMap((claim) => claim.sourceIds))],
    resolvedAt, verificationStatus: status, verificationType, verifiedAt: verified ? now : null, verificationTTL: null, nextVerificationDue: null, requiresCurrentVerification: !verified };
}

export type FollowUpSearchWindow = { from: string; to: string; days: number };
export type FollowUpResearchProvider = { id: string; search(query: string, window: FollowUpSearchWindow): Promise<ArchiveDocument[]> };

export function createArchiveFollowUpProvider(provider: DiscoveryProvider<unknown>): FollowUpResearchProvider {
  return { id: provider.id, async search(query, window) { const response = await provider.search(query, { page: 1, limit: 10, timeoutMs: 12_000 });
    return response.results.map((result) => provider.normalize(result)).filter((item): item is ArchiveDocument => Boolean(item))
      .filter((item) => { const value = timestamp(item.publishedAt); return value !== null && value >= Date.parse(window.from) && value <= Date.parse(window.to); }); } };
}

export function createEditorialFollowUpProvider(documents: ArchiveDocument[]): FollowUpResearchProvider {
  return { id: "EDITORIAL_VERIFIED_WEB", async search(query, window) { const queryTokens = new Set(tokens(query));
    return documents.filter((document) => { const date = timestamp(document.publishedAt); const shared = new Set(tokens(`${document.title} ${document.snippet}`)).size
        ? tokens(`${document.title} ${document.snippet}`).filter((token) => queryTokens.has(token)).length : 0;
      return date !== null && date >= Date.parse(window.from) && date <= Date.parse(window.to) && shared >= 2; }); } };
}

function sourcePriority(value: ArchiveDocument["reliabilityLevel"]) { return ({ OFFICIAL: 0, PRIMARY: 0, INSTITUTIONAL: 1, ACADEMIC: 1, REPUTABLE_JOURNALISM: 2, ARCHIVAL_NEWSPAPER: 3, REFERENCE: 4, OTHER: 5 } as Record<string, number>)[value] ?? 6; }
export function hasStrongContinuity(candidate: Pick<StoryCandidate, "title" | "summary">, pkg: Pick<ResearchPackage, "people" | "locations">, sources: StoredStorySource[], document: ArchiveDocument) {
  const base = `${candidate.title} ${candidate.summary} ${pkg.people.join(" ")} ${pkg.locations.join(" ")} ${sources.map((source) => `${source.title} ${source.snippet}`).join(" ")}`;
  const baseTokens = new Set(tokens(base)); const documentText = `${document.title} ${document.snippet}`; const shared = tokens(documentText).filter((token) => baseTokens.has(token));
  const exactEntity = pkg.people.some((person) => documentText.toLowerCase().includes(person.toLowerCase()));
  const distinctiveNumber = (base.match(/\b\d+\b/g) ?? []).some((number) => new RegExp(`\\b${number}\\b`).test(documentText));
  const exactLocation = pkg.locations.some((location) => location.length >= 4 && documentText.toLowerCase().includes(location.toLowerCase()));
  return RESOLVED.test(documentText) && shared.length >= 2 && (exactEntity || (distinctiveNumber && exactLocation && shared.length >= 4));
}

export type FollowUpResult = { searches: number; sourcesFound: number; sourcesAccepted: number; acceptedSourceIds: string[]; errors: string[] };
export async function runFollowUpVerification(candidate: StoryCandidate, pkg: ResearchPackage, sources: StoredStorySource[], store: StoryStore, providers: FollowUpResearchProvider[]): Promise<FollowUpResult> {
  if (pkg.verificationType === "HISTORICAL_FOLLOW_UP" && pkg.verificationStatus === "VERIFIED") return { searches: 0, sourcesFound: 0, sourcesAccepted: 0, acceptedSourceIds: [], errors: [] };
  if (!requiresFollowUp(pkg.claims)) return { searches: 0, sourcesFound: 0, sourcesAccepted: 0, acceptedSourceIds: [], errors: [] };
  const baseDate = sources.map((source) => timestamp(source.publishedAt)).filter((value): value is number => value !== null).sort((a, b) => a - b)[0];
  if (!baseDate) return { searches: 0, sourcesFound: 0, sourcesAccepted: 0, acceptedSourceIds: [], errors: ["No dated initial source for bounded follow-up search."] };
  const query = buildFollowUpQuery(candidate, pkg, sources); let searches = 0; let sourcesFound = 0; const acceptedSourceIds: string[] = []; const errors: string[] = [];
  for (const days of FOLLOW_UP_WINDOWS_DAYS) { const window = { from: new Date(baseDate + 1).toISOString(), to: new Date(baseDate + days * 86_400_000).toISOString(), days };
    const found: ArchiveDocument[] = []; for (const provider of providers) { searches += 1; try { found.push(...await provider.search(query, window)); } catch (error) { logFailure("follow_up_verification.failure", error, { storyId: candidate.id, provider: provider.id, windowDays: days }); errors.push(`${provider.id}: search failed`); } }
    sourcesFound += found.length; for (const document of found.sort((a, b) => sourcePriority(a.reliabilityLevel) - sourcePriority(b.reliabilityLevel))) {
      if (!hasStrongContinuity(candidate, pkg, sources, document)) continue;
      const id = createHash("sha256").update(`${document.provider}:${document.url}`).digest("hex").slice(0, 32); const saved = await store.upsertSource({ id, storyCandidateId: candidate.id, provider: document.provider,
        sourceType: document.sourceType, title: document.title, publisher: document.publisher, url: document.url, publishedAt: document.publishedAt, accessedAt: document.accessedAt,
        snippet: document.snippet, metadata: { ...document.metadata, sourceRole: "FOLLOW_UP", verificationType: "HISTORICAL_FOLLOW_UP", followUpQuery: query,
          followUpWindowDays: days, continuityAccepted: true, extractedPeople: document.people, extractedLocations: document.originalLocationTerms }, reliabilityLevel: document.reliabilityLevel });
      if (saved.storyCandidateId === candidate.id) acceptedSourceIds.push(saved.id);
    }
    if (acceptedSourceIds.length) break;
  }
  if (acceptedSourceIds.length) await store.refreshSourceMetrics(candidate.id);
  return { searches, sourcesFound, sourcesAccepted: new Set(acceptedSourceIds).size, acceptedSourceIds: [...new Set(acceptedSourceIds)], errors };
}
