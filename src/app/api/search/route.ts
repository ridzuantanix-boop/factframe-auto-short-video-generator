import { after, NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/data/wikidata";
import { indexSearchResults } from "@/lib/discovery/indexer";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { usefulCandidate } from "@/lib/discovery/config";
import { isPublicReadyPackage } from "@/lib/product/readiness";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Masukkan topik untuk dicari." }, { status: 400 });
  try {
    const indexed = isStoryIndexConfigured() ? await getStoryStore().list({ search: query, status: "READY", page: 1, limit: 20, sort: "research" }).catch(() => ({ items: [] })) : { items: [] };
    const store = isStoryIndexConfigured() ? getStoryStore() : null;
    const persisted = (await Promise.all(indexed.items.map(async (item) => ({ item, pkg: await store?.getResearchPackage(item.id) })))).filter(({ pkg }) => isPublicReadyPackage(pkg)).map(({ item, pkg }) => ({ id: item.id, label: item.title, description: item.summary, url: item.canonicalUrl ?? item.sourceHints[0] ?? "", status: "READY" as const, category: item.category, supportedDurationSeconds: pkg?.supportedDurationSeconds, timeContext: item.metadata.currentAware === true ? "SEMASA" as const : "SEJARAH" as const }));
    const live = await searchEntities(query).then((items) => items.filter(usefulCandidate)).catch(() => []);
    if (isStoryIndexConfigured() && live.length) after(async () => { await indexSearchResults(live, "interesting", query, getStoryStore(), "Wikidata"); });
    const results = [...new Map([...persisted, ...live.map((item) => ({ ...item, status: "DISCOVERED" as const }))].map((item) => [item.id, item])).values()];
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (error) {
    console.error("[search] Wikidata request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Sumber data fakta tidak dapat dicapai. Sila cuba lagi." }, { status: 502 });
  }
}
