import { randomUUID } from "node:crypto";
import type { SearchResult, StoryCandidateInput } from "@/lib/types";
import { calculateMysteryPotential, classifyLocationFromText, classifyStoryTypeFromText } from "./classification.ts";

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

export function classifyLocation(item: Pick<SearchResult, "label" | "description">) { return classifyLocationFromText(item); }

export function classifyStoryType(item: Pick<SearchResult, "label" | "description">) { return classifyStoryTypeFromText(item); }

export function normalizeCandidate(item: SearchResult, category: string, query: string, provider = "Wikipedia"): StoryCandidateInput {
  const normalizedTitle = normalizeTitle(item.label);
  const geography = classifyLocation(item);
  return {
    id: randomUUID(), canonicalEntityId: /^Q\d+$/.test(item.id) ? item.id : null,
    canonicalUrl: canonicalizeUrl(item.url), title: item.label.trim(), normalizedTitle,
    slug: slugify(item.label), summary: item.description.trim(), country: geography.country, region: geography.region, category,
    storyType: classifyStoryType(item), status: "DISCOVERED", sourceCount: 0, claimCount: 0,
    researchScore: null, visualScore: null, narrativePotentialScore: null,
    sourceHints: [item.url].filter(Boolean), searchTerms: [...new Set([item.label, query].filter(Boolean))], aliases: [],
    metadata: { categories: [category], discoveredViaCategory: category, geographyConfidence: geography.geographyConfidence,
      geographyEvidence: geography.geographyEvidence, mysteryPotential: calculateMysteryPotential(item), classificationVersion: "2.1-text-fallback" }, lastResearchedAt: null, lastVerifiedAt: null,
    originProvider: provider, originQuery: query,
  };
}

export function mergeStringValues(...values: Array<string[] | undefined>) {
  return [...new Set(values.flatMap((value) => value ?? []).map((value) => value.trim()).filter(Boolean))];
}
