import type { Fact, StoryAngle, StoryAngleType, Topic } from "@/lib/types";

export type EventKind = "EARLY" | "APPOINTMENT" | "ACHIEVEMENT" | "BREAKTHROUGH" | "CONFLICT" | "CRISIS" | "SETBACK" | "LEGAL" | "COMEBACK" | "LEADERSHIP" | "AWARD" | "DISCOVERY" | "DEATH" | "CURRENT" | "LEGACY" | "MILESTONE";
export type RankedFact = { id: string; fact: Fact; kinds: EventKind[]; importance: number; year?: number };

const signalGroups: Array<{ kind: EventKind; weight: number; terms: string[] }> = [
  { kind: "CURRENT", weight: 30, terms: ["currently", "incumbent", "today", "now", "kini", "semasa", "terkini"] },
  { kind: "COMEBACK", weight: 29, terms: ["comeback", "returned", "re-elected", "revived", "kembali", "bangkit", "dipilih semula"] },
  { kind: "BREAKTHROUGH", weight: 28, terms: ["breakthrough", "pioneered", "launched", "debuted", "breakout", "kejayaan besar", "pelopor", "memperkenalkan", "memperluas"] },
  { kind: "DISCOVERY", weight: 28, terms: ["discovered", "invented", "developed", "patented", "discovery", "invention", "menemui", "mencipta", "membangunkan", "paten"] },
  { kind: "AWARD", weight: 27, terms: ["award", "prize", "medal", "honour", "honor", "oscar", "anugerah", "hadiah", "pingat", "dinobatkan"] },
  { kind: "LEADERSHIP", weight: 26, terms: ["leader", "president", "chair", "chief", "director", "minister", "governor", "ketua", "pemimpin", "pengerusi", "pengarah", "menteri", "menerajui"] },
  { kind: "APPOINTMENT", weight: 25, terms: ["appointed", "elected", "promoted", "selected", "became", "joined", "dilantik", "dipilih", "dinaikkan", "menyertai", "menjadi"] },
  { kind: "ACHIEVEMENT", weight: 24, terms: ["won", "achieved", "record", "success", "first", "founded", "co-founded", "recognition", "acclaim", "menang", "mencapai", "rekod", "berjaya", "pertama", "mengasaskan", "pengiktirafan"] },
  { kind: "LEGAL", weight: 23, terms: ["arrested", "convicted", "sentenced", "trial", "court", "incarcerated", "ditahan", "disabitkan", "dihukum", "perbicaraan", "mahkamah"] },
  { kind: "CRISIS", weight: 22, terms: ["crisis", "disaster", "collapse", "accident", "emergency", "krisis", "bencana", "runtuh", "kemalangan", "darurat"] },
  { kind: "CONFLICT", weight: 21, terms: ["conflict", "controversy", "protest", "opposition", "dispute", "clash", "konflik", "kontroversi", "bantahan", "pertikaian"] },
  { kind: "SETBACK", weight: 20, terms: ["failed", "defeat", "loss", "resigned", "bankrupt", "decline", "ousted", "dismissed", "removed", "gagal", "kalah", "meletak jawatan", "muflis", "merosot", "singkir", "diberhentikan"] },
  { kind: "DEATH", weight: 18, terms: ["died", "death", "passed away", "meninggal", "kematian", "wafat"] },
  { kind: "LEGACY", weight: 17, terms: ["legacy", "influence", "impact", "remembered", "warisan", "pengaruh", "kesan", "dikenang"] },
  { kind: "EARLY", weight: 10, terms: ["born", "childhood", "education", "graduated", "began", "started", "early", "dilahirkan", "zaman kecil", "pendidikan", "bermula", "memulakan", "awal"] },
];

export function factId(topic: Topic, fact: Fact, index: number) { return fact.id ?? `${topic.id}-fact-${index + 1}`; }

export function analyzeFact(topic: Topic, fact: Fact, index: number): RankedFact {
  const text = `${fact.label} ${fact.sentence}`.toLocaleLowerCase("ms-MY");
  const matched = signalGroups.filter((group) => group.terms.some((term) => text.includes(term)));
  const yearMatch = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  const sourceBonus = /^https?:\/\//.test(fact.sourceUrl) ? 8 : 0;
  const kindScore = matched.reduce((maximum, group) => Math.max(maximum, group.weight), 8);
  const specificity = Math.min(10, (year ? 4 : 0) + Math.min(6, new Set(text.match(/[\p{L}\p{N}]+/gu) ?? []).size / 6));
  return { id: factId(topic, fact, index), fact, kinds: matched.length ? matched.map((group) => group.kind) : ["MILESTONE"], importance: Math.min(100, kindScore + sourceBonus + specificity), year };
}

export function rankFactsByImportance(topic: Topic) {
  return topic.facts.map((fact, index) => analyzeFact(topic, fact, index)).sort((a, b) => b.importance - a.importance || (b.year ?? 0) - (a.year ?? 0));
}

