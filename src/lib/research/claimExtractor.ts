import { createHash } from "node:crypto";
import type { StoryCandidate } from "../types.ts";
import type { StoredStorySource } from "../archive/types.ts";
import type { RawResearchClaim } from "./types.ts";

const STOPWORDS = new Set(["the", "and", "that", "this", "with", "from", "into", "were", "was", "are", "for", "but", "after", "before", "have", "has", "had", "its", "their", "his", "her", "yang", "dan", "dengan", "pada", "dari"]);
// Generic event language only. Keep this list entity-, year-, organisation-, and country-agnostic.
const ACTION = /\b(?:accident|attack(?:ed|s|ing)?|abduct(?:ed|s|ing|ion)?|acquit(?:ted|s|ting|tal)?|arrest(?:ed|s|ing)?|believ(?:e|ed|es|ing)|burn(?:ed|t|s|ing)?|charg(?:e|ed|es|ing)|claim(?:ed|s|ing)?|collaps(?:e|ed|es|ing)|concern(?:ed|s|ing)?|confess(?:ed|es|ing|ion)?|contain(?:ed|s|ing)?|convict(?:ed|s|ing|ion)?|crash(?:ed|es|ing)?|death|dead|describ(?:e|ed|es|ing)|detain(?:ed|s|ing)?|die(?:d|s|ing)?|discover(?:ed|s|ing|y)?|disappear(?:ed|s|ing|ance)?|end(?:ed|s|ing)?|escap(?:e|ed|es|ing)|explod(?:e|ed|es|ing)|explosion|finds?|fire|flood(?:ed|s|ing)?|found|happen(?:ed|s|ing)?|haunt(?:ed|s|ing)?|hear(?:d|s|ing)?|held|identif(?:y|ied|ies|ying)|injur(?:e|ed|es|ing|y|ies)|investigat(?:e|ed|es|ing|ion)?|kidnap(?:ped|s|ping)?|kill(?:ed|s|ing)?|left|missing|murder(?:ed|s|ing)?|occur(?:red|s|ring)?|open(?:ed|s|ing)?|question(?:ed|s|ing)?|record(?:ed|s|ing)?|recover(?:ed|s|ing|y)?|remand(?:ed|s|ing)?|remain(?:ed|s|ing)?|report(?:ed|s|ing)?|rescu(?:e|ed|es|ing)|return(?:ed|s|ing)?|said|saw|search(?:ed|es|ing)?|sentenc(?:e|ed|es|ing)|shot|show(?:ed|n|s|ing)?|sustain(?:ed|s|ing)?|tried|trial|vanish(?:ed|es|ing)?)\b/i;

function decode(value: string) {
  return value.replace(/&gt;/gi, ">").replace(/&lt;/gi, "<").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeResearchClaim(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2 && !STOPWORDS.has(token)).join(" ");
}

