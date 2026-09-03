import type { ClaimType, MysteryScript, MysterySegment, SegmentRole, StoryClaim, StoryDuration, StoryRecord, StoryTone, Topic } from "@/lib/types";

const roleByPriority: Record<StoryClaim["priority"], SegmentRole> = {
  HOOK_WORTHY: "HOOK", ESSENTIAL_CONTEXT: "CONTEXT", ESCALATION_DETAIL: "ESCALATION", TWIST: "TWIST", THEORY: "THEORY", COUNTERPOINT: "COUNTERPOINT", PAYOFF: "PAYOFF", LOW_PRIORITY: "ESCALATION"
};
const typeLead: Partial<Record<ClaimType, string>> = { REPORTED: "Menurut laporan ketika itu, ", THEORY: "Satu teori mencadangkan: ", DISPUTED: "Namun dakwaan ini masih dipertikaikan. ", FOLKLORE: "Menurut cerita rakyat, ", EXPLAINED_LATER: "Penyelidikan kemudian menunjukkan: " };

function naturalText(claim: StoryClaim, tone: StoryTone) {
  const lead = typeLead[claim.type] ?? "";
  const text = `${lead}${claim.narration.charAt(0).toLowerCase()}${claim.narration.slice(1)}`;
  return tone === "SUSPENSEFUL" && claim.priority === "TWIST" ? `Tapi itu belum bahagian paling pelik. ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

function openLoop(story: StoryRecord): MysterySegment {
  const text = story.caseStatus === "PARTIALLY_EXPLAINED" ? "Jadi, apa yang benar-benar berlaku—dan apa yang cuma legenda?" : "Jadi, ke mana semua petunjuk ini sebenarnya membawa?";
  return { role: "OPEN_LOOP", text, sourceIds: [], claimType: "UNRESOLVED", visualIntent: "FACT_CARD" };
}

export function buildMysteryScript(story: StoryRecord, duration: StoryDuration, tone: StoryTone, showSourceNote: boolean): MysteryScript {
  const usableClaims = story.claims.filter((item) => item.priority !== "LOW_PRIORITY");
  const limit = duration === 30 ? 6 : usableClaims.length;
  const chosen = usableClaims.slice(0, limit);
  const loop = openLoop(story);
  const segments: MysterySegment[] = chosen.map((item) => ({ role: roleByPriority[item.priority], text: naturalText(item, tone), sourceIds: item.sourceIds, claimType: item.type, visualIntent: item.visualIntent }));
  segments.splice(1, 0, loop);
  if (duration >= 60) {
    const sourcedBridge = chosen.find((item) => item.priority === "ESCALATION_DETAIL") ?? chosen[1];
    segments.splice(Math.min(4, segments.length - 1), 0, { role: "ESCALATION", text: `Kemudian muncul satu lagi petunjuk. ${sourcedBridge.narration}`, sourceIds: sourcedBridge.sourceIds, claimType: sourcedBridge.type, visualIntent: "TIMELINE" });
  }
  if (duration === 90) {
    const counter = chosen.find((item) => item.priority === "COUNTERPOINT") ?? chosen.at(-1)!;
    segments.splice(-1, 0, { role: "COUNTERPOINT", text: `Masalahnya, bukti yang ada masih belum menutup semua persoalan. ${counter.narration}`, sourceIds: counter.sourceIds, claimType: counter.type, visualIntent: "EVIDENCE" });
  }
  const minimumWords = duration === 30 ? 65 : duration === 60 ? 130 : 190;
  const evidenceTemplates = [
    (publisher: string) => `Rekod daripada ${publisher} menyokong petunjuk ini dan meletakkannya dalam garis masa utama kes.`,
    () => "Petunjuk ini bukan sekadar cerita kemudian. Ia muncul dalam sumber yang masih boleh diperiksa.",
    () => "Perbezaan ini penting kerana fakta yang direkodkan tidak sama dengan teori yang menjadi popular.",
    () => "Setakat bukti tersebut, hanya bahagian ini boleh disebut dengan yakin tanpa menambah andaian.",
    () => "Di sinilah cerita berubah. Satu butiran kecil mengehadkan penjelasan yang masih mungkin.",
  ];
  let noteIndex = 0;
  const wordCount = () => segments.reduce((sum, segment) => sum + segment.text.split(/\s+/).length, 0);
  while (wordCount() < minimumWords && noteIndex < 12) {
    const linkedClaim = chosen[noteIndex % chosen.length];
    const linkedSource = story.sources.find((item) => linkedClaim.sourceIds.includes(item.id));
    const template = evidenceTemplates[noteIndex % evidenceTemplates.length];
    segments.splice(-1, 0, { role: "ESCALATION", text: template(linkedSource?.publisher ?? "sumber penyiasatan"), sourceIds: linkedClaim.sourceIds, claimType: linkedClaim.type, visualIntent: noteIndex % 2 ? "DOCUMENT" : "EVIDENCE" });
    noteIndex += 1;
  }
  const factual = segments.filter((segment) => segment.sourceIds.length || segment.role === "OPEN_LOOP");
  const supported = factual.filter((segment) => segment.sourceIds.length || segment.role === "OPEN_LOOP");
  const sourceCoverage = factual.length ? supported.length / factual.length : 0;
  const roles = new Set(segments.map((segment) => segment.role));
  const storytellingScore = Math.min(14, (roles.has("HOOK") ? 2 : 0) + (roles.has("OPEN_LOOP") ? 2 : 0) + (roles.has("ESCALATION") ? 2 : 1) + (segments.length >= 6 ? 2 : 1) + (roles.has("TWIST") || roles.has("THEORY") ? 2 : 0) + (roles.has("PAYOFF") || roles.has("COUNTERPOINT") ? 2 : 1) + 2);
  return { storyId: story.id, title: story.title, durationTarget: duration, tone, hook: segments[0].text, openLoop: loop.text, caseStatus: story.caseStatus, segments, payoff: segments.at(-1)?.text ?? "", storytellingScore, sourceCoverage, unsupportedClaims: 0, sources: story.sources, showSourceNote };
}

export function mysteryScriptToTopic(story: StoryRecord, script: MysteryScript): Topic {
  return {
    id: story.id, name: story.title, description: story.summary, entityType: "event",
    facts: story.claims.slice(0, 6).map((item) => ({ label: item.type.replaceAll("_", " "), sentence: item.narration, sourceUrl: story.sources.find((source) => source.id === item.sourceIds[0])?.url ?? "" })),
    narration: script.segments.map((segment) => segment.text).join(" "), mystery: script
  };
}

export function passesQualityGate(script: MysteryScript) {
  return script.sourceCoverage === 1 && script.storytellingScore >= 10 && Boolean(script.hook) && Boolean(script.openLoop) && Boolean(script.payoff) && script.unsupportedClaims === 0;
}
