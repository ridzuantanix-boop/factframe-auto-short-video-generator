import { randomUUID } from "node:crypto";
import type { SearchResult, StoryCandidateInput } from "@/lib/types";

const MALAYSIA_TERMS: Array<[RegExp, string]> = [
  [/\b(kuala lumpur|putrajaya|labuan)\b/i, "Federal Territories"],
  [/\bselangor\b/i, "Selangor"], [/\b(penang|pulau pinang)\b/i, "Penang"],
  [/\bjohor\b/i, "Johor"], [/\bperak\b/i, "Perak"], [/\bkedah\b/i, "Kedah"],
  [/\bkelantan\b/i, "Kelantan"], [/\bterengganu\b/i, "Terengganu"],
  [/\bpahang\b/i, "Pahang"], [/\bnegeri sembilan\b/i, "Negeri Sembilan"],
  [/\b(melaka|malacca)\b/i, "Melaka"], [/\bsabah\b/i, "Sabah"], [/\bsarawak\b/i, "Sarawak"],
];

const MALAYSIAN_CONTEXT = /\b(malaysia|malaysian|malaya|malayan|federation of malaya|straits settlements|british malaya|bornean?)\b/i;

export function normalizeTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugify(value: string) {
  return normalizeTitle(value).replace(/\s+/g, "-").slice(0, 120) || "untitled";
}

export function canonicalizeUrl(value?: string | null) {
  if (!value) return null;
  try { const url = new URL(value); url.hash = ""; url.search = ""; return url.toString().replace(/\/$/, ""); }
  catch { return null; }
}

export function classifyLocation(item: Pick<SearchResult, "label" | "description">, query: string) {
  const text = `${item.label} ${item.description} ${query}`;
  const state = MALAYSIA_TERMS.find(([pattern]) => pattern.test(text))?.[1];
  const malaysia = Boolean(state) || MALAYSIAN_CONTEXT.test(text);
  return { country: malaysia ? "Malaysia" : "Global", region: state ?? (malaysia ? "Malaysia / Malaya" : "Global") };
}

export function classifyStoryType(item: Pick<SearchResult, "label" | "description">, category: string) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  if (category.includes("mysteries") || /mystery|unsolved|disappearance|legend|haunt|ghost|murder|disaster/.test(text)) return "MYSTERY";
  if (/person|politician|scientist|actor|actress|artist|athlete|entrepreneur|born/.test(text)) return "BIOGRAPHY";
  if (/company|organisation|organization|business|brand/.test(text)) return "ORGANISATION";
  if (/event|battle|accident|disaster|election|expedition|games/.test(text)) return "EVENT";
  if (/city|town|island|building|place|district|state|country|landmark/.test(text)) return "PLACE";
  if (/discovery|invention|technology|species|scientific/.test(text)) return "SCIENCE";
  return "EXPLAINER";
}

export function normalizeCandidate(item: SearchResult, category: string, query: string, provider = "Wikipedia"): StoryCandidateInput {
  const normalizedTitle = normalizeTitle(item.label);
  const { country, region } = classifyLocation(item, query);
  return {
    id: randomUUID(), canonicalEntityId: /^Q\d+$/.test(item.id) ? item.id : null,
    canonicalUrl: canonicalizeUrl(item.url), title: item.label.trim(), normalizedTitle,
    slug: slugify(item.label), summary: item.description.trim(), country, region, category,
    storyType: classifyStoryType(item, category), status: "DISCOVERED", sourceCount: 0, claimCount: 0,
    researchScore: null, visualScore: null, narrativePotentialScore: null,
    sourceHints: [item.url].filter(Boolean), searchTerms: [...new Set([item.label, query].filter(Boolean))], aliases: [],
    metadata: { categories: [category] }, lastResearchedAt: null, lastVerifiedAt: null,
    originProvider: provider, originQuery: query,
  };
}

export function mergeStringValues(...values: Array<string[] | undefined>) {
  return [...new Set(values.flatMap((value) => value ?? []).map((value) => value.trim()).filter(Boolean))];
}
