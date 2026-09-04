import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/data/wikidata";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Masukkan topik untuk dicari." }, { status: 400 });
  try {
    return NextResponse.json({ results: await searchEntities(query) }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (error) {
    console.error("[search] Wikidata request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Sumber data fakta tidak dapat dicapai. Sila cuba lagi." }, { status: 502 });
  }
}
