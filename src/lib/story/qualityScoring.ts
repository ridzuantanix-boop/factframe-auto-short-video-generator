import type { MysteryScript, MysterySegment, ResearchSource } from "@/lib/types";

const stopwords = new Set(["yang", "dan", "atau", "dengan", "daripada", "untuk", "pada", "dalam", "ialah", "adalah", "itu", "ini", "sebuah", "the", "and", "with", "from", "into", "was", "were"]);

function tokens(text: string) {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2 && !stopwords.has(token)));
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  return [...left].filter((token) => right.has(token)).length / Math.min(left.size, right.size);
}

function isNarrativeQuestion(segment: MysterySegment) { return segment.role === "OPEN_LOOP" && /\?$/.test(segment.text.trim()); }
function factualSegments(segments: MysterySegment[]) { return segments.filter((segment) => !isNarrativeQuestion(segment)); }

export function calculateSourceCoverage(segments: MysterySegment[], sources: ResearchSource[]) {
  const factual = factualSegments(segments);
  if (!factual.length) return 0;
  const validIds = new Set(sources.map((source) => source.id));
  return factual.filter((segment) => segment.sourceIds.length > 0 && segment.sourceIds.every((id) => validIds.has(id))).length / factual.length;
}

export function calculateUnsupportedClaims(segments: MysterySegment[], sources: ResearchSource[]) {
  const validIds = new Set(sources.map((source) => source.id));
  return factualSegments(segments).filter((segment) => !segment.sourceIds.length || segment.sourceIds.some((id) => !validIds.has(id))).length;
}

export function calculateRepetitionScore(segments: MysterySegment[]) {
  const factual = factualSegments(segments);
  if (factual.length < 2) return 1;
  let repeats = 0;
  for (let index = 1; index < factual.length; index += 1) {
    const current = tokens(factual[index].text);
    const currentDates = new Set(factual[index].text.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) ?? []);
    const repeated = factual.slice(0, index).some((previous) => {
      const similarity = overlap(current, tokens(previous.text));
      const previousDates = new Set(previous.text.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) ?? []);
      return similarity >= 0.72 || ([...currentDates].some((date) => previousDates.has(date)) && similarity >= 0.48);
    });
    if (repeated) repeats += 1;
  }
  return Math.max(0, 1 - repeats / (factual.length - 1));
}

export function calculateStorytellingScore(input: Pick<MysteryScript, "segments" | "sources">) {
  const { segments, sources } = input;
  if (!segments.length) return 0;
  const hook = segments.find((segment) => segment.role === "HOOK");
  const loop = segments.find((segment) => segment.role === "OPEN_LOOP");
  const payoff = [...segments].reverse().find((segment) => segment.role === "PAYOFF" || segment.role === "COUNTERPOINT");
  const factual = factualSegments(segments);
  const coverage = calculateSourceCoverage(segments, sources);
  const repetition = calculateRepetitionScore(segments);
  let score = 0;
  if (hook?.text.trim()) score += 1;
  if (hook?.sourceIds.length && hook.text.split(/\s+/).length <= 35) score += 1;
  if (loop && /\?/.test(loop.text)) score += 2;
  if (new Set(factual.map((segment) => segment.role)).size >= 3) score += 1;
  if (factual.length >= 4 && coverage >= 0.8) score += 1;
  if (segments.some((segment) => segment.role === "TWIST" || /\b(?:but|however|yet|tetapi|namun|kemudian|akhirnya)\b/i.test(segment.text))) score += 2;
  if (payoff?.text.trim()) score += 1;
  if (payoff && hook && overlap(tokens(payoff.text), tokens(hook.text)) < 0.7) score += 1;
  const wordCounts = factual.map((segment) => segment.text.trim().split(/\s+/).length);
  if (wordCounts.length && wordCounts.every((count) => count >= 4 && count <= 38)) score += 1;
  if (new Set(wordCounts).size >= Math.min(3, wordCounts.length)) score += 1;
  score += repetition >= 0.9 ? 2 : repetition >= 0.7 ? 1 : 0;
  return Math.min(14, score);
}

export function calculateStructureScore(segments: MysterySegment[]) {
  if (!segments.length) return 0;
  const roles = segments.map((segment) => segment.role); const factual = factualSegments(segments); let score = 0;
  if (roles[0] === "HOOK" && segments[0].text.trim()) score += .25;
  if (roles.includes("OPEN_LOOP") || factual.length >= 2) score += .15;
  if (roles.some((role) => ["CONTEXT", "ESCALATION"].includes(role)) || factual.length >= 2) score += .2;
  if (roles.some((role) => ["TWIST", "COUNTERPOINT"].includes(role)) || factual.length >= 3) score += .15;
  if (roles.at(-1) === "PAYOFF" && segments.at(-1)?.text.trim()) score += .25;
  return Number(Math.min(1, score).toFixed(3));
}

export function calculateNarrationQualityScore(segments: MysterySegment[]) {
  const spoken = segments.filter((segment) => segment.role !== "OPEN_LOOP"); if (!spoken.length) return 0;
  const english = /\b(?:the|was|were|is|are|after|before|missing|saved|ship|search|found|body|murder|investigation|arrested|reported|yesterday|since|capsized)\b/i;
  const ocr = /[�■<>]|\b\d+[a-z]{2,}\b|\b(?:7fwo|whioh|ctfc|lowrtt|iolunes|gintir)\b/i;
  const complete = spoken.filter((segment) => /[.!?]$/.test(segment.text.trim()) && segment.text.trim().split(/\s+/).length >= 5).length / spoken.length;
  const clean = spoken.filter((segment) => !english.test(segment.text) && !ocr.test(segment.text)).length / spoken.length;
  const varied = calculateRepetitionScore(segments);
  return Number(Math.max(0, Math.min(1, complete * .4 + clean * .4 + varied * .2)).toFixed(3));
}

export function calculateScriptQuality(segments: MysterySegment[], sources: ResearchSource[], storyCompletenessScore = 0) {
  const sourceCoverage = calculateSourceCoverage(segments, sources); const unsupportedClaims = calculateUnsupportedClaims(segments, sources);
  const measuredStructure = calculateStructureScore(segments); const structureScore = storyCompletenessScore >= .9 && factualSegments(segments).length <= 2 ? Math.max(.75, measuredStructure) : measuredStructure;
  const sourceQualityScore = Number((sourceCoverage * (unsupportedClaims ? .5 : 1)).toFixed(3));
  const narrationQualityScore = calculateNarrationQualityScore(segments); const repetitionScore = calculateRepetitionScore(segments);
  return {
    sourceCoverage, unsupportedClaims, repetitionScore, structureScore, sourceQualityScore, narrationQualityScore,
    storytellingScore: Number((14 * (structureScore * .4 + sourceQualityScore * .3 + narrationQualityScore * .3)).toFixed(1)),
  };
}
