import { after, NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/data/wikidata";
import { indexSearchResults } from "@/lib/discovery/indexer";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { usefulCandidate } from "@/lib/discovery/config";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Masukkan topik untuk dicari." }, { status: 400 });
  try {
    const results = (await searchEntities(query)).filter(usefulCandidate);
    if (isStoryIndexConfigured() && results.length) after(async () => { await indexSearchResults(results, "interesting", query, getStoryStore(), "Wikidata"); });
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (error) {
    console.error("[search] Wikidata request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Sumber data fakta tidak dapat dicapai. Sila cuba lagi." }, { status: 502 });
  }
}
