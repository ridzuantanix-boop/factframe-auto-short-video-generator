import type { SearchResult } from "../types.ts";
import type { Entity } from "../data/wikidata.ts";

export type GeographyConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type MysteryPotential = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type GeographyEvidence = { type: string; value: string; entityId?: string; property?: string };
export type GeographyClassification = { country: string; region: string; geographyConfidence: GeographyConfidence; geographyEvidence: GeographyEvidence[] };
export type EntityClassification = GeographyClassification & { storyType: string; storyTypeEvidence: string[]; mysteryPotential: MysteryPotential };

const MALAYSIA_ID = "Q833";
const COUNTRY_PROPERTIES = ["P17", "P27", "P495"];
const LOCATION_PROPERTIES = ["P131", "P276"];
const HISTORICAL_PROPERTIES = ["P361", "P1269"];
const GRAPH_PROPERTIES = [...COUNTRY_PROPERTIES, ...LOCATION_PROPERTIES, ...HISTORICAL_PROPERTIES, "P31"];
const STATE_TERMS: Array<[RegExp, string]> = [
  [/\b(kuala lumpur|putrajaya|labuan)\b/i, "Federal Territories"], [/\bselangor\b/i, "Selangor"],
  [/\b(penang|pulau pinang)\b/i, "Penang"], [/\bjohor\b/i, "Johor"], [/\bperak\b/i, "Perak"],
  [/\bkedah\b/i, "Kedah"], [/\bkelantan\b/i, "Kelantan"], [/\bterengganu\b/i, "Terengganu"],
  [/\bpahang\b/i, "Pahang"], [/\bnegeri sembilan\b/i, "Negeri Sembilan"],
  [/\b(melaka|malacca)\b/i, "Melaka"], [/\bsabah\b/i, "Sabah"], [/\bsarawak\b/i, "Sarawak"],
];
const MALAYSIA_TEXT = /\b(malaysia|malaysian|malaya|malayan|federation of malaya|british malaya|straits settlements)\b/i;
const HISTORICAL_TEXT = /\b(malaya|malayan|federation of malaya|british malaya|straits settlements|federated malay states|unfederated malay states|malacca sultanate|johor sultanate|kedah sultanate|raj of sarawak|north borneo)\b/i;

function claimValues(entity: Entity | undefined, property: string) {
  return (entity?.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter(Boolean);
}

export function claimEntityIds(entity: Entity | undefined, properties = GRAPH_PROPERTIES) {
  return [...new Set(properties.flatMap((property) => claimValues(entity, property).map((value) => (value as { id?: string }).id).filter((id): id is string => Boolean(id))))];
}

function idsFor(entity: Entity | undefined, properties: string[]) {
  return [...new Set(properties.flatMap((property) => claimValues(entity, property).map((value) => (value as { id?: string }).id).filter((id): id is string => Boolean(id))))];
}

function label(entity: Entity | undefined) { return entity?.labels?.en?.value ?? entity?.labels?.ms?.value ?? entity?.id ?? "Unknown"; }
function entityText(entity: Entity | undefined) { return [entity?.labels?.en?.value, entity?.labels?.ms?.value, entity?.descriptions?.en?.value, entity?.descriptions?.ms?.value].filter(Boolean).join(" "); }

function coordinates(entity: Entity | undefined) {
  const value = claimValues(entity, "P625")[0] as { latitude?: number; longitude?: number } | undefined;
  return typeof value?.latitude === "number" && typeof value.longitude === "number" ? { latitude: value.latitude, longitude: value.longitude } : null;
}

export function coordinatesInsideMalaysia(latitude: number, longitude: number) {
  const peninsula = latitude >= 0.8 && latitude <= 7.6 && longitude >= 99.5 && longitude <= 104.9;
  const borneo = latitude >= 0.8 && latitude <= 7.6 && longitude >= 109.4 && longitude <= 119.6;
  return peninsula || borneo;
}

function pathToMalaysia(startIds: string[], graph: Map<string, Entity>, maxDepth = 5) {
  let frontier = [...new Set(startIds)]; const visited = new Set<string>();
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (frontier.includes(MALAYSIA_ID)) return { matched: MALAYSIA_ID, depth };
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue; visited.add(id);
      const linked = idsFor(graph.get(id), [...COUNTRY_PROPERTIES, "P131", "P361"]);
      if (linked.includes(MALAYSIA_ID)) return { matched: id, depth: depth + 1 };
      next.push(...linked);
    }
    frontier = [...new Set(next)];
  }
  return null;
}

function explicitTextClassification(item: Pick<SearchResult, "label" | "description">): GeographyClassification {
  const text = `${item.label} ${item.description}`;
  const state = STATE_TERMS.find(([pattern]) => pattern.test(text))?.[1];
  if (state || MALAYSIA_TEXT.test(text)) return { country: "Malaysia", region: state ?? "Malaysia / Malaya", geographyConfidence: "LOW", geographyEvidence: [{ type: HISTORICAL_TEXT.test(text) ? "EXPLICIT_HISTORICAL_TEXT" : "EXPLICIT_ENTITY_TEXT", value: state ?? "Malaysia" }] };
  return { country: "Unknown", region: "Unknown", geographyConfidence: "UNKNOWN", geographyEvidence: [] };
}

export function classifyLocationFromText(item: Pick<SearchResult, "label" | "description">) { return explicitTextClassification(item); }

