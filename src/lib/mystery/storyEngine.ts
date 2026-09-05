import type { ClaimType, MysteryScript, MysterySegment, SegmentRole, StoryClaim, StoryDuration, StoryRecord, StoryTone, Topic } from "@/lib/types";
import { calculateScriptQuality } from "../story/qualityScoring.ts";

const roleByPriority: Record<StoryClaim["priority"], SegmentRole> = {
  HOOK_WORTHY: "HOOK", ESSENTIAL_CONTEXT: "CONTEXT", ESCALATION_DETAIL: "ESCALATION", TWIST: "TWIST", THEORY: "THEORY", COUNTERPOINT: "COUNTERPOINT", PAYOFF: "PAYOFF", LOW_PRIORITY: "ESCALATION"
};
const typeLead: Partial<Record<ClaimType, string>> = { REPORTED: "Menurut laporan ketika itu, ", THEORY: "Satu teori mencadangkan: ", DISPUTED: "Namun dakwaan ini masih dipertikaikan. ", FOLKLORE: "Menurut cerita rakyat, ", EXPLAINED_LATER: "Penyelidikan kemudian menunjukkan: " };
const aiRole: Record<NonNullable<StoryRecord["aiNarration"]>["segments"][number]["role"], SegmentRole> = {
  HOOK: "HOOK", CONTEXT: "CONTEXT", DEVELOPMENT: "ESCALATION", TURN_PAYOFF: "PAYOFF"
};

function naturalText(claim: StoryClaim, tone: StoryTone) {
  const lead = typeLead[claim.type] ?? "";
  const text = `${lead}${claim.narration.charAt(0).toLowerCase()}${claim.narration.slice(1)}`;
  return tone === "SUSPENSEFUL" && claim.priority === "TWIST" ? `Tapi itu belum bahagian paling pelik. ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

function openLoop(story: StoryRecord): MysterySegment {
  const fallback: Record<StoryRecord["caseStatus"], string> = {
    SOLVED: "Apakah urutan bukti yang membawa kepada kesimpulan itu?",
    UNSOLVED: "Apakah yang masih belum dapat dipastikan daripada rekod ini?",
    PARTIALLY_EXPLAINED: "Apakah urutan peristiwa yang dapat dipastikan daripada laporan ini?",
    LEGEND: "Bahagian manakah direkodkan, dan bahagian manakah kekal sebagai cerita rakyat?",
    REPORTED_CLAIM: "Apakah yang benar-benar dilaporkan, dan apakah yang belum dapat disahkan?",
    DISPUTED: "Bahagian manakah disokong oleh rekod, dan bahagian manakah masih dipertikaikan?",
  };
  const title = story.title.toLowerCase();
  const topicSpecific = /helmsman|jurumudi/.test(title) ? "Apakah yang ditemukan apabila operasi mencari jurumudi itu diteruskan?"
    : /missing|hilang/.test(title) ? "Apakah yang berlaku kepada individu yang dilaporkan hilang itu?" : null;
  const text = story.unresolvedQuestions?.[0]?.text ?? topicSpecific ?? fallback[story.caseStatus];
  const grounded = story.unresolvedQuestions?.[0];
  return { role: "OPEN_LOOP", text, sourceIds: grounded?.sourceIds ?? [], claimType: "UNRESOLVED", visualIntent: "FACT_CARD" };
}

export function effectiveStoryDuration(story: StoryRecord, requested: StoryDuration): StoryDuration {
  const supported = story.supportedDurationSeconds;
  return supported && requested > supported ? supported : requested;
}

export function buildMysteryScript(story: StoryRecord, duration: StoryDuration, tone: StoryTone, showSourceNote: boolean): MysteryScript {
  const effectiveDuration = effectiveStoryDuration(story, duration);
  if (story.aiNarration?.segments.length && effectiveDuration > 20) {
    const byId = new Map(story.claims.map((claim) => [claim.id, claim]));
    const segments: MysterySegment[] = story.aiNarration.segments.map((segment) => {
      const claims = segment.claimIds.flatMap((id) => { const claim = byId.get(id); return claim ? [claim] : []; });
      const strongest = claims.find((claim) => claim.type !== "VERIFIED") ?? claims[0];
      return { role: aiRole[segment.role], text: segment.text, sourceIds: segment.sourceIds,
        claimType: strongest?.type ?? "VERIFIED", visualIntent: strongest?.visualIntent ?? "FACT_CARD" };
    });
    const quality = calculateScriptQuality(segments, story.sources, story.storyCompletenessScore);
    return { storyId: story.id, title: story.title, durationTarget: effectiveDuration, tone, hook: segments[0]?.text ?? "", openLoop: "",
      caseStatus: story.caseStatus, segments, payoff: segments.at(-1)?.text ?? "", ...quality, storyCompletenessScore: story.storyCompletenessScore, sources: story.sources, showSourceNote };
  }
  const usableClaims = story.claims.filter((item) => item.priority !== "LOW_PRIORITY");
  const limit = story.supportedDurationSeconds
    ? effectiveDuration <= 15 ? 2 : effectiveDuration <= 30 ? 4 : effectiveDuration <= 45 ? 7 : usableClaims.length
    : effectiveDuration === 30 ? 6 : usableClaims.length;
  const chosen = usableClaims.slice(0, limit);
  const loop = openLoop(story);
  const segments: MysterySegment[] = chosen.map((item) => ({ role: roleByPriority[item.priority], text: naturalText(item, tone), sourceIds: item.sourceIds, claimType: item.type, visualIntent: item.visualIntent }));
  const groundedHook = story.hookCandidates?.[0];
  if (segments[0] && groundedHook) segments[0] = { ...segments[0], role: "HOOK", text: groundedHook.text, sourceIds: groundedHook.sourceIds };
  if (effectiveDuration > 20) segments.splice(1, 0, loop);
  const groundedPayoff = story.payoff;
  if (groundedPayoff?.text && segments.length > 1) segments[segments.length - 1] = { ...segments[segments.length - 1], role: "PAYOFF", text: groundedPayoff.text, sourceIds: groundedPayoff.sourceIds };
  const quality = calculateScriptQuality(segments, story.sources, story.storyCompletenessScore);
  return { storyId: story.id, title: story.title, durationTarget: effectiveDuration, tone, hook: segments[0].text, openLoop: effectiveDuration > 20 ? loop.text : "", caseStatus: story.caseStatus, segments, payoff: groundedPayoff?.text ?? segments.at(-1)?.text ?? "", ...quality, storyCompletenessScore: story.storyCompletenessScore, sources: story.sources, showSourceNote };
}

export function mysteryScriptToTopic(story: StoryRecord, script: MysteryScript): Topic {
  return {
    id: story.id, name: story.title, description: story.summary, entityType: "event",
    facts: story.claims.slice(0, 6).map((item) => ({ label: item.type.replaceAll("_", " "), sentence: item.narration, sourceUrl: story.sources.find((source) => source.id === item.sourceIds[0])?.url ?? "" })),
    narration: script.segments.map((segment) => segment.text).join(" "), mystery: script
  };
}

export function passesQualityGate(script: MysteryScript) {
  return script.sourceCoverage === 1 && script.storytellingScore >= 10 && script.structureScore >= .65 && script.sourceQualityScore === 1
    && script.narrationQualityScore >= .78 && script.repetitionScore >= .7 && Boolean(script.hook)
    && Boolean(script.payoff) && script.unsupportedClaims === 0;
}
