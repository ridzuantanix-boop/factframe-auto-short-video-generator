import { fetchWithRetry } from "../network.ts";
import type { ArchiveDocument, ArchiveSourceType, DiscoveryProvider, ProviderSearchOptions } from "../types.ts";

type NlbItem = { Id?: string; Source?: string; Title?: string; Author?: string; Publisher?: string | null; Date?: string; Format?: string; Description?: string; PageURL?: string; IsAccessible?: boolean; IsRequiredLogin?: boolean; IsRequiredEzproxy?: boolean };
type NlbResponse = { Status?: string; Message?: string | null; TotalRecords?: number; Items?: NlbItem[] };

const PUBLICATIONS: Array<[RegExp, string]> = [
  [/^maltribune/i, "Malaya Tribune"], [/^straitstimes/i, "The Straits Times"], [/^straitsbudget/i, "The Straits Budget"],
  [/^freepress|^singfreepress/i, "The Singapore Free Press and Mercantile Advertiser"], [/^singstandard/i, "Singapore Standard"],
  [/^newnation/i, "New Nation"], [/^malayansatpost/i, "Malayan Saturday Post"], [/^morningtribune/i, "Morning Tribune"],
  [/^beritaharian/i, "Berita Harian"], [/^sundaytribune/i, "Sunday Tribune"],
];

function text(value: unknown) { return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function publication(item: NlbItem) { return text(item.Publisher) || PUBLICATIONS.find(([pattern]) => pattern.test(text(item.Id)))?.[1] || (item.Source === "Newspapers" ? "NewspaperSG" : "National Library Board Singapore"); }
function parseDate(value: unknown) {
  const input = text(value).replace(/[<>]/g, "").replace(/\.$/, "");
  const parsed = Date.parse(`${input} UTC`); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function canonicalUrl(item: NlbItem, collection: string) {
  const id = encodeURIComponent(text(item.Id));
  return collection === "newspaper" && id ? `https://eresources.nlb.gov.sg/newspapers/digitised/article/${id}` : text(item.PageURL);
}

export function createNlbOneSearchProvider(collection: "newspaper" | "record" | "audiovisual" | "image"): DiscoveryProvider<NlbItem> {
  const sourceType: ArchiveSourceType = collection === "newspaper" ? "ARCHIVAL_NEWSPAPER" : collection === "audiovisual" ? "ORAL_HISTORY" : collection === "image" ? "ARCHIVAL_IMAGE" : "ARCHIVAL_RECORD";
  const id = collection === "newspaper" ? "NLB_NEWSPAPERSG" : `NLB_${collection.toUpperCase()}`;
  const normalize = (item: NlbItem): ArchiveDocument | null => {
    const providerId = text(item.Id); const title = text(item.Title); const url = canonicalUrl(item, collection);
    if (!providerId || !title || !url) return null;
    return {
      provider: id, providerId, sourceType, title, publisher: publication(item), url, publishedAt: parseDate(item.Date),
      accessedAt: new Date().toISOString(), snippet: text(item.Description), originalLocationTerms: [], people: [],
      reliabilityLevel: collection === "newspaper" ? "ARCHIVAL_NEWSPAPER" : "INSTITUTIONAL",
      metadata: { collection, format: text(item.Format), author: text(item.Author), source: text(item.Source), sourceLandingUrl: text(item.PageURL), isAccessible: item.IsAccessible !== false, requiresLogin: Boolean(item.IsRequiredLogin), requiresEzproxy: Boolean(item.IsRequiredEzproxy) },
    };
  };
  return {
    id,
    async search(query: string, options: ProviderSearchOptions) {
      const url = new URL(`https://search.nlb.gov.sg/onesearch/${collection}/index`);
      Object.entries({ query, sort: "Relevance", sortonly: "N", start: String((options.page - 1) * options.limit + 1), max: String(options.limit) }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetchWithRetry(url, { timeoutMs: options.timeoutMs, headers: { referer: `https://search.nlb.gov.sg/onesearch/Search?query=${encodeURIComponent(query)}` } });
      const payload = await response.json() as NlbResponse;
      if (payload.Status !== "OK") throw new Error(payload.Message || `NLB ${collection} search returned ${payload.Status ?? "unknown status"}`);
      return { results: payload.Items ?? [], total: Number(payload.TotalRecords ?? 0) };
    },
    normalize,
    async fetchDetails(result: NlbItem) { return normalize(result); },
  };
}