function shortLabel(item: RankedFact) {
  const label = item.fact.label.replace(/^(?:Gambaran ringkas|Overview)$/i, "").trim();
  if (label) return label.replace(/[.!?]+$/, "");
  return item.fact.sentence.split(/\s+/).slice(0, 7).join(" ").replace(/[.!?]+$/, "");
}

function angle(id: string, title: string, type: StoryAngleType, summary: string, facts: RankedFact[], bonus = 0): StoryAngle {
  const support = [...new Map(facts.map((item) => [item.id, item])).values()];
  const average = support.reduce((sum, item) => sum + item.importance, 0) / support.length;
  return { id, title, type, summary, supportingFactIds: support.map((item) => item.id), narrativePotentialScore: Math.min(100, Math.round(average + Math.min(18, support.length * 4) + bonus)) };
}

export function generateDynamicStoryAngles(topic: Topic): StoryAngle[] {
  const facts = topic.facts.map((fact, index) => analyzeFact(topic, fact, index)).filter((item) => item.fact.sentence.trim() && /^https?:\/\//.test(item.fact.sourceUrl));
  if (!facts.length) return [];
  const byKinds = (...kinds: EventKind[]) => facts.filter((item) => item.kinds.some((kind) => kinds.includes(kind))).sort((a, b) => b.importance - a.importance);
  const chronological = [...facts].filter((item) => item.year).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const candidates: StoryAngle[] = [];
  const turning = byKinds("COMEBACK", "BREAKTHROUGH", "DISCOVERY", "AWARD", "LEADERSHIP", "APPOINTMENT", "LEGAL", "CRISIS", "SETBACK", "CONFLICT");
  if (turning.length) {
    const strongest = turning[0];
    candidates.push(angle(`${topic.id}-turning-${strongest.id}`, `${topic.name}: Di sebalik ${shortLabel(strongest)}`, "TURNING_POINT", `Menelusuri peristiwa bersumber yang menjadikan ${shortLabel(strongest).toLowerCase()} satu titik perubahan.`, turning.slice(0, 3), 8));
  }
  const achievements = byKinds("BREAKTHROUGH", "DISCOVERY", "AWARD", "ACHIEVEMENT");
  if (achievements.length >= 2) candidates.push(angle(`${topic.id}-achievement`, `Bagaimana ${shortLabel(achievements[0])} mengubah kisah ${topic.name}`, "MAJOR_MOMENTS", "Menghubungkan pencapaian utama dengan peristiwa yang membawa kepadanya.", achievements.slice(0, 4), 6));
  const challenges = byKinds("CONFLICT", "CRISIS", "SETBACK", "LEGAL");
  const recovery = byKinds("COMEBACK", "CURRENT", "LEADERSHIP", "APPOINTMENT");
  if (challenges.length) {
    const support = [challenges[0], ...recovery.slice(0, 2)];
    candidates.push(angle(`${topic.id}-challenge`, `${shortLabel(challenges[0])}: Apa yang berlaku selepas itu?`, "HOW_IT_CHANGED", "Menyusun cabaran, akibat dan perubahan seterusnya tanpa menambah andaian.", support, recovery.length ? 9 : 3));
  }
  if (chronological.length >= 2) {
    const first = chronological[0]; const last = chronological.at(-1)!;
    candidates.push(angle(`${topic.id}-journey`, `${topic.name}: Dari ${shortLabel(first)} ke ${shortLabel(last)}`, "BIOGRAPHICAL_JOURNEY", `Perjalanan berasaskan rekod dari ${first.year} hingga ${last.year}.`, chronological.slice(0, 5), 5));
  }
  const legacy = byKinds("LEGACY", "CURRENT", "DEATH", "AWARD", "DISCOVERY", "ACHIEVEMENT");
  const legacyAnchor = legacy.find((item) => item.kinds.some((kind) => ["LEGACY", "CURRENT", "DEATH"].includes(kind)));
  if (legacy.length >= 2 && legacyAnchor) candidates.push(angle(`${topic.id}-legacy`, `Warisan ${topic.name} selepas ${shortLabel(legacyAnchor)}`, "WHY_IT_MATTERS", `Menilai kesan dan kedudukan ${topic.name} melalui fakta bersumber yang tersedia.`, [legacyAnchor, ...legacy.filter((item) => item.id !== legacyAnchor.id)].slice(0, 4), 4));
  if (!candidates.length) {
    const ranked = [...facts].sort((a, b) => b.importance - a.importance).slice(0, 4);
    candidates.push(angle(`${topic.id}-evidence`, `${topic.name}: Kisah di sebalik ${shortLabel(ranked[0])}`, "HISTORICAL_OVERVIEW", "Menyusun fakta terkuat yang boleh diperiksa kepada satu cerita.", ranked));
  }
  return [...new Map(candidates.map((candidate) => [candidate.title.toLowerCase(), candidate])).values()]
    .sort((a, b) => b.narrativePotentialScore - a.narrativePotentialScore)
    .slice(0, 5);
}
