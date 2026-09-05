import { after, NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/data/wikidata";
import { indexSearchResults } from "@/lib/discovery/indexer";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { usefulCandidate } from "@/lib/discovery/config";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Masukkan topik untuk dicari." }, { status: 400 });
  try {
    const indexed = isStoryIndexConfigured() ? await getStoryStore().list({ search: query, status: "READY", page: 1, limit: 20, sort: "research" }).catch(() => ({ items: [] })) : { items: [] };
    const persisted = indexed.items.map((item) => ({ id: item.canonicalEntityId ?? item.id, label: item.title, description: item.summary, url: item.canonicalUrl ?? item.sourceHints[0] ?? "" }));
    const live = await searchEntities(query).then((items) => items.filter(usefulCandidate)).catch(() => []);
    if (isStoryIndexConfigured() && live.length) after(async () => { await indexSearchResults(live, "interesting", query, getStoryStore(), "Wikidata"); });
    const results = [...new Map([...persisted, ...live].map((item) => [item.id, item])).values()];
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (error) {
    console.error("[search] Wikidata request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Sumber data fakta tidak dapat dicapai. Sila cuba lagi." }, { status: 502 });
  }
}
