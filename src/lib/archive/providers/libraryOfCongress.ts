import { fetchWithRetry } from "../network.ts";
import type { ArchiveDocument, DiscoveryProvider, ProviderSearchOptions } from "../types.ts";

type LocItem = { id?: string; title?: string; date?: string; description?: string[] | string; url?: string; contributor?: string[]; location?: string[]; original_format?: string[]; partof?: string[] };
type LocResponse = { pagination?: { total?: number }; results?: LocItem[] };
const list = (value: unknown) => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

export const libraryOfCongressProvider: DiscoveryProvider<LocItem> = {
  id: "LIBRARY_OF_CONGRESS",
  async search(query: string, options: ProviderSearchOptions) {
    const url = new URL("https://www.loc.gov/search/");
    Object.entries({ q: query, fo: "json", c: String(options.limit), sp: String(options.page), at: "results,pagination" }).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetchWithRetry(url, { timeoutMs: options.timeoutMs }); const payload = await response.json() as LocResponse;
    return { results: payload.results ?? [], total: Number(payload.pagination?.total ?? 0) };
  },
  normalize(item: LocItem): ArchiveDocument | null {
    const title = String(item.title ?? "").trim(); const url = String(item.id ?? item.url ?? "").trim(); if (!title || !url) return null;
    const description = list(item.description).join(" ").replace(/\s+/g, " ").trim(); const year = String(item.date ?? "").match(/\b(?:18|19|20)\d{2}\b/)?.[0];
    return { provider: "LIBRARY_OF_CONGRESS", providerId: url, sourceType: "ARCHIVAL_RECORD", title, publisher: "Library of Congress", url,
      publishedAt: year ? `${year}-01-01T00:00:00.000Z` : null, accessedAt: new Date().toISOString(), snippet: description,
      originalLocationTerms: list(item.location), people: list(item.contributor), reliabilityLevel: "INSTITUTIONAL",
      metadata: { originalFormat: list(item.original_format), collections: list(item.partof) } };
  },
  async fetchDetails(item: LocItem) { return this.normalize(item); },
};
