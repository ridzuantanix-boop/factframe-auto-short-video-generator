export type ClaimEntityType = "PERSON" | "ORGANISATION" | "PLACE" | "DATE" | "NUMBER" | "LEGAL_TERM" | "VESSEL" | "OTHER";
export type TypedClaimEntity = { text: string; normalized: string; type: ClaimEntityType; essential: boolean };

const LEGAL = /\b(?:murder|culpable homicide|manslaughter|assizes?|remand(?:ed)?|conviction|convicted|charge|sentence|trial|inquest|appeal|magistrate|mahkamah|pertuduhan|bunuh tanpa niat|perbicaraan|sabitan|hukuman)\b/i;
const ORGANISATION = /\b(?:department|ministry|authority|office|organisation|organization|association|society|board|commission|commissioner|committee|branch|force|police|school|university|college|hospital|council|court|jabatan|kementerian|lembaga|suruhanjaya|persatuan|pasukan|polis|sekolah|mahkamah)\b/i;
const PLACE = /\b(?:kampong|kampung|village|river|road|street|district|island|mount|gunung|tanjung|pulau|sungai|jalan)\b/i;
const VESSEL = /^(?:HMS|HMT|MV|M\.V\.|SS|S\.S\.|RMS)\b|\b(?:vessel|ship|boat|steamer|kapal)\b/i;
const PERSON_ROLE = /^(?:Mr|Mrs|Ms|Miss|Dr|Dato'?|Datuk|Tan Sri|Tun|Inspector|Insp|Detective|Sergeant|Sgt|Constable|Prince|Tuan|Encik|Cik|Doktor)\.?\s+/i;
const NON_PERSON = /\b(?:accident|missing|disappearance|search|murder|homicide|charge|trial|report|correspondent|representative|offers?|employers?|girl|boy|man|woman|driver|victims?|sequel|legend|bandits?|shot|station|burnt|bound|body|sack|found|dead|border|battle|since|may)\b/i;
const KNOWN_PLACES = ["Malaysia", "Malaya", "Singapore", "Singapura", "Johor", "Johore", "Melaka", "Malacca", "Perak", "Pahang", "Selangor", "Sarawak", "Sabah", "Kuala Lumpur", "Penang", "Pulau Pinang", "Terengganu", "Kelantan", "Kedah", "Negeri Sembilan", "Seremban", "Gombak", "Pudu", "Subang", "Muar", "Ipoh", "Kuching"];

export function normalizeEntity(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
}

function personCore(value: string) {
  return value.replace(PERSON_ROLE, "").replace(/^(?:Chinese|Malay|Tamil|European|Indian)\s+/i, "").trim();
}

export function classifyEntityPhrase(value: string, rawContext = ""): TypedClaimEntity {
  const text = value.trim(); const normalized = normalizeEntity(text);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/\b(?:18|19|20)\d{2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4})\b/.test(text)) return { text, normalized, type: "DATE", essential: false };
  if (/^\d+(?:\.\d+)?$/.test(text)) return { text, normalized, type: "NUMBER", essential: false };
  if (LEGAL.test(text)) return { text, normalized, type: "LEGAL_TERM", essential: true };
  if (ORGANISATION.test(text)) return { text, normalized, type: "ORGANISATION", essential: false };
  if (PLACE.test(text) || KNOWN_PLACES.some((place) => normalizeEntity(text).includes(normalizeEntity(place)))
    || new RegExp(`\\b(?:at|in|from|near|off|di|dari|berhampiran)\\s+${escaped}\\b`, "i").test(rawContext)) return { text, normalized, type: "PLACE", essential: false };
  if (VESSEL.test(text) || new RegExp(`\\b(?:vessel|ship|boat|steamer|kapal)\\s+(?:named|called|bernama)?\\s*${escaped}\\b`, "i").test(rawContext))
    return { text, normalized, type: "VESSEL", essential: true };
  const core = personCore(text); const words = core.split(/\s+/).filter(Boolean);
  const titleCase = words.length >= 2 && words.length <= 5 && words.every((word) => /^[A-Z][\p{L}'’.-]+$/u.test(word));
  if (titleCase && !NON_PERSON.test(core)) return { text: core, normalized: normalizeEntity(core), type: "PERSON", essential: true };
  return { text, normalized, type: "OTHER", essential: false };
}

export function classifyClaimEntities(raw: string, metadataPeople: string[] = [], metadataLocations: string[] = []) {
  const entities = [...metadataPeople.map((value) => classifyEntityPhrase(value, raw)), ...metadataLocations.map((value) => ({ ...classifyEntityPhrase(value, raw), type: "PLACE" as const }))];
  return [...new Map(entities.map((entity) => [`${entity.type}:${entity.normalized}`, entity])).values()];
}

export const LEGAL_TERM_PATTERN = LEGAL;
