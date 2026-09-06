import { NextRequest, NextResponse } from "next/server";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";
import { buildMysteryScript } from "@/lib/mystery/storyEngine";
import { loadResearchStory } from "@/lib/research/storyResearch";
import { planEvidenceAwareVisuals } from "@/lib/visual/planner";
import { createHash } from "node:crypto";
import { enforceRateLimit, rejectOversizedRequest } from "@/lib/server/rateLimit";
import { logFailure } from "@/lib/server/structuredLog";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { name: "visual-plan", limit: 30, windowMs: 10 * 60_000 }); if (limited) return limited;
  const oversized = rejectOversizedRequest(request, 4_000); if (oversized) return oversized;
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
    logFailure("visual_provider.failure", error);
    return NextResponse.json({ error: "Perancangan visual gagal buat masa ini." }, { status: 502 });
  }
}
