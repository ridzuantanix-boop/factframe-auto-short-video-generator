import { after, NextRequest, NextResponse } from "next/server";
import { searchWikipediaCandidates } from "@/lib/data/wikidata";
import { DISCOVERY_CATEGORY_QUERIES, DISCOVERY_GROUP_SIZE, usefulCandidate, usefulMysteryCandidate } from "@/lib/discovery/config";
import { indexSearchResults } from "@/lib/discovery/indexer";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? "interesting";
  const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") ?? 0));
  const queries = DISCOVERY_CATEGORY_QUERIES[category] ?? DISCOVERY_CATEGORY_QUERIES.interesting;
  try {
    let indexedResults: Array<{ id: string; label: string; description: string; url: string }> = [];
    let persistedTotal: number | null = null;
    if (isStoryIndexConfigured()) {
      try {
        const indexed = await getStoryStore().list({ category, page: page + 1, limit: 48, sort: "newest" });
        indexedResults = indexed.items.map((item) => ({ id: item.canonicalEntityId ?? item.id, label: item.title, description: item.summary, url: item.canonicalUrl ?? item.sourceHints[0] ?? "" }));
        persistedTotal = indexed.total;
        if (indexed.items.length >= 12 || indexed.hasMore) return NextResponse.json({ results: indexedResults, page, hasMore: indexed.hasMore, total: indexed.total, source: "persistent-index" }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
      } catch (error) { console.warn("[discover] Persistent index unavailable; using live fallback", error instanceof Error ? error.message : "unknown error"); }
    }
    const mysteryCategory = category === "mysteries" || category === "malaysia_mysteries";
    const groupSize = DISCOVERY_GROUP_SIZE;
    const groupCount = Math.ceil(queries.length / groupSize);
    const groupIndex = page % groupCount;
    const offsetPage = Math.floor(page / groupCount);
    const activeQueries = queries.slice(groupIndex * groupSize, groupIndex * groupSize + groupSize);
    const batches = await Promise.all(activeQueries.map((query) => searchWikipediaCandidates(query, offsetPage * 25, 25).catch(() => ({ results: [], hasMore: false }))));
    const combined = batches.flatMap((batch) => batch.results);
    const filtered = combined.filter(usefulCandidate).filter((item) => !mysteryCategory || usefulMysteryCandidate(item));
    const unique = [...new Map(filtered.map((item) => [item.id, item])).values()];
    if (isStoryIndexConfigured() && unique.length) after(async () => { await indexSearchResults(unique, category, activeQueries.join(" | "), getStoryStore()); });
    const results = [...new Map([...indexedResults, ...unique].map((item) => [item.id, item])).values()];
    return NextResponse.json({ results, page, hasMore: groupIndex < groupCount - 1 || batches.some((batch) => batch.hasMore), total: persistedTotal, source: indexedResults.length ? "persistent-index+live" : "live-discovery" }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[discover] Source indexing failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Katalog sumber tidak dapat dicapai buat masa ini." }, { status: 502 });
  }
}
