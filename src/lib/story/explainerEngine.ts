import { generateDynamicStoryAngles, rankFactsByImportance } from "./angleResearch.ts";
import { calculateScriptQuality } from "./qualityScoring.ts";
import type { MysteryScript, ResearchSource, StoryAngle, StoryDuration, StoryTone, Topic, VisualIntent } from "@/lib/types";

export function generateStoryAngles(topic: Topic): StoryAngle[] { return generateDynamicStoryAngles(topic); }

function sourceFor(url: string, index: number): ResearchSource {
  const isWikipedia = /wikipedia\.org/.test(url);
  return { id: `story-source-${index + 1}`, title: isWikipedia ? "Rencana latar Wikipedia" : "Rekod entiti Wikidata", publisher: isWikipedia ? "Wikipedia" : "Wikidata", type: "REFERENCE", url, accessedAt: new Date().toISOString().slice(0, 10), reliabilityLevel: "REFERENCE" };
}

function intentFor(index: number, angle: StoryAngle): VisualIntent {
  const timelines: VisualIntent[] = ["PORTRAIT", "TIMELINE", "LOCATION", "DOCUMENT", "EVIDENCE", "ENDING"];
  const origins: VisualIntent[] = ["ARCHIVAL_PHOTO", "TIMELINE", "DOCUMENT", "LOCATION", "FACT_CARD", "ENDING"];
  return (angle.type === "TIMELINE" || angle.type === "BIOGRAPHICAL_JOURNEY" ? timelines : origins)[index % 6];
}

function concise(sentence: string) {
  if (sentence.split(/\s+/).length <= 22) return sentence;
  const clause = sentence.split(/;|,(?=\s+(?:dan|tetapi|kemudian|yang|selepas|sebelum|pada))/i)[0].trim();
  if (clause.split(/\s+/).length >= 8 && clause.split(/\s+/).length <= 24) return `${clause.replace(/[.!?]+$/, "")}.`;
  const shortened = sentence.split(/\s+/).slice(0, 22).join(" ").replace(/\s+(?:dan|atau|pada|dalam|dari|daripada|yang|untuk|dengan|sebagai|kepada)$/i, "");
  return `${shortened.replace(/[.,;:]$/, "")}.`;
}

function eventHook(topic: Topic, ranked: ReturnType<typeof rankFactsByImportance>[number]) {
  const fact = concise(ranked.fact.sentence);
  if (ranked.kinds.some((kind) => ["CONFLICT", "CRISIS", "SETBACK", "LEGAL"].includes(kind))) return `${fact} Detik ini mengubah arah cerita ${topic.name}.`;
  if (ranked.kinds.some((kind) => ["ACHIEVEMENT", "BREAKTHROUGH", "AWARD", "DISCOVERY"].includes(kind))) return `${fact} Pencapaian itu tidak muncul secara tiba-tiba.`;
  if (ranked.kinds.some((kind) => ["CURRENT", "LEADERSHIP", "APPOINTMENT"].includes(kind))) return `${fact} Rekod sebelumnya menunjukkan jalan ke tahap itu.`;
  return `${fact} Di sinilah satu perubahan penting mula kelihatan.`;
}

function eventOpenLoop(topic: Topic, ranked: ReturnType<typeof rankFactsByImportance>[number]) {
  if (ranked.kinds.some((kind) => ["CONFLICT", "CRISIS", "SETBACK", "LEGAL"].includes(kind))) return `Bagaimana ${topic.name} bergerak selepas cabaran itu?`;
  if (ranked.kinds.some((kind) => ["ACHIEVEMENT", "BREAKTHROUGH", "AWARD", "DISCOVERY"].includes(kind))) return "Peristiwa mana yang membuka jalan kepada pencapaian itu?";
  return `Apakah perubahan yang membawa ${topic.name} ke detik tersebut?`;
}

function chronological(items: ReturnType<typeof rankFactsByImportance>) {
  return [...items].sort((a, b) => {
    if (a.year && b.year) return a.year - b.year;
    if (a.year) return -1;
    if (b.year) return 1;
    return b.importance - a.importance;
  });
}