export function calculateOcrQuality(value: string) {
  const clean = decode(value); if (!clean) return 0;
  const characters = [...clean]; const readable = characters.filter((char) => /[\p{L}\p{N}\s.,'"():;!?-]/u.test(char)).length / characters.length;
  const words = clean.split(/\s+/); const anomalousWords = words.filter((word) => /^[^\p{L}\p{N}]*[\p{L}]?[^\p{L}\p{N}]*$/u.test(word)
    || /\d[\p{L}]|[\p{L}]\d/u.test(word) || /[<>■�]|\.-|-'|';/u.test(word)).length;
  const fragments = anomalousWords / Math.max(1, words.length);
  const mojibake = (clean.match(/[�ÂÃ]|&[a-z]+;/gi) ?? []).length / Math.max(1, words.length);
  const anomalyPenalty = Math.min(.45, anomalousWords * .14);
  return Number(Math.max(0, Math.min(1, readable - fragments * .65 - mojibake * .8 - anomalyPenalty)).toFixed(3));
}

function claimType(candidate: StoryCandidate) {
  if (candidate.storyType === "FOLKLORE" || candidate.storyType === "URBAN_LEGEND_SOURCE") return "FOLKLORE" as const;
  if (["DISAPPEARANCE", "UNEXPLAINED_EVENT"].includes(candidate.storyType)) return "UNRESOLVED" as const;
  return "REPORTED" as const;
}

function visualIntent(candidate: StoryCandidate, text: string) {
  if (/\b(?:date|year|month|day|later|after|before|today|yesterday|19\d{2}|20\d{2})\b/i.test(text)) return "TIMELINE" as const;
  if (/\b(?:police|court|report|record|document|inquest|trial)\b/i.test(text)) return "DOCUMENT" as const;
  if (/\b(?:river|road|village|kampong|town|city|district|mountain|sea|beach)\b/i.test(text)) return "LOCATION" as const;
  if (["PARANORMAL_REPORT", "FOLKLORE", "UNEXPLAINED_EVENT"].includes(candidate.storyType)) return "THEORY_CARD" as const;
  return "ARCHIVAL_PHOTO" as const;
}

function candidateChunks(source: StoredStorySource) {
  const title = decode(source.title).replace(/[.!?]+$/, ""); let body = decode(source.snippet);
  if (body.toLowerCase().startsWith(title.toLowerCase())) body = body.slice(title.length).replace(/^[\s:;,.—-]+/, "");
  body = body.replace(/\.{3,}\s*$/, "").trim();
  const sentences = body.split(/(?<=[.!?])\s+|;\s+/).map((item) => item.trim()).filter(Boolean);
  const expanded = sentences.flatMap((sentence) => {
    if (sentence.split(/\s+/).length < 18) return [sentence];
    const clauses = sentence.split(/,\s+(?=(?:but|while|after|before|when|police|the |a |an |he |she |they |his |her )\b)/i).map((item) => item.trim());
    return clauses.length > 1 ? clauses : [sentence];
  });
  const rich = expanded.filter((item) => {
    const words = item.split(/\s+/); return words.length >= 4 && words.length <= 55 && ACTION.test(item);
  });
  const headlineParts = title.split(/:\s+|—\s+|\.\s+/).map((item) => item.trim()).filter((item) => item.split(/\s+/).length >= 3 && ACTION.test(item));
  const output = [...rich];
  for (const headline of headlineParts) {
    const normalizedHeadline = normalizeResearchClaim(headline); const headlineTokens = new Set(normalizedHeadline.split(/\s+/));
    const duplicatesBody = rich.some((item) => {
      const bodyTokens = new Set(normalizeResearchClaim(item).split(/\s+/));
      const overlap = [...headlineTokens].filter((token) => bodyTokens.has(token)).length / Math.max(1, Math.min(headlineTokens.size, bodyTokens.size));
      return overlap >= .8;
    });
    if (!duplicatesBody) output.unshift(headline);
  }
  return output.slice(0, 5);
}

function values(metadata: Record<string, unknown>, key: string) {
  return Array.isArray(metadata[key]) ? (metadata[key] as unknown[]).map(String).filter(Boolean) : [];
}

export function extractClaimsFromSource(candidate: StoryCandidate, source: StoredStorySource): RawResearchClaim[] {
  const quality = calculateOcrQuality(`${source.title} ${source.snippet}`); if (quality < .42) return [];
  const locations = [...new Set([...values(source.metadata, "extractedLocations"), candidate.region].filter((item) => item && item !== "Unknown"))];
  const people = [...new Set(values(source.metadata, "extractedPeople"))];
  const seen = new Set<string>(); const result: RawResearchClaim[] = [];
  for (const [index, chunk] of candidateChunks(source).entries()) {
    const text = decode(chunk).replace(/^[,.;:—-]+|[,;:—-]+$/g, "").trim(); const normalized = normalizeResearchClaim(text);
    if (normalized.split(/\s+/).length < 3 || seen.has(normalized)) continue; seen.add(normalized);
    if (/\b(?:a|an|and|at|by|for|from|in|of|on|or|the|to|when|where|which|who|whose|with|whose body)\s*$/i.test(text)) continue;
    const chunkQuality = calculateOcrQuality(text); if (chunkQuality < .58) continue;
    const id = createHash("sha256").update(`${candidate.id}:${source.id}:${normalized}`).digest("hex").slice(0, 32);
    result.push({ id, storyCandidateId: candidate.id, claimText: text, normalizedClaim: normalized, claimType: claimType(candidate),
      confidence: quality >= .7 ? "MEDIUM" : "LOW", sourceIds: [source.id], eventDate: source.publishedAt,
      people, locations, priority: index === 0 ? "ESSENTIAL_CONTEXT" : "ESCALATION_DETAIL", visualIntent: visualIntent(candidate, text),
      ocrQuality: Math.min(quality, chunkQuality), sourcePublisher: source.publisher, sourceProvider: source.provider });
  }
  return result;
}

export function extractClaimsFromSources(candidate: StoryCandidate, sources: StoredStorySource[]) {
  return sources.flatMap((source) => extractClaimsFromSource(candidate, source));
}
