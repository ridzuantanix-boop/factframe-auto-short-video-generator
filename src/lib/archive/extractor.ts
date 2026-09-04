import type { ArchiveClaimStatus, ArchiveDocument, ArchiveStoryType, ExtractedArchiveEvent, HistoricalContext, StoryTypeConfidence } from "./types.ts";

const LOCATION_ALIASES: Array<{ pattern: RegExp; display: string }> = [
  { pattern: /\bkwala lumpur\b|\bkuala lumpur\b/i, display: "Kuala Lumpur" }, { pattern: /\bselangor\b/i, display: "Selangor" },
  { pattern: /\bperak\b|\bipoh\b|\btaiping\b/i, display: "Perak" }, { pattern: /\bpenang\b|\bpulau pinang\b/i, display: "Penang" },
  { pattern: /\bjohore?\b/i, display: "Johor" }, { pattern: /\bkedah\b/i, display: "Kedah" }, { pattern: /\bkelantan\b/i, display: "Kelantan" },
  { pattern: /\btrengganu\b|\bterengganu\b/i, display: "Terengganu" }, { pattern: /\bpahang\b/i, display: "Pahang" },
  { pattern: /\bnegri sembilan\b|\bnegeri sembilan\b/i, display: "Negeri Sembilan" }, { pattern: /\bmalacca\b|\bmelaka\b/i, display: "Melaka" },
  { pattern: /\bnorth borneo\b|\bsabah\b/i, display: "Sabah" }, { pattern: /\bsarawak\b/i, display: "Sarawak" },
  { pattern: /\bmalaya(?:n)?\b|\bbritish malaya\b|\bfederated malay states\b|\bunfederated malay states\b/i, display: "Malaysia / Malaya" },
];
const VERBS = /\b(disappeared|vanished|missing|found|died|killed|murdered|shot|reported|claimed|saw|heard|searched|arrested|escaped|collapsed|crashed|burned|exploded|rescued|investigated|discovered)\b/gi;
const STOP_NAMES = new Set(["The Straits", "Kuala Lumpur", "North Borneo", "British Malaya", "Malaya Tribune", "Straits Times"]);
const TOKEN_STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "after", "before", "malaya", "malayan", "singapore", "page", "article"]);

export function normalizeHistoricalLocations(input: string) {
  return LOCATION_ALIASES.flatMap(({ pattern, display }) => {
    const match = input.match(pattern); return match ? [{ original: match[0], display }] : [];
  });
}

export function classifyHistoricalContext(input: string, locations: string[], publishedAt: string | null) {
  if (/\bstraits settlements\b/i.test(input)) return { historicalContext: "STRAITS_SETTLEMENTS" as HistoricalContext, evidence: ["TEXT:STRAITS_SETTLEMENTS"] };
  if (/\bmalayan union\b/i.test(input)) return { historicalContext: "MALAYAN_UNION" as HistoricalContext, evidence: ["TEXT:MALAYAN_UNION"] };
  if (/\bfederation of malaya\b/i.test(input)) return { historicalContext: "FEDERATION_OF_MALAYA" as HistoricalContext, evidence: ["TEXT:FEDERATION_OF_MALAYA"] };
  if (/\bnorth borneo\b/i.test(input)) return { historicalContext: "NORTH_BORNEO" as HistoricalContext, evidence: ["TEXT:NORTH_BORNEO"] };
  if (/\brajah? of sarawak\b|\bkingdom of sarawak\b/i.test(input)) return { historicalContext: "SARAWAK" as HistoricalContext, evidence: ["TEXT:HISTORICAL_SARAWAK"] };
  if (/\bbritish malaya|\bmalaya(?:n)?\b|federated malay states|unfederated malay states/i.test(input)) return { historicalContext: "MALAYA" as HistoricalContext, evidence: ["TEXT:MALAYA"] };
  const timestamp = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (Number.isFinite(timestamp)) {
    const date = new Date(timestamp); const iso = date.toISOString().slice(0, 10);
    if (iso >= "1963-09-16") return { historicalContext: "MODERN_MALAYSIA" as HistoricalContext, evidence: [`DATE:${iso}`, "ERA:POST_1963_09_16"] };
    if (locations.includes("Sabah")) return { historicalContext: "NORTH_BORNEO" as HistoricalContext, evidence: [`DATE:${iso}`, "LOCATION:SABAH"] };
    if (locations.includes("Sarawak")) return { historicalContext: "SARAWAK" as HistoricalContext, evidence: [`DATE:${iso}`, "LOCATION:SARAWAK"] };
    if (iso >= "1948-02-01") return { historicalContext: "FEDERATION_OF_MALAYA" as HistoricalContext, evidence: [`DATE:${iso}`, "ERA:1948_TO_1963"] };
    if (iso >= "1946-04-01") return { historicalContext: "MALAYAN_UNION" as HistoricalContext, evidence: [`DATE:${iso}`, "ERA:1946_TO_1948"] };
    return { historicalContext: "PRE_MALAYSIA" as HistoricalContext, evidence: [`DATE:${iso}`, "ERA:PRE_1946"] };
  }
  return { historicalContext: "PRE_MALAYSIA" as HistoricalContext, evidence: ["SAFE_ARCHIVE_FALLBACK:NO_DATE"] };
}