export function classifyStoryTypeFromText(item: Pick<SearchResult, "label" | "description">) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  if (/film|movie|television|tv series|album|song|novel|book|documentary|filem|drama|muzik/.test(text)) return "ENTERTAINMENT";
  if (/human|person|politician|scientist|actor|actress|artist|athlete|entrepreneur|born|tokoh|pelakon|penyanyi/.test(text)) return "BIOGRAPHY";
  if (/company|organisation|organization|business|brand|syarikat|pertubuhan/.test(text)) return "ORGANISATION";
  if (/unsolved|mystery|disappearance|missing person|haunted|ghost|unexplained|urban legend|misteri|kehilangan|berhantu/.test(text)) return "MYSTERY";
  if (/event|battle|accident|disaster|election|expedition|games|collapse|peristiwa|bencana|tragedi/.test(text)) return "EVENT";
  if (/city|town|island|building|place|district|state|country|landmark|castle|mountain|pass|bandar|pulau|bangunan|tempat|gunung/.test(text)) return "PLACE";
  if (/discovery|invention|technology|species|scientific|ciptaan|teknologi|saintifik/.test(text)) return "SCIENCE";
  return "EXPLAINER";
}

export function calculateMysteryPotential(item: Pick<SearchResult, "label" | "description">): MysteryPotential {
  const text = `${item.label} ${item.description}`.toLowerCase();
  if (/unsolved|mystery|disappearance|missing person|murder|haunted|ghost|unexplained|urban legend|misteri|kehilangan|pembunuhan|berhantu/.test(text)) return "HIGH";
  if (/legend|folklore|disaster|collapse|accident|strange|horror|seram|legenda|cerita rakyat|bencana|tragedi/.test(text)) return "MEDIUM";
  if (/crime|death|ruin|abandoned|jenayah|kematian|terbiar/.test(text)) return "LOW";
  return "UNKNOWN";
}

export function classifyEntityEvidence(item: Pick<SearchResult, "label" | "description">, entity: Entity | undefined, graph: Map<string, Entity>): EntityClassification {
  const directCountries = COUNTRY_PROPERTIES.flatMap((property) => idsFor(entity, [property]).map((id) => ({ id, property })));
  const malaysiaDirect = directCountries.find(({ id }) => id === MALAYSIA_ID);
  const historicalCountries = directCountries.filter(({ id }) => HISTORICAL_TEXT.test(entityText(graph.get(id))));
  const modernNonMalaysia = directCountries.filter(({ id }) => id !== MALAYSIA_ID && !HISTORICAL_TEXT.test(entityText(graph.get(id))));
  let geography: GeographyClassification;
  if (malaysiaDirect) {
    geography = { country: "Malaysia", region: "Malaysia", geographyConfidence: "HIGH", geographyEvidence: [{ type: "WIKIDATA_COUNTRY", value: "Malaysia", entityId: MALAYSIA_ID, property: malaysiaDirect.property }] };
  } else if (modernNonMalaysia.length) {
    const direct = modernNonMalaysia[0]; geography = { country: label(graph.get(direct.id)), region: label(graph.get(direct.id)), geographyConfidence: "HIGH", geographyEvidence: [{ type: "WIKIDATA_COUNTRY", value: label(graph.get(direct.id)), entityId: direct.id, property: direct.property }] };
  } else if (historicalCountries.length) {
    const direct = historicalCountries[0]; geography = { country: "Malaysia", region: label(graph.get(direct.id)), geographyConfidence: "MEDIUM", geographyEvidence: [{ type: "WIKIDATA_HISTORICAL_COUNTRY", value: label(graph.get(direct.id)), entityId: direct.id, property: direct.property }] };
  } else {
    const locations = idsFor(entity, LOCATION_PROPERTIES); const malaysiaPath = pathToMalaysia(locations, graph);
    if (malaysiaPath) geography = { country: "Malaysia", region: locations.length ? label(graph.get(locations[0])) : "Malaysia", geographyConfidence: "MEDIUM", geographyEvidence: [{ type: "WIKIDATA_LOCATION_HIERARCHY", value: locations.map((id) => label(graph.get(id))).join(" > ") || "Malaysia", entityId: malaysiaPath.matched }] };
    else {
      const point = coordinates(entity);
      if (point && coordinatesInsideMalaysia(point.latitude, point.longitude)) geography = { country: "Malaysia", region: "Malaysia coordinates", geographyConfidence: "MEDIUM", geographyEvidence: [{ type: "WIKIDATA_COORDINATES", value: `${point.latitude},${point.longitude}`, property: "P625" }] };
      else {
        const historicalIds = idsFor(entity, HISTORICAL_PROPERTIES); const historical = historicalIds.find((id) => HISTORICAL_TEXT.test(entityText(graph.get(id))));
        if (historical) geography = { country: "Malaysia", region: "Historical Malaya", geographyConfidence: "MEDIUM", geographyEvidence: [{ type: "WIKIDATA_HISTORICAL_RELATION", value: label(graph.get(historical)), entityId: historical }] };
        else if (point) geography = { country: "Global", region: "Outside Malaysia", geographyConfidence: "MEDIUM", geographyEvidence: [{ type: "WIKIDATA_COORDINATES_OUTSIDE_MALAYSIA", value: `${point.latitude},${point.longitude}`, property: "P625" }] };
        else geography = explicitTextClassification(item);
      }
    }
  }
  const instanceText = idsFor(entity, ["P31"]).map((id) => entityText(graph.get(id))).join(" ");
  const evidenceText = `${item.label} ${item.description} ${entityText(entity)} ${instanceText}`;
  const storyType = classifyStoryTypeFromText({ label: item.label, description: evidenceText });
  return { ...geography, storyType, storyTypeEvidence: instanceText ? ["WIKIDATA_INSTANCE_OF", "ENTITY_TEXT"] : ["ENTITY_TEXT"], mysteryPotential: calculateMysteryPotential({ label: item.label, description: evidenceText }) };
}
