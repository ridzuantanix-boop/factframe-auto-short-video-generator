import type { MysteryScript, ResearchSource, StoryDuration, StoryTone, Topic, VisualIntent } from "@/lib/types";
import { calculateScriptQuality } from "../story/qualityScoring.ts";

function sourceFor(url: string, index: number): ResearchSource {
  const wikipedia = /wikipedia\.org/.test(url);
  return { id: `auto-source-${index + 1}`, title: wikipedia ? "Rencana latar Wikipedia" : "Rekod entiti Wikidata", publisher: wikipedia ? "Wikipedia" : "Wikidata", type: "REFERENCE", url, accessedAt: new Date().toISOString().slice(0, 10), reliabilityLevel: "REFERENCE" };
}

function shorten(text: string, limit = 25) {
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return `${words.slice(0, limit).join(" ").replace(/\s+(?:dan|atau|pada|dalam|yang|untuk|dengan)$/i, "").replace(/[.,;:]$/, "")}.`;
}

export function buildAutoMysteryScript(topic: Topic, duration: StoryDuration, tone: StoryTone, showSourceNote: boolean): MysteryScript {
  const urls = [...new Set(topic.facts.map((fact) => fact.sourceUrl).concat(topic.wikipediaUrl ?? []).filter(Boolean))];
  const sources = urls.map(sourceFor);
  const sourceId = (url: string) => sources.find((source) => source.url === url)?.id ?? sources[0]?.id ?? "auto-source-1";
  const maxFacts = duration === 30 ? 3 : duration === 60 ? 6 : 9;
  const facts = topic.facts.filter((fact) => fact.sentence.trim()).slice(0, maxFacts);
  const hook = `${topic.name} meninggalkan satu persoalan penting: apa yang sebenarnya berlaku?`;
  const intents: VisualIntent[] = ["LOCATION", "TIMELINE", "DOCUMENT", "EVIDENCE", "ARCHIVAL_PHOTO", "FACT_CARD"];
  const segments: MysteryScript["segments"] = [
    { role: "HOOK", text: hook, sourceIds: facts[0] ? [sourceId(facts[0].sourceUrl)] : [], claimType: "VERIFIED", visualIntent: "ARCHIVAL_PHOTO" },
    { role: "OPEN_LOOP", text: "Jawapannya muncul apabila rekod disusun semula satu demi satu.", sourceIds: [], claimType: "UNRESOLVED", visualIntent: "FACT_CARD" },
    ...facts.map((fact, index) => ({ role: index === facts.length - 1 ? "TWIST" as const : index < 2 ? "CONTEXT" as const : "ESCALATION" as const, text: shorten(fact.sentence), sourceIds: [sourceId(fact.sourceUrl)], claimType: "VERIFIED" as const, visualIntent: intents[index % intents.length] })),
    { role: "PAYOFF", text: `Berdasarkan sumber yang tersedia, inilah gambaran paling kukuh tentang ${topic.name}—tanpa menukar spekulasi menjadi fakta.`, sourceIds: facts[0] ? [sourceId(facts[0].sourceUrl)] : [], claimType: "EXPLAINED_LATER", visualIntent: "ENDING" },
  ];
  const quality = calculateScriptQuality(segments, sources);
  return { storyId: topic.id, title: `Apa Sebenarnya Berlaku: ${topic.name}?`, durationTarget: duration, tone, hook, openLoop: segments[1].text, caseStatus: "PARTIALLY_EXPLAINED", segments, payoff: segments.at(-1)?.text ?? "", ...quality, sources, showSourceNote };
}

export function autoMysteryScriptToTopic(topic: Topic, script: MysteryScript): Topic {
  return { ...topic, name: script.title, description: `Kisah penyiasatan automatik berasaskan rekod tentang ${topic.name}.`, narration: script.segments.map((segment) => segment.text).join(" "), mystery: script, contentMode: "MYSTERY" };
}
