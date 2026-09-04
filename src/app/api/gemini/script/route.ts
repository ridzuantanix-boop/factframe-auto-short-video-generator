import { getGeminiClient, GEMINI_TEXT_MODEL } from "@/lib/gemini/client";
import { getMysteryStory } from "@/lib/mystery/catalog";
import { passesQualityGate } from "@/lib/mystery/storyEngine";
import type { ClaimType, MysteryScript, SegmentRole, StoryDuration, StoryTone, VisualIntent } from "@/lib/types";

const roles: SegmentRole[] = ["HOOK", "OPEN_LOOP", "CONTEXT", "ESCALATION", "TWIST", "THEORY", "COUNTERPOINT", "PAYOFF"];
const claimTypes: ClaimType[] = ["VERIFIED", "REPORTED", "THEORY", "DISPUTED", "UNRESOLVED", "FOLKLORE", "EXPLAINED_LATER"];
const visualIntents: VisualIntent[] = ["ARCHIVAL_PHOTO", "PORTRAIT", "LOCATION", "MAP", "NEWSPAPER", "DOCUMENT", "TIMELINE", "THEORY_CARD", "FACT_CARD", "EVIDENCE", "ENDING"];

export async function POST(request: Request) {
  const client = getGeminiClient();
  if (!client) return Response.json({ error: "Gemini belum dikonfigurasi." }, { status: 503 });
  const body = await request.json() as { storyId?: string; duration?: StoryDuration; tone?: StoryTone; showSourceNote?: boolean };
  const story = body.storyId ? getMysteryStory(body.storyId) : undefined;
  if (!story || ![30, 60, 90].includes(body.duration ?? 0)) return Response.json({ error: "Permintaan skrip tidak sah." }, { status: 400 });
  const duration = body.duration!;
  const tone = body.tone === "SUSPENSEFUL" ? "SUSPENSEFUL" : "DOCUMENTARY";
  const target = duration === 30 ? "65–90" : duration === 60 ? "130–170" : "190–240";
  const allowedSourceIds = new Set(story.sources.map((source) => source.id));
  const schema = {
    type: "object", properties: {
      hook: { type: "string" }, openLoop: { type: "string" }, payoff: { type: "string" },
      segments: { type: "array", items: { type: "object", properties: {
        role: { type: "string", enum: roles }, text: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } }, claimType: { type: "string", enum: claimTypes }, visualIntent: { type: "string", enum: visualIntents }
      }, required: ["role", "text", "sourceIds", "claimType", "visualIntent"] }
    }}, required: ["hook", "openLoop", "segments", "payoff"]
  };
  const prompt = `Anda penulis dokumentari misteri pendek Bahasa Melayu Malaysia. Tulis skrip ${duration} saat (${target} patah perkataan), nada ${tone}. Gunakan HANYA dakwaan dalam JSON. Jangan cipta fakta, motif, saksi atau teori. Kekalkan sourceIds asal pada setiap ayat fakta. Ayat 5–14 perkataan, percakapan semula jadi, bukan bahasa Wikipedia. Mulakan dengan rasa ingin tahu terkuat, buka persoalan dalam 3 saat, beri maklumat baharu secara progresif dan tamat dengan payoff sebenar. Fakta, laporan, teori, pertikaian dan perkara belum selesai mesti dibezakan jelas. Jangan gunakan CTA atau drama palsu. OPEN_LOOP boleh tiada sourceIds jika ia hanya soalan.\n\nCERITA:\n${JSON.stringify({ title: story.title, summary: story.summary, caseStatus: story.caseStatus, sources: story.sources.map(({ id, title, publisher, type }) => ({ id, title, publisher, type })), claims: story.claims })}`;
  try {
    const response = await client.interactions.create({ model: GEMINI_TEXT_MODEL, input: prompt, response_format: { type: "text", mime_type: "application/json", schema } });
    const parsed = JSON.parse(response.output_text ?? "{}") as Pick<MysteryScript, "hook" | "openLoop" | "segments" | "payoff">;
    if (!Array.isArray(parsed.segments) || !parsed.segments.length) throw new Error("Respons skrip kosong.");
    for (const segment of parsed.segments) {
      if (!roles.includes(segment.role) || !claimTypes.includes(segment.claimType) || !visualIntents.includes(segment.visualIntent)) throw new Error("Struktur segmen tidak sah.");
      if (segment.sourceIds.some((id) => !allowedSourceIds.has(id))) throw new Error("Gemini memulangkan sumber yang tidak wujud.");
      if (segment.role !== "OPEN_LOOP" && !segment.sourceIds.length) throw new Error("Terdapat ayat fakta tanpa sumber.");
    }
    const wordCount = parsed.segments.reduce((sum, segment) => sum + segment.text.trim().split(/\s+/).length, 0);
    const [min, max] = duration === 30 ? [65, 90] : duration === 60 ? [130, 170] : [190, 240];
    if (wordCount < min || wordCount > max) throw new Error("Panjang skrip AI tidak menepati sasaran.");
    const roleSet = new Set(parsed.segments.map((segment) => segment.role));
    const script: MysteryScript = { storyId: story.id, title: story.title, durationTarget: duration, tone, hook: parsed.hook, openLoop: parsed.openLoop, caseStatus: story.caseStatus, segments: parsed.segments, payoff: parsed.payoff, storytellingScore: 14, sourceCoverage: 1, unsupportedClaims: 0, sources: story.sources, showSourceNote: body.showSourceNote !== false };
    if (!roleSet.has("HOOK") || !roleSet.has("OPEN_LOOP") || !roleSet.has("PAYOFF") || !passesQualityGate(script)) throw new Error("Skrip AI tidak melepasi quality gate.");
    return Response.json({ script, provider: "gemini" });
  } catch (error) {
    console.error("[script] Gemini generation failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: error instanceof Error ? error.message : "Gemini gagal menghasilkan skrip." }, { status: 502 });
  }
}
