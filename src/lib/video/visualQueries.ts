import type { StoryRecord, VisualIntent } from "../types.ts";

const fillerWords = new Set(["yang", "dan", "dengan", "daripada", "selepas", "sebuah", "masih", "untuk", "telah", "tidak", "boleh", "pada", "dari", "itu"]);

export function visualKeywords(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((word) => word.length > 3 && !fillerWords.has(word));
}

export function mh370VisualQueries(text: string, intent: VisualIntent) {
  const lower = text.toLowerCase();
  if (/berlepas|kuala lumpur|beijing/.test(lower)) return ["MH370 Kuala Lumpur departure Malaysia Airlines 2014", "Malaysia Airlines Boeing 777 airport 2014"];
  if (/radar|berpatah balik/.test(lower)) return ["MH370 flight path Malaysia map", "MH370 turn back route Malay Peninsula"];
  if (/satelit|lautan hindi/.test(lower)) return ["MH370 satellite arc Indian Ocean map", "Indian Ocean MH370 search area"];
  if (/serpihan/.test(lower)) return ["MH370 debris Réunion flaperon", "MH370 aircraft debris investigation"];
  if (intent === "ENDING") return ["Indian Ocean aircraft search", "MH370 search area map Indian Ocean"];
  return ["MH370 search operation Indian Ocean", "Malaysia Airlines search aircraft 2014"];
}

export function buildVisualQueries(story: StoryRecord, text: string, intent: VisualIntent) {
  const detail = visualKeywords(text).slice(0, 5).join(" ");
  const intentTerms: Record<VisualIntent, string> = {
    ARCHIVAL_PHOTO: "historical archive", PORTRAIT: "portrait", LOCATION: `${story.region} location`, MAP: `${story.region} route map`,
    NEWSPAPER: "newspaper archive", DOCUMENT: "official document archive", TIMELINE: `${story.year} historical event`, THEORY_CARD: "evidence",
    FACT_CARD: "documentary", EVIDENCE: "search operation evidence", ENDING: `${story.region} wide view`,
  };
  const specific = story.id === "mh370" ? mh370VisualQueries(text, intent) : [];
  return [...specific, ...story.visualSearchTerms.slice(0, 2), `${story.title} ${detail}`, `${story.title} ${intentTerms[intent]}`, `${story.region} ${story.year} ${detail}`]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query, index, all) => Boolean(query) && all.indexOf(query) === index)
    .slice(0, 4);
}
