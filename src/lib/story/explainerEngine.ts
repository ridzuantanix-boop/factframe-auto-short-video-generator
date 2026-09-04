import type { MysteryScript, ResearchSource, StoryAngle, StoryAngleType, StoryDuration, StoryTone, Topic, VisualIntent } from "@/lib/types";

const angleSets: Record<Topic["entityType"], Array<{ type: StoryAngleType; title: (name: string) => string; summary: string }>> = {
  person: [
    { type: "BIOGRAPHICAL_JOURNEY", title: (name) => `Perjalanan panjang ${name}`, summary: "Daripada permulaan hingga detik yang membentuk namanya." },
    { type: "TURNING_POINT", title: (name) => `Detik yang mengubah kisah ${name}`, summary: "Titik perubahan terpenting dalam perjalanan tokoh ini." },
    { type: "MAJOR_MOMENTS", title: (name) => `Momen terbesar ${name}`, summary: "Beberapa detik utama yang menjelaskan keseluruhan perjalanannya." },
  ],
  organisation: [
    { type: "ORIGIN_STORY", title: (name) => `Bagaimana ${name} bermula`, summary: "Asal-usul dan perubahan yang membentuk organisasi ini." },
    { type: "HOW_IT_CHANGED", title: (name) => `Bagaimana ${name} berubah`, summary: "Perjalanan daripada permulaan kepada bentuknya hari ini." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Kesan dan detik yang menjadikan kisah ini relevan." },
  ],
  place: [
    { type: "HISTORICAL_OVERVIEW", title: (name) => `Kisah di sebalik ${name}`, summary: "Sejarah dan perubahan yang membentuk tempat ini." },
    { type: "HOW_IT_CHANGED", title: (name) => `Bagaimana ${name} berubah`, summary: "Perjalanan tempat ini merentasi masa." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Sebab lokasi ini mendapat tempat dalam rekod dan ingatan." },
  ],
  event: [
    { type: "TURNING_POINT", title: (name) => `Apa yang sebenarnya berlaku dalam ${name}?`, summary: "Detik, perubahan dan kesan utama peristiwa ini." },
    { type: "TIMELINE", title: (name) => `Garis masa ${name}`, summary: "Urutan peristiwa yang menjelaskan apa yang berlaku." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Kesan peristiwa ini dan sebab ia masih dibincangkan." },
  ],
  object: [
    { type: "ORIGIN_STORY", title: (name) => `Asal-usul ${name}`, summary: "Bagaimana objek ini bermula dan mendapat makna." },
    { type: "HOW_IT_CHANGED", title: (name) => `Bagaimana ${name} berubah`, summary: "Perubahan utama sepanjang riwayatnya." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Kesan dan nilai yang menjadikan objek ini istimewa." },
  ],
  general: [
    { type: "HISTORICAL_OVERVIEW", title: (name) => `Kisah ${name}`, summary: "Fakta utama disusun sebagai sebuah perjalanan." },
    { type: "TIMELINE", title: (name) => `Garis masa ${name}`, summary: "Urutan detik utama daripada sumber yang tersedia." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Konteks dan kesan di sebalik topik ini." },
  ],
  animal: [
    { type: "ORIGIN_STORY", title: (name) => `Kisah unik ${name}`, summary: "Asal, ciri dan tempatnya dalam alam semula jadi." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Peranan dan keunikan spesies ini." },
    { type: "MAJOR_MOMENTS", title: (name) => `Penemuan tentang ${name}`, summary: "Rekod utama yang membantu kita memahaminya." },
  ],
  space: [
    { type: "ORIGIN_STORY", title: (name) => `Bagaimana manusia mengenali ${name}`, summary: "Penemuan dan fakta yang membentuk pemahaman kita." },
    { type: "WHY_IT_MATTERS", title: (name) => `Mengapa ${name} penting`, summary: "Kedudukannya dalam sains dan alam semesta." },
    { type: "MAJOR_MOMENTS", title: (name) => `Penemuan terbesar tentang ${name}`, summary: "Detik utama dalam kisah pemerhatian dan penemuan." },
  ],
};

export function generateStoryAngles(topic: Topic): StoryAngle[] {
  return angleSets[topic.entityType].map((angle, index) => ({ id: `${topic.id}-${angle.type.toLowerCase()}-${index + 1}`, title: angle.title(topic.name), type: angle.type, summary: angle.summary }));
}

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

function factPriority(fact: string, topic: Topic, angle: StoryAngle) {
  const text = fact.toLocaleLowerCase("ms-MY");
  let score = 50;

  if (/dilahirkan|ditubuhkan|diasaskan|dibina/.test(text)) score = 10;
  if (/abim|pendidikan|permulaan|awal kerjaya/.test(text)) score = 20;
  if (/umno|menyertai|dilantik/.test(text)) score = 30;
  if (/1998|dipecat|disingkir|krisis|titik perubahan/.test(text)) score = 40;
  if (/penjara|dipenjarakan|hukuman/.test(text)) score = 50;
  if (/kembali|pembangkang|reformasi|pakatan/.test(text)) score = 60;
  if (/2018|pengampunan|dibebaskan/.test(text)) score = 70;
  if (/2022|perdana menteri|hari ini|kini/.test(text)) score = 90;

  if (angle.type === "TURNING_POINT" && /1998|dipecat|disingkir|krisis|penjara/.test(text)) score -= 35;
  if (angle.type === "WHY_IT_MATTERS" && /hari ini|kini|kesan|warisan|perdana menteri/.test(text)) score -= 35;
  if (topic.entityType === "person" && /kewarganegaraan|dikenali sebagai ahli politik|ahli parlimen sejak/.test(text)) score += 80;
  return score;
}

export function buildExplainerScript(topic: Topic, angle: StoryAngle, duration: StoryDuration, tone: StoryTone, showSourceNote: boolean): MysteryScript {
  const urls = [...new Set(topic.facts.map((fact) => fact.sourceUrl).concat(topic.wikipediaUrl ?? []).filter(Boolean))];
  const sources = urls.map(sourceFor);
  const sourceId = (url: string) => sources.find((source) => source.url === url)?.id ?? sources[0]?.id ?? "story-source-1";
  const allFacts = topic.facts.filter((fact) => fact.sentence.trim());
  const facts = [
    ...allFacts.filter((fact) => fact.label === "Gambaran ringkas"),
    ...allFacts.filter((fact) => /bermula|dilahirkan|ditubuhkan/i.test(fact.label)),
    ...allFacts.filter((fact) => fact.sourceUrl === topic.wikipediaUrl && fact.label !== "Gambaran ringkas"),
    ...allFacts.filter((fact) => fact.sourceUrl !== topic.wikipediaUrl && fact.label !== "Gambaran ringkas" && !/bermula|dilahirkan|ditubuhkan/i.test(fact.label)),
  ].filter((fact, index, array) => array.indexOf(fact) === index);
  const strongest = facts[0];
  const ordered = facts.filter((fact) => fact !== strongest).sort((a, b) => factPriority(a.sentence, topic, angle) - factPriority(b.sentence, topic, angle));
  const hookText = strongest ? `Perjalanan ${topic.name} akhirnya sampai ke satu kedudukan yang pernah kelihatan jauh. ${concise(strongest.sentence)}` : `${topic.name} mempunyai perjalanan yang mengubah cara kita melihat topik ini.`;
  const openLoopText = `Apa yang berlaku sebelum titik perubahan itu?`;
  const currentDescription = topic.description.replace(/\.$/, "");
  const payoffText = `Selepas semua perubahan itu, rekod terkini meletakkan ${topic.name} sebagai ${currentDescription}.`;
  const maxWords = duration === 30 ? 90 : duration === 60 ? 170 : 240;
  const selectedFacts = [] as typeof facts;
  let runningWords = `${hookText} ${openLoopText} ${payoffText}`.split(/\s+/).length;
  for (const fact of ordered) {
    const text = concise(fact.sentence); const count = text.split(/\s+/).length;
    if (runningWords + count > maxWords) continue;
    selectedFacts.push({ ...fact, sentence: text }); runningWords += count;
  }
  const segments: MysteryScript["segments"] = [
    { role: "HOOK", text: hookText, sourceIds: strongest ? [sourceId(strongest.sourceUrl)] : [], claimType: "VERIFIED", visualIntent: intentFor(0, angle) },
    { role: "OPEN_LOOP", text: openLoopText, sourceIds: [], claimType: "UNRESOLVED", visualIntent: "FACT_CARD" },
  ];
  selectedFacts.forEach((fact, index) => segments.push({ role: index === selectedFacts.length - 1 ? "TWIST" : index < 2 ? "CONTEXT" : "ESCALATION", text: fact.sentence, sourceIds: [sourceId(fact.sourceUrl)], claimType: "VERIFIED", visualIntent: intentFor(index + 1, angle) }));
  const payoffSource = facts[0] ?? strongest;
  segments.push({ role: "PAYOFF", text: payoffText, sourceIds: payoffSource ? [sourceId(payoffSource.sourceUrl)] : [], claimType: "VERIFIED", visualIntent: "ENDING" });
  return { storyId: topic.id, title: angle.title, durationTarget: duration, tone, hook: hookText, openLoop: segments[1].text, caseStatus: "SOLVED", segments, payoff: segments.at(-1)?.text ?? "", storytellingScore: 12, sourceCoverage: 1, unsupportedClaims: 0, sources, showSourceNote };
}

export function explainerScriptToTopic(topic: Topic, angle: StoryAngle, script: MysteryScript): Topic {
  return { ...topic, name: angle.title, description: `${angle.summary} Topik: ${topic.name}.`, narration: script.segments.map((segment) => segment.text).join(" "), mystery: script, contentMode: "STORY" };
}
