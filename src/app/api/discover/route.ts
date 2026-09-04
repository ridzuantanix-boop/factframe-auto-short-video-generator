import { NextRequest, NextResponse } from "next/server";
import { searchWikipediaCandidates } from "@/lib/data/wikidata";
import { DISCOVERY_CATEGORY_QUERIES, DISCOVERY_GROUP_SIZE, usefulCandidate, usefulMysteryCandidate } from "@/lib/discovery/config";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? "interesting";
  const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") ?? 0));
  const queries = DISCOVERY_CATEGORY_QUERIES[category] ?? DISCOVERY_CATEGORY_QUERIES.interesting;
  try {
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
    return NextResponse.json({ results: unique, page, hasMore: groupIndex < groupCount - 1 || batches.some((batch) => batch.hasMore), estimatedAvailable: 1000 }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[discover] Source indexing failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Katalog sumber tidak dapat dicapai buat masa ini." }, { status: 502 });
  }
}
