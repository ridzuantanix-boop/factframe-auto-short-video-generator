import { NextRequest, NextResponse } from "next/server";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { buildMysteryScript } from "@/lib/mystery/storyEngine";
import { loadResearchStory } from "@/lib/research/storyResearch";
import { planEvidenceAwareVisuals } from "@/lib/visual/planner";
import { createHash } from "node:crypto";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function POST(request: NextRequest) {
  if (!isStoryIndexConfigured()) return NextResponse.json({ error: "Indeks cerita belum dikonfigurasi." }, { status: 503 });
  try {
    const { storyCandidateId, durationSeconds } = await request.json() as { storyCandidateId?: string; durationSeconds?: number };
    if (!storyCandidateId) return NextResponse.json({ error: "storyCandidateId diperlukan." }, { status: 400 });
    const store = getStoryStore(); await store.migrate(); const researchPackage = await store.getResearchPackage(storyCandidateId); const researchPackageHash = hash(researchPackage);
    const story = await loadResearchStory(storyCandidateId, store);
    if (!story) return NextResponse.json({ error: "Cerita mesti berstatus fakta READY." }, { status: 422 });
    const duration = Math.min(story.supportedDurationSeconds ?? 60, Math.max(8, durationSeconds ?? story.supportedDurationSeconds ?? 30));
    const cached = await store.getVisualPlan(story.id, duration); if (cached && cached.metadata.researchPackageHash === researchPackageHash)
      return NextResponse.json({ plan: cached, researchPackageHash, visualPlanHash: hash(cached), cached: true });
    const script = buildMysteryScript(story, duration, "DOCUMENTARY", true); const plan = await planEvidenceAwareVisuals(story, script);
    plan.metadata.researchPackageHash = researchPackageHash; const persisted = await store.persistVisualPlan(plan);
    return NextResponse.json({ plan: persisted, researchPackageHash, visualPlanHash: hash(persisted), cached: false }, { status: 201 });
  } catch (error) {
    console.error("[visual-plan]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Perancangan visual gagal buat masa ini." }, { status: 502 });
  }
}