export function buildExplainerScript(topic: Topic, angle: StoryAngle, duration: StoryDuration, tone: StoryTone, showSourceNote: boolean): MysteryScript {
  const urls = [...new Set(topic.facts.map((fact) => fact.sourceUrl).concat(topic.wikipediaUrl ?? []).filter((url) => /^https?:\/\//.test(url)))];
  const sources = urls.map(sourceFor);
  const sourceId = (url: string) => sources.find((source) => source.url === url)?.id;
  const ranked = rankFactsByImportance(topic).filter((item) => sourceId(item.fact.sourceUrl));
  const rankedById = new Map(ranked.map((item) => [item.id, item]));
  const supported = angle.supportingFactIds.map((id) => rankedById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const strongest = supported[0] ?? ranked[0];
  if (!strongest) throw new Error("Sudut cerita ini tidak mempunyai fakta bersumber.");
  const endingCandidates = ranked.filter((item) => item.id !== strongest.id && item.kinds.some((kind) => ["CURRENT", "LEGACY", "DEATH", "AWARD", "ACHIEVEMENT", "COMEBACK"].includes(kind)));
  const ending = endingCandidates[0] ?? ranked.find((item) => item.id !== strongest.id) ?? strongest;
  const hookText = eventHook(topic, strongest);
  const openLoopText = eventOpenLoop(topic, strongest);
  const payoffText = ending.id === strongest.id ? `Itulah peristiwa yang paling menonjol dalam sumber tersedia tentang ${topic.name}.` : `Akhirnya, ${concise(ending.fact.sentence).replace(/^./, (letter) => letter.toLowerCase())}`;
  const maxWords = duration === 30 ? 90 : duration === 60 ? 170 : 240;
  const pool = chronological([...supported, ...ranked].filter((item, index, all) => item.id !== strongest.id && item.id !== ending.id && all.findIndex((candidate) => candidate.id === item.id) === index));
  const chosen = [] as typeof pool;
  let runningWords = `${hookText} ${openLoopText} ${payoffText}`.split(/\s+/).length;
  for (const item of pool) {
    const count = concise(item.fact.sentence).split(/\s+/).length;
    if (runningWords + count > maxWords) continue;
    chosen.push(item); runningWords += count;
  }
  const segments: MysteryScript["segments"] = [
    { role: "HOOK", text: hookText, sourceIds: [sourceId(strongest.fact.sourceUrl)!], claimType: "VERIFIED", visualIntent: intentFor(0, angle) },
    { role: "OPEN_LOOP", text: openLoopText, sourceIds: [], claimType: "UNRESOLVED", visualIntent: "FACT_CARD" },
  ];
  chosen.forEach((item, index) => {
    const turning = item.kinds.some((kind) => ["CONFLICT", "CRISIS", "SETBACK", "LEGAL", "COMEBACK", "BREAKTHROUGH", "AWARD"].includes(kind));
    const role = turning ? "TWIST" : index < 2 ? "CONTEXT" : "ESCALATION";
    segments.push({ role, text: concise(item.fact.sentence), sourceIds: [sourceId(item.fact.sourceUrl)!], claimType: "VERIFIED", visualIntent: intentFor(index + 1, angle) });
  });
  segments.push({ role: "PAYOFF", text: payoffText, sourceIds: [sourceId(ending.fact.sourceUrl)!], claimType: "VERIFIED", visualIntent: "ENDING" });
  const quality = calculateScriptQuality(segments, sources);
  return { storyId: topic.id, title: angle.title, durationTarget: duration, tone, hook: hookText, openLoop: openLoopText, caseStatus: "SOLVED", segments, payoff: payoffText, ...quality, sources, showSourceNote };
}

export function explainerScriptToTopic(topic: Topic, angle: StoryAngle, script: MysteryScript): Topic {
  return { ...topic, name: angle.title, description: `${angle.summary} Topik: ${topic.name}.`, narration: script.segments.map((segment) => segment.text).join(" "), mystery: script, contentMode: "STORY" };
}