export function historicalContext(input: string, locations: string[], publishedAt: string | null = null): HistoricalContext {
  return classifyHistoricalContext(input, locations, publishedAt).historicalContext;
}

type ScoredType = { storyType: ArchiveStoryType; claimStatus: ArchiveClaimStatus; storyTypeConfidence: StoryTypeConfidence; storyTypeEvidence: string[]; score: number };
const TYPE_ORDER: ArchiveStoryType[] = ["MYSTERIOUS_DEATH", "DISAPPEARANCE", "CRIME_MYSTERY", "PARANORMAL_REPORT", "DISASTER", "UNEXPLAINED_EVENT", "FOLKLORE", "STRANGE_EVENT", "HISTORICAL_INCIDENT", "HISTORICAL_CURIOSITY"];

export function classifyArchiveStoryType(title: string, snippet: string): ScoredType {
  const combined = `${title} ${snippet}`;
  const weightedTitle = title.length <= 240 ? title : title.slice(0, Math.max(0, title.indexOf(".")) || 160);
  const scores = new Map<ArchiveStoryType, number>(); const evidence = new Map<ArchiveStoryType, string[]>();
  const add = (type: ArchiveStoryType, points: number, label: string) => { scores.set(type, (scores.get(type) ?? 0) + points); evidence.set(type, [...(evidence.get(type) ?? []), label]); };
  const signal = (type: ArchiveStoryType, headline: RegExp, body: RegExp, label: string) => {
    if (headline.test(weightedTitle)) add(type, 5, `HEADLINE:${label}`); else if (body.test(snippet)) add(type, 2, `SNIPPET:${label}`);
  };
  const personContext = /\b(?:person|people|man|woman|child|boy|girl|father|mother|wife|husband|baby|student|volunteer|fisherm(?:a|e)n|crew|pair|hawker|refugee|pupil|youth|young|teenager|family|bodies?|inspector|officer|soldier|worker|tourist|passenger|clerk|driver|chettiar|gentleman)\b/i.test(combined);
  const missingSignal = /\bmissing|disappeared|vanished|lost at sea|hunt for lost\b/i;
  if (missingSignal.test(weightedTitle) && personContext) add("DISAPPEARANCE", 5, "HEADLINE:MISSING_PERSON");
  else if (missingSignal.test(snippet) && personContext) add("DISAPPEARANCE", 2, "SNIPPET:MISSING_PERSON");
  if (personContext && (scores.get("DISAPPEARANCE") ?? 0)) add("DISAPPEARANCE", 2, "CONTEXT:PERSON_OR_SEARCH");
  const missingObject = "(?:money|cash|jewel(?:lery|ry)|spectacles?|names?|certificates?|scrips?|documents?|property|wallet|purse)";
  const objectMissingHeadline = new RegExp(`\\b${missingObject}\\b`, "i").test(weightedTitle);
  const objectLossPhrase = new RegExp(`(?:\\b${missingObject}\\b[^.!?]{0,50}\\b(?:missing|disappeared|lost)\\b|\\b(?:missing|lost)\\b[^.!?]{0,30}\\b${missingObject}\\b)`, "i").test(combined);
  const personMissingHeadline = missingSignal.test(weightedTitle) && /\b(?:man|woman|child|boy|girl|father|mother|wife|husband|baby|student|volunteer|fisherm(?:a|e)n|crew|pair|hawker|refugee|pupil|youth|teenager|inspector|officer|worker|tourist|passenger|clerk|driver|chettiar)\b/i.test(weightedTitle);
  if ((objectMissingHeadline || objectLossPhrase) && !personMissingHeadline) scores.delete("DISAPPEARANCE");
  signal("MYSTERIOUS_DEATH", /\bbod(?:y|ies) (?:is |are |was |were )?found|finds? body|found (?:dead|drowned)|mysterious death|unexplained death|shot dead|sudden death\b/i, /\bbod(?:y|ies) (?:is |are |was |were )?found|finds? (?:a |the )?body|found (?:dead|drowned)|mysterious death|unexplained death|shot dead\b/i, "DEATH_DISCOVERY");
  if (/\binquest|body|victim|cause of death|post.?mortem|river\b/i.test(combined) && (scores.get("MYSTERIOUS_DEATH") ?? 0)) add("MYSTERIOUS_DEATH", 2, "CONTEXT:DEATH_INQUIRY");
  signal("CRIME_MYSTERY", /\b(?:murder(?:ed|er|ers)?|kill(?:ed|er|ers|ing)?|kidnap|homicide|slain|beheaded|shot|shoot-out|shooting|robbery|assault|attack(?:ed)?|ambush(?:ed)?)\b/i, /\b(?:murder(?:ed|er|ers)?|kill(?:ed|er|ers|ing)?|kidnap|homicide|slain|beheaded|shot|shoot-out|shooting|robbery|assault|attack(?:ed)?|ambush(?:ed)?)\b/i, "VIOLENT_CRIME");
  if (/\bvictim|police|court|trial|charged|arrested|detained|detective|weapon|gunman|suspect\b/i.test(combined) && (scores.get("CRIME_MYSTERY") ?? 0)) add("CRIME_MYSTERY", 2, "CONTEXT:POLICE_OR_COURT");
  signal("PARANORMAL_REPORT", /\bghost|apparition|haunt(?:ed|ing)?|spirit|white figure\b/i, /\bghost|apparition|haunt(?:ed|ing)?|spirit|white figure\b/i, "PARANORMAL_CLAIM");
  if (/\breported|claimed|witness|resident|saw|seen|appeared|sighting|guard\b/i.test(`${title} ${snippet}`) && (scores.get("PARANORMAL_REPORT") ?? 0)) add("PARANORMAL_REPORT", 2, "CONTEXT:REPORTED_SIGHTING");
  signal("FOLKLORE", /\bfolklore|legend|myth|curse|folk tale\b/i, /\bfolklore|legend|myth|curse|folk tale\b/i, "FOLKLORE_SUBJECT");
  if (/\bstory|tale|tradition|belief|origin|founding\b/i.test(`${title} ${snippet}`) && (scores.get("FOLKLORE") ?? 0)) add("FOLKLORE", 1, "CONTEXT:TRADITION_OR_ORIGIN");
  if (!/\bfolklore|legend|myth|curse|folk tale\b/i.test(title)) scores.delete("FOLKLORE");
  signal("DISASTER", /\bcollapse|flood|fire|explosion|crash|accident|wreck\b/i, /\bcollapse|flood|fire|explosion|crash|accident|wreck\b/i, "PHYSICAL_INCIDENT");
  if (/\btragedy\b/i.test(weightedTitle)) add("DISASTER", 3, "HEADLINE:TRAGEDY"); else if (/\btragedy\b/i.test(snippet)) add("DISASTER", 1, "SNIPPET:TRAGEDY");
  if (/\bkilled|died|dead|injured|damage|rescue|fatal|emergency|brigade\b/i.test(combined) && (scores.get("DISASTER") ?? 0)) add("DISASTER", 2, "CONTEXT:HARM_OR_RESPONSE");
  signal("UNEXPLAINED_EVENT", /\bunexplained|mysterious|mystery|strange lights?|mass hysteria\b/i, /\bunexplained|mysterious|mystery|strange lights?|mass hysteria\b/i, "UNEXPLAINED_PHENOMENON");
  if (/\binvestigat|witness|reported|cause|unknown|sighting\b/i.test(`${title} ${snippet}`) && (scores.get("UNEXPLAINED_EVENT") ?? 0)) add("UNEXPLAINED_EVENT", 1, "CONTEXT:UNRESOLVED_REPORT");
  signal("STRANGE_EVENT", /\bstrange|unusual|curious|panic|rumou?r|abandoned\b/i, /\bstrange|unusual|curious|panic|rumou?r|abandoned\b/i, "STRANGE_INCIDENT");
  signal("HISTORICAL_INCIDENT", /\bincident|inquiry|investigation|police|arrest|trial|rescue|raid|commission(?:ers?)?\b/i, /\bincident|inquiry|investigation|police|arrest|trial|rescue|raid|commission(?:ers?)?\b/i, "HISTORICAL_EVENT");
  signal("HISTORICAL_CURIOSITY", /\bmuseum|crest|custom|tribe|curiosity|historic(?:al)?|oldest|origin\b/i, /\bmuseum|crest|custom|tribe|curiosity|historic(?:al)?|oldest|origin\b/i, "HISTORICAL_SUBJECT");
  const sportContext = /\bfootball|soccer|league|tournament|championship|cup (?:final|soccer|trials)|coach|teams?|match(?:es)?|rifle shooting|shooting competition|shooters?|annual shoot|shooting mark|full results|wins? by|record entries\b/i.test(combined);
  const fictionalContext = /\bstage|theatre|theater|play|film|drama|actor|actress|heroine|role\b/i.test(combined);
  if ((sportContext || fictionalContext) && !/\bshot dead|shot and killed|actual murder|attack(?:ed)?|wound(?:ed)?|victim|gunman\b/i.test(combined)) {
    scores.delete("CRIME_MYSTERY"); scores.delete("STRANGE_EVENT"); scores.delete("UNEXPLAINED_EVENT"); scores.delete("HISTORICAL_INCIDENT");
  }
  const ranked = TYPE_ORDER.map((storyType) => ({ storyType, score: scores.get(storyType) ?? 0 })).sort((a, b) => b.score - a.score || TYPE_ORDER.indexOf(a.storyType) - TYPE_ORDER.indexOf(b.storyType));
  const top = ranked[0].score >= 3 ? ranked[0] : { storyType: "HISTORICAL_INCIDENT" as ArchiveStoryType, score: Math.max(1, ranked[0].score) };
  const confidence: StoryTypeConfidence = top.score >= 7 && top.score - (ranked[1]?.score ?? 0) >= 2 ? "HIGH" : top.score >= 4 ? "MEDIUM" : "LOW";
  const status: Partial<Record<ArchiveStoryType, ArchiveClaimStatus>> = { DISAPPEARANCE: "UNRESOLVED", MYSTERIOUS_DEATH: "REPORTED", CRIME_MYSTERY: "REPORTED",
    PARANORMAL_REPORT: "REPORTED", FOLKLORE: "FOLKLORE", DISASTER: "REPORTED", UNEXPLAINED_EVENT: "UNRESOLVED", STRANGE_EVENT: "REPORTED", HISTORICAL_INCIDENT: "REPORTED", HISTORICAL_CURIOSITY: "REPORTED" };
  return { storyType: top.storyType, claimStatus: status[top.storyType] ?? "REPORTED", storyTypeConfidence: confidence,
    storyTypeEvidence: evidence.get(top.storyType) ?? ["FALLBACK:HISTORICAL_INCIDENT"], score: top.score };
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
  const incident = classifyArchiveStoryType(document.title, document.snippet);
  if (incident.storyType === "HISTORICAL_INCIDENT" && incident.score <= 1 && ![...evidence.matchAll(VERBS)].length) return null;
  const locations = [...new Set(matchedLocations.map(({ display }) => display))];
  const originalLocations = [...new Set(matchedLocations.map(({ original }) => original))];
  const eventVerbs = [...new Set([...evidence.matchAll(VERBS)].map((match) => match[0].toLowerCase()))];
  const extractedPeople = [...new Set([...document.people, ...people(evidence)])];
  const reportingVerb = incident.claimStatus === "FOLKLORE" ? "direkodkan sebagai cerita rakyat" : "dilaporkan";
  const context = classifyHistoricalContext(evidence, locations, document.publishedAt);
  return { document: { ...document, originalLocationTerms: originalLocations, people: extractedPeople }, locations, originalLocations, people: extractedPeople,
    eventVerbs, incidentType: incident.storyType, storyTypeConfidence: incident.storyTypeConfidence, storyTypeEvidence: incident.storyTypeEvidence,
    claimStatus: incident.claimStatus, historicalContext: context.historicalContext, historicalContextEvidence: context.evidence,
    eventDate: document.publishedAt, headlineTokens: headlineTokens(document.title), claim: `${document.publisher} ${reportingVerb}: ${document.title}.` };
}
