import { NextRequest, NextResponse } from "next/server";
import { searchVisuals } from "@/lib/data/wikimedia";
import { getMysteryStory } from "@/lib/mystery/catalog";
import { planStoryVisuals, planTopicVisuals } from "@/lib/video/visualPlanner";
import type { MysteryScript, Topic } from "@/lib/types";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Topik tidak diberikan." }, { status: 400 });
  try {
    const visuals = await searchVisuals(query);
    return NextResponse.json({ visuals }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ error: "Visual berlesen tidak dapat diambil buat masa ini." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { storyId?: string; script?: MysteryScript; topic?: Topic };
    const story = body.storyId ? getMysteryStory(body.storyId) : undefined;
    if (!body.script) return NextResponse.json({ error: "Cerita atau skrip tidak sah." }, { status: 400 });
    const result = story && body.script.storyId === story.id ? await planStoryVisuals(story, body.script) : body.topic && body.script.storyId === body.topic.id ? await planTopicVisuals(body.topic, body.script) : undefined;
    if (!result) return NextResponse.json({ error: "Cerita atau skrip tidak sah." }, { status: 400 });
    if (!result.visuals.length) return NextResponse.json({ error: "Media berlesen yang relevan tidak mencukupi." }, { status: 404 });
    const complete = result.visuals.length === body.script.segments.length && result.quality.repetitionScore >= .8 && result.quality.relevanceScore >= .35 && result.quality.visualTypeDiversity >= 2 && result.visuals.some((visual) => visual.mediaType !== "programmatic");
    if (!complete) return NextResponse.json({ error: "Calon ini belum melepasi readiness gate visual." }, { status: 422 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Perancangan visual dokumentari gagal buat masa ini." }, { status: 502 });
  }
}
