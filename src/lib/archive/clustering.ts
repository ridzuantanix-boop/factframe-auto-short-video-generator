import type { ExtractedArchiveEvent } from "./types.ts";

export type ArchiveCluster = { key: string; events: ExtractedArchiveEvent[] };
function overlap(left: string[], right: string[]) { const b = new Set(right.map((value) => value.toLowerCase())); return left.some((value) => b.has(value.toLowerCase())); }
function similarity(left: string[], right: string[]) { const a = new Set(left); const b = new Set(right); const union = new Set([...a, ...b]); if (!union.size) return 0; return [...a].filter((token) => b.has(token)).length / union.size; }
function days(left: string | null, right: string | null) { if (!left || !right) return Number.POSITIVE_INFINITY; return Math.abs(Date.parse(left) - Date.parse(right)) / 86_400_000; }
function sameEvent(left: ExtractedArchiveEvent, right: ExtractedArchiveEvent) {
  const tokenScore = similarity(left.headlineTokens, right.headlineTokens); const locationMatch = overlap(left.locations, right.locations);
  if (left.document.url === right.document.url) return true;
  const dateDistance = days(left.eventDate, right.eventDate); const personMatch = overlap(left.people, right.people);
  if (left.incidentType !== right.incidentType) return false;
  if (dateDistance <= 30) return tokenScore >= .55 || (locationMatch && tokenScore >= .28) || (personMatch && tokenScore >= .18);
  if (dateDistance <= 90) return personMatch && locationMatch && tokenScore >= .2;
  if (!Number.isFinite(dateDistance)) return personMatch && locationMatch && tokenScore >= .48;
  return false;
}
function clusterKey(event: ExtractedArchiveEvent) {
  const date = event.eventDate?.slice(0, 10) ?? "undated"; const location = event.locations[0] ?? "unknown";
  return `${event.incidentType}:${location}:${date}:${event.headlineTokens.slice(0, 6).sort().join("-")}`.toLowerCase().replace(/[^a-z0-9:-]+/g, "-");
}

export function clusterArchiveEvents(events: ExtractedArchiveEvent[]) {
  const unique = [...new Map(events.map((event) => [`${event.document.provider}:${event.document.url}`, event])).values()];
  const clusters: ArchiveCluster[] = [];
  for (const event of unique) {
    const cluster = clusters.find((candidate) => candidate.events.some((member) => sameEvent(member, event)));
    if (cluster) cluster.events.push(event); else clusters.push({ key: clusterKey(event), events: [event] });
  }
  return { clusters, duplicateMerges: events.length - clusters.length };
}
