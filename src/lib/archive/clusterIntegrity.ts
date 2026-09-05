import type { StoredStorySource } from "./types.ts";

export type ClusterConfidence = "HIGH" | "MEDIUM" | "LOW";
export type ValidatedSourceCluster = { sources: StoredStorySource[]; confidence: ClusterConfidence; evidence: string[] };

const GENERIC = new Set("the a an and or of in on at to for from by with after before still report reports reported search missing found body police page column news malaya malaysia singapore johor perak sarawak accident murder woman girl man boat ship".split(" "));
const JUNK_ENTITY = /^(?:from our|our correspondent|staff reporter|special correspondent|police|court|page|column|girl|woman|man|body|missing|search|accident|murder)/i;

function tokens(value: string) {
  return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2 && !GENERIC.has(token)));
}
function values(source: StoredStorySource, key: string) {
  const value = source.metadata[key];
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter((item) => item.length > 2 && !JUNK_ENTITY.test(item)) : [];
}
function intersection(left: string[], right: string[]) {
  const other = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => other.has(item.toLowerCase()));
}
function tokenSimilarity(left: string, right: string) {
  const a = tokens(left); const b = tokens(right); const union = new Set([...a, ...b]);
  return union.size ? [...a].filter((token) => b.has(token)).length / union.size : 0;
}
function dayDistance(left: string | null, right: string | null) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(left) - Date.parse(right)) / 86_400_000;
}

export function sourcesDescribeSameEvent(left: StoredStorySource, right: StoredStorySource) {
  if (left.url === right.url) return true;
  const days = dayDistance(left.publishedAt, right.publishedAt);
  const people = intersection(values(left, "extractedPeople"), values(right, "extractedPeople"));
  const locations = intersection(values(left, "extractedLocations"), values(right, "extractedLocations"));
  const similarity = tokenSimilarity(`${left.title} ${left.snippet}`, `${right.title} ${right.snippet}`);
  if (days <= 30) return people.length > 0 || similarity >= .34 || (locations.length > 0 && similarity >= .18);
  if (days <= 90) return people.length > 0 && (locations.length > 0 || similarity >= .2);
  if (!Number.isFinite(days)) return people.length >= 2 || (people.length > 0 && locations.length > 0 && similarity >= .42) || similarity >= .7;
  return people.length >= 2 && locations.length > 0 && similarity >= .45;
}

function confidenceFor(sources: StoredStorySource[]): ClusterConfidence {
  if (sources.length === 1) return "MEDIUM";
  const distances = sources.flatMap((source, index) => sources.slice(index + 1).map((other) => dayDistance(source.publishedAt, other.publishedAt)));
  const maximum = distances.filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);
  const allDated = sources.every((source) => Boolean(source.publishedAt));
  if (allDated && maximum <= 30) return "HIGH";
  if (maximum <= 365 || distances.every((value) => !Number.isFinite(value))) return "MEDIUM";
  return "LOW";
}

export function validateSourceCluster(sources: StoredStorySource[]) {
  const groups: StoredStorySource[][] = [];
  for (const source of sources) {
    const matching = groups.find((group) => group.some((member) => sourcesDescribeSameEvent(member, source)));
    if (matching) matching.push(source); else groups.push([source]);
  }
  const clusters: ValidatedSourceCluster[] = groups.map((group) => ({ sources: group, confidence: confidenceFor(group),
    evidence: group.length === 1 ? ["single independently traceable archive report"] : [`${group.length} reports linked by date and entity continuity`] }));
  return { coherent: clusters.length <= 1 && clusters[0]?.confidence !== "LOW", clusters,
    confidence: clusters.length === 1 ? clusters[0].confidence : "LOW" as ClusterConfidence };
}
