import type { ArchiveClaimStatus, ArchiveDocument, ArchiveStoryType, ExtractedArchiveEvent, HistoricalContext } from "./types.ts";

const LOCATION_ALIASES: Array<{ pattern: RegExp; display: string }> = [
  { pattern: /\bkwala lumpur\b|\bkuala lumpur\b/i, display: "Kuala Lumpur" }, { pattern: /\bselangor\b/i, display: "Selangor" },
  { pattern: /\bperak\b|\bipoh\b|\btaiping\b/i, display: "Perak" }, { pattern: /\bpenang\b|\bpulau pinang\b/i, display: "Penang" },
  { pattern: /\bjohore?\b/i, display: "Johor" }, { pattern: /\bkedah\b/i, display: "Kedah" }, { pattern: /\bkelantan\b/i, display: "Kelantan" },
  { pattern: /\btrengganu\b|\bterengganu\b/i, display: "Terengganu" }, { pattern: /\bpahang\b/i, display: "Pahang" },
  { pattern: /\bnegri sembilan\b|\bnegeri sembilan\b/i, display: "Negeri Sembilan" }, { pattern: /\bmalacca\b|\bmelaka\b/i, display: "Melaka" },
  { pattern: /\bnorth borneo\b|\bsabah\b/i, display: "Sabah" }, { pattern: /\bsarawak\b/i, display: "Sarawak" },
  { pattern: /\bmalaya(?:n)?\b|\bbritish malaya\b|\bfederated malay states\b|\bunfederated malay states\b/i, display: "Malaysia / Malaya" },
];
const INCIDENTS: Array<{ pattern: RegExp; type: ArchiveStoryType; status: ArchiveClaimStatus }> = [
  { pattern: /\bmissing|disappear(?:ed|ance)?|vanish(?:ed)?|lost (?:man|woman|child|boy|girl|person)|search for\b/i, type: "DISAPPEARANCE", status: "UNRESOLVED" },
  { pattern: /\bmysterious death|found dead|body found|dead body|unexplained death\b/i, type: "MYSTERIOUS_DEATH", status: "REPORTED" },
  { pattern: /\bmurder|shot dead|shooting|slain|homicide|assault|robbery|kidnap\b/i, type: "CRIME_MYSTERY", status: "REPORTED" },
  { pattern: /\bghost|haunt(?:ed|ing)?|apparition|white figure|spirit\b/i, type: "PARANORMAL_REPORT", status: "REPORTED" },
  { pattern: /\bfolklore|legend|curse|myth\b/i, type: "FOLKLORE", status: "FOLKLORE" },
  { pattern: /\bstrange lights?|unexplained|mysterious|mystery|strange animal|mass hysteria\b/i, type: "UNEXPLAINED_EVENT", status: "UNRESOLVED" },
  { pattern: /\bdisaster|collapse|flood|fire|explosion|crash|accident|tragedy|wreck\b/i, type: "DISASTER", status: "REPORTED" },
  { pattern: /\bpanic|rumou?r|strange|unusual|curious|abandoned\b/i, type: "STRANGE_EVENT", status: "REPORTED" },
  { pattern: /\bincident|inquiry|investigation|police|arrest|trial|rescue|raid\b/i, type: "HISTORICAL_INCIDENT", status: "REPORTED" },
];
const VERBS = /\b(disappeared|vanished|missing|found|died|killed|murdered|shot|reported|claimed|saw|heard|searched|arrested|escaped|collapsed|crashed|burned|exploded|rescued|investigated|discovered)\b/gi;
const STOP_NAMES = new Set(["The Straits", "Kuala Lumpur", "North Borneo", "British Malaya", "Malaya Tribune", "Straits Times"]);
const TOKEN_STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "after", "before", "malaya", "malayan", "singapore", "page", "article"]);

export function normalizeHistoricalLocations(input: string) {
  return LOCATION_ALIASES.flatMap(({ pattern, display }) => {
    const match = input.match(pattern); return match ? [{ original: match[0], display }] : [];
  });
}

export function historicalContext(input: string, locations: string[]): HistoricalContext {
  if (/straits settlements/i.test(input)) return "STRAITS_SETTLEMENTS";
  if (/north borneo/i.test(input) || locations.includes("Sabah")) return "NORTH_BORNEO";
  if (/sarawak/i.test(input) || locations.includes("Sarawak")) return "SARAWAK";
  if (/\bmalaya(?:n)?\b|federated malay states|unfederated malay states/i.test(input)) return "MALAYA";
  return "MODERN_MALAYSIA";
}

function people(input: string) {
  const matches = input.match(/\b(?:Mr|Mrs|Miss|Dr|Dato|Datuk|Tunku|Tun|Inche|Inspector|Sergeant)?\.?\s*[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3}\b/g) ?? [];
  return [...new Set(matches.map((value) => value.trim()).filter((value) => !STOP_NAMES.has(value)))].slice(0, 8);
}

export function headlineTokens(input: string) {
  return [...new Set(input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !TOKEN_STOP.has(token)))];
}

export function extractArchiveEvent(document: ArchiveDocument): ExtractedArchiveEvent | null {
  if (/advertisement|classified|untitled|masthead|contents|letters to the editor/i.test(`${document.title} ${document.metadata.format ?? ""}`)) return null;
  if (headlineTokens(document.title).length < 2) return null;
  const evidence = `${document.title}. ${document.snippet} ${document.originalLocationTerms.join(" ")}`.replace(/\s+/g, " ");
  if (/\b(?:rifle|target|club|competition|inter-state|ladies)[\s\S]{0,30}shooting|shooting[\s\S]{0,30}(?:rifle|target|club|competition|match)\b/i.test(evidence)
    && !/\bshot dead|shot and killed|murder|attack|wound|victim|gunman\b/i.test(evidence)) return null;
  const matchedLocations = normalizeHistoricalLocations(evidence); if (!matchedLocations.length) return null;
  const incident = INCIDENTS.find(({ pattern }) => pattern.test(evidence)); if (!incident) return null;
  const sportContext = /\bfootball|lionsxii|tournament|championship|cup final|coach|team match|shooters?|annual shoot|shooting mark|full results|wins? by|record entries\b/i.test(evidence);
  if (sportContext && ["CRIME_MYSTERY", "STRANGE_EVENT", "UNEXPLAINED_EVENT"].includes(incident.type)
    && !/\bshot dead|shot and killed|murder|attack|wound|victim|gunman\b/i.test(evidence)) return null;
  const locations = [...new Set(matchedLocations.map(({ display }) => display))];
  const originalLocations = [...new Set(matchedLocations.map(({ original }) => original))];
  const eventVerbs = [...new Set([...evidence.matchAll(VERBS)].map((match) => match[0].toLowerCase()))];
  const extractedPeople = [...new Set([...document.people, ...people(evidence)])];
  const reportingVerb = incident.status === "FOLKLORE" ? "direkodkan sebagai cerita rakyat" : "dilaporkan";
  return { document: { ...document, originalLocationTerms: originalLocations, people: extractedPeople }, locations, originalLocations, people: extractedPeople,
    eventVerbs, incidentType: incident.type, claimStatus: incident.status, historicalContext: historicalContext(evidence, locations),
    eventDate: document.publishedAt, headlineTokens: headlineTokens(document.title), claim: `${document.publisher} ${reportingVerb}: ${document.title}.` };
}
