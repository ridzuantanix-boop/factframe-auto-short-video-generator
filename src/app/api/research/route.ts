import { NextRequest, NextResponse } from "next/server";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { loadResearchStory } from "@/lib/research/storyResearch";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ID cerita diperlukan." }, { status: 400 });
  if (!isStoryIndexConfigured()) return NextResponse.json({ error: "Persistent story index is not configured." }, { status: 503 });
  try {
    const story = await loadResearchStory(id, getStoryStore());
    if (!story) return NextResponse.json({ error: "Cerita arkib ini belum mempunyai pakej penyelidikan READY." }, { status: 404 });
    return NextResponse.json({ story }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[research] Research package load failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Pakej penyelidikan tidak dapat dimuatkan." }, { status: 502 });
  }
}
