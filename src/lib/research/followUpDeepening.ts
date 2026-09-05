import { createHash } from "node:crypto";
import type { StoryCandidate } from "../types.ts";
import type { DiscoveryProvider, StoredStorySource } from "../archive/types.ts";
import { createNlbOneSearchProvider } from "../archive/providers/nlbOneSearch.ts";
import { extractArchiveEvent } from "../archive/extractor.ts";
import type { StoryStore } from "../discovery/store.ts";
import type { ResearchPackage } from "./types.ts";
import { classifyEntityPhrase, normalizeEntity } from "./entityClassifier.ts";

const EVENT = new Set("missing disappeared disappearance murder killed body accident crash flood fire search trial trials assizes charged arrested ghost legend vessel ship boat helmsman collapse found police attacked fatal dead report reported case".split(" "));
const STOP = new Set("the and for with from into after before this that said malaysia malaya johore johor article page kuala lumpur perak pahang selangor sarawak sabah penang singapore three seven ten".split(" "));
function tokens(value: string) { return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2 && !STOP.has(token))); }
function overlap(left: Set<string>, right: Set<string>) { return [...left].filter((token) => right.has(token)).length; }
function inDateWindow(existing: StoredStorySource[], publishedAt: string | null) {
  const target = publishedAt ? Date.parse(publishedAt) : Number.NaN; if (!Number.isFinite(target)) return false;
  return existing.some((source) => { const base = source.publishedAt ? Date.parse(source.publishedAt) : Number.NaN; if (!Number.isFinite(base)) return false;
    const days = (target - base) / 86_400_000; return days >= -7 && days <= 30; });
}

export function buildFollowUpQueries(candidate: StoryCandidate, pkg: ResearchPackage, sources: StoredStorySource[]) {
  const titleTerms = [...tokens(candidate.title)].slice(0, 7); const people = pkg.people.filter((value) => classifyEntityPhrase(value, candidate.title).type === "PERSON").slice(0, 2);
  const eventTerms = titleTerms.filter((term) => EVENT.has(term)).slice(0, 2); const region = candidate.region === "Malaysia / Malaya" ? "" : candidate.region;
  const year = sources.map((source) => source.publishedAt?.slice(0, 4)).find(Boolean) ?? "";
  const specific = titleTerms.filter((term) => !EVENT.has(term)).slice(0, 4).join(" ");
  return [...new Set([`${people[0] ?? specific} ${eventTerms.join(" ")} ${region} ${year}`, `${specific} ${region} ${year}`, `${candidate.title} ${year}`]
    .map((query) => query.replace(/\s+/g, " ").trim()).filter((query) => query.split(/\s+/).length >= 2))].slice(0, 2);
}

export type FollowUpDeepeningResult = { queries: string[]; resultsReviewed: number; newSources: number; informationGain: number[]; errors: string[] };
export async function discoverFollowUpSources(candidate: StoryCandidate, pkg: ResearchPackage, sources: StoredStorySource[], store: StoryStore,
  provider: DiscoveryProvider<unknown> = createNlbOneSearchProvider("newspaper")): Promise<FollowUpDeepeningResult> {
  if (pkg.claims.filter((claim) => claim.confidence !== "LOW").length > 2) return { queries: [], resultsReviewed: 0, newSources: 0, informationGain: [], errors: [] };
  const queries = buildFollowUpQueries(candidate, pkg, sources); const existingUrls = new Set(sources.map((source) => source.url));
  const existingTokens = tokens(sources.map((source) => `${source.title} ${source.snippet}`).join(" ")); const core = tokens(`${candidate.title} ${pkg.people.join(" ")} ${pkg.locations.join(" ")}`);
  const specificCore = new Set([...tokens(candidate.title), ...pkg.people.filter((value) => classifyEntityPhrase(value, candidate.title).type === "PERSON").flatMap((value) => [...tokens(value)])]
    .filter((token) => !EVENT.has(token) && !STOP.has(token) && !/^\d+$/.test(token)));
  let resultsReviewed = 0; let newSources = 0; const informationGain: number[] = []; const errors: string[] = [];
  for (const query of queries) try {
    const response = await provider.search(query, { page: 1, limit: 10, timeoutMs: 12_000 });
    for (const raw of response.results) { resultsReviewed += 1; const document = provider.normalize(raw); if (!document || existingUrls.has(document.url)) continue;
      const documentText = `${document.title} ${document.snippet}`; const documentTokens = tokens(documentText); const dated = inDateWindow(sources, document.publishedAt);
      const specificContinuity = overlap(documentTokens, specificCore); const exactPerson = pkg.people.filter((value) => classifyEntityPhrase(value, candidate.title).type === "PERSON")
        .some((value) => normalizeEntity(documentText).includes(normalizeEntity(value)));
      if (!specificCore.size || (dated ? specificContinuity < 2 && !(exactPerson && specificContinuity >= 1) : !(exactPerson && specificContinuity >= 2))) continue;
      const novel = [...documentTokens].filter((token) => !existingTokens.has(token)).length / Math.max(1, documentTokens.size);
      const eventContinuity = [...documentTokens].some((token) => EVENT.has(token) && [...core].some((coreToken) => coreToken === token));
      if (novel < .2 || !eventContinuity) continue; const event = extractArchiveEvent(document); if (!event) continue;
      const id = createHash("sha256").update(`${document.provider}:${document.url}`).digest("hex").slice(0, 32); const saved = await store.upsertSource({ id, storyCandidateId: candidate.id,
        provider: document.provider, sourceType: document.sourceType, title: document.title, publisher: document.publisher, url: document.url, publishedAt: document.publishedAt,
        accessedAt: document.accessedAt, snippet: document.snippet, metadata: { ...document.metadata, followUpQuery: query, informationGain: Number(novel.toFixed(3)),
          extractedLocations: event.locations, extractedPeople: event.people, eventVerbs: event.eventVerbs, incidentType: event.incidentType, claimStatus: event.claimStatus }, reliabilityLevel: document.reliabilityLevel });
      if (saved.inserted && saved.storyCandidateId === candidate.id) { newSources += 1; informationGain.push(Number(novel.toFixed(3))); existingUrls.add(document.url); for (const token of documentTokens) existingTokens.add(token); }
      if (newSources >= 3) break;
    }
    if (newSources >= 3) break;
  } catch (error) { errors.push(`${query}: ${error instanceof Error ? error.message : "follow-up search failed"}`); }
  if (newSources) await store.refreshSourceMetrics(candidate.id); return { queries, resultsReviewed, newSources, informationGain, errors };
}
