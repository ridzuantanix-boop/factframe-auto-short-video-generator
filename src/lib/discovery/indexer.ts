import type { SearchResult } from "../types";
import { searchEntityPage, searchWikipediaCandidates } from "../data/wikidata.ts";
import { DISCOVERY_CATEGORY_QUERIES, usefulCandidate, usefulMysteryCandidate } from "./config.ts";
import { normalizeCandidate } from "./normalizer.ts";
import { createStoryStore, type StoryStore } from "./store.ts";

export type IngestionOptions = { category?: string; pagesPerQuery?: number; limit?: number; concurrency?: number; delayMs?: number; store?: StoryStore };
export type IngestionReport = { queried: number; providerResults: number; accepted: number; rejected: number; inserted: number; updatedOrDeduped: number; errors: string[]; total: number };

export async function indexSearchResults(results: SearchResult[], category: string, query: string, store = createStoryStore(), provider = "Wikipedia") {
  const mystery = category === "mysteries" || category === "malaysia_mysteries";
  const filtered = results.filter(usefulCandidate).filter((item) => !mystery || usefulMysteryCandidate(item));
  const unique = [...new Map(filtered.map((item) => [item.id || item.url, item])).values()];
  for (const item of unique) await store.upsert(normalizeCandidate(item, category, query, provider));
  return { accepted: unique.length, rejected: results.length - unique.length };
}

export async function runDiscoveryIngestion(options: IngestionOptions = {}): Promise<IngestionReport> {
  const store = options.store ?? createStoryStore(); const ownsStore = !options.store;
  const pagesPerQuery = Math.min(10, Math.max(1, options.pagesPerQuery ?? 1));
  const limit = Math.min(50, Math.max(5, options.limit ?? 15)); const concurrency = Math.min(4, Math.max(1, options.concurrency ?? 2));
  const delayMs = Math.min(5000, Math.max(0, options.delayMs ?? 350));
  const categories = options.category ? [options.category] : Object.keys(DISCOVERY_CATEGORY_QUERIES);
  for (const category of categories) if (!DISCOVERY_CATEGORY_QUERIES[category]) throw new Error(`Unknown discovery category: ${category}`);
  await store.migrate(); const before = await store.stats();
  const tasks = categories.flatMap((category) => DISCOVERY_CATEGORY_QUERIES[category].flatMap((query) =>
    Array.from({ length: pagesPerQuery }, (_, page) => ({ category, query, page }))));
  const report = { queried: 0, providerResults: 0, accepted: 0, rejected: 0, inserted: 0, updatedOrDeduped: 0, errors: [] as string[], total: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]; report.queried += 1;
      try {
        let provider = "Wikipedia"; let response;
        try { response = await searchWikipediaCandidates(task.query, task.page * limit, limit); }
        catch { provider = "Wikidata"; response = await searchEntityPage(task.query, task.page * limit, limit); }
        report.providerResults += response.results.length;
        const indexed = await indexSearchResults(response.results, task.category, task.query, store, provider);
        report.accepted += indexed.accepted; report.rejected += indexed.rejected;
      } catch (error) { report.errors.push(`${task.category}/${task.query}: ${error instanceof Error ? error.message : "unknown error"}`); }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const after = await store.stats(); report.inserted = after.total - before.total;
    report.updatedOrDeduped = Math.max(0, report.accepted - report.inserted); report.total = after.total;
    return report;
  } finally { if (ownsStore) await store.close(); }
}
