import type { ClaimType } from "../types.ts";
import type { ClaimValidationResult, ResearchClaim } from "./types.ts";
import { assessNarrationQuality } from "./narrationRewriter.ts";
import { classifyClaimEntities, normalizeEntity } from "./entityClassifier.ts";

export const CLAIM_VALIDATION_VERSION = "5.1-entity-aware";
export type AiClaimRewrite = { claimId: string; spokenText: string; preservedClaimType: ClaimType; preservedSourceIds: string[] };

const NUMBER_WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", triple: "3",
  satu: "1", dua: "2", tiga: "3", empat: "4", lima: "5", enam: "6", tujuh: "7", lapan: "8", sembilan: "9", sepuluh: "10",
  sebelas: "11", duabelas: "12", tigabelas: "13", empatbelas: "14", limabelas: "15", enambelas: "16", tujuhbelas: "17", lapanbelas: "18", sembilanbelas: "19", duapuluh: "20" };
const LOCATIONS = ["Johor", "Melaka", "Malacca", "Perak", "Pahang", "Selangor", "Sarawak", "Sabah", "Kuala Lumpur", "Penang", "Pulau Pinang", "Terengganu", "Kelantan", "Kedah", "Negeri Sembilan", "Singapore", "Singapura"];
const SEMANTICS: Array<[RegExp, RegExp, string]> = [
  [/\b(?:missing|disappear|vanish)/i, /\b(?:hilang|kehilangan|belum ditemukan)\b/i, "missing/disappearance meaning changed"],
  [/\b(?:search|hunt)\b/i, /\b(?:cari|mencari|pencarian|operasi|usaha)\b/i, "search action omitted"],
  [/\b(?:found|discovered|recovered)\b/i, /\b(?:ditemui|menemui|ditemukan|menemukan|dijumpai|menjumpai)\b/i, "discovery action omitted"],
  [/\b(?:body|dead|death|died|killed|murder)\b/i, /\b(?:mayat|maut|mati|kematian|bunuh|dibunuh|membunuh|terbunuh|pembunuhan)\b/i, "death meaning changed"],
  [/\b(?:arrested|detained|remanded)\b/i, /\b(?:ditahan|menahan|ditangkap|menangkap|direman|reman)\b/i, "legal action omitted"],
  [/\b(?:accident|crash|capsized|sank|sinks?)\b/i, /\b(?:kemalangan|nahas|terhempas|terbalik|karam)\b/i, "incident meaning changed"],
];

function normalize(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function numbers(value: string) {
  const units: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8, sembilan: 9 };
  const joined = normalize(value).replace(/\bdua\s+puluh\s+(satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan)\b/g, (_match, unit: string) => String(20 + units[unit]))
    .replace(/\b(dua|tiga|empat|lima|enam|tujuh|lapan|sembilan)\s+(belas)\b/g, "$1$2").replace(/\bdua\s+puluh\b/g, "20");
  const result = new Set<string>(); for (const token of joined.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (/^\d+$/.test(token)) result.add(String(Number(token))); else if (NUMBER_WORDS[token]) result.add(NUMBER_WORDS[token]);
  }
  return result;
}
function locations(value: string) { return LOCATIONS.filter((location) => normalize(value).includes(normalize(location))).map((location) => normalize(location).replace("malacca", "melaka").replace("singapore", "singapura")); }
function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((item) => right.includes(item)); }

function essentialNumbers(value: string) {
  const words = normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []; const result = new Set<string>();
  for (const [index, word] of words.entries()) { const number = /^\d+$/.test(word) ? String(Number(word)) : NUMBER_WORDS[word]; if (!number) continue;
    const context = words.slice(Math.max(0, index - 4), index + 5).join(" ");
    if (/\b(?:aged?|year old|years old|tahun|missing|hilang|killed|dead|death|maut|mati|victims?|mangsa|toll|casualt|sentence|hukuman|imprison|penjara|trial|trials|perbicaraan)\b/.test(context)) result.add(number);
  } return result;
}

function containsEntity(text: string, entity: string) {
  const spoken = normalizeEntity(text); const target = normalizeEntity(entity); if (spoken.includes(target)) return true;
  const parts = target.split(" ").filter((part) => part.length > 2); return parts.length >= 2 && parts.every((part) => spoken.includes(part));
}

function makeResult(hardFails: string[], softWarnings: string[], entities: ReturnType<typeof classifyClaimEntities>): ClaimValidationResult {
  return { valid: hardFails.length === 0, reasons: [...new Set(hardFails)], hardFails: [...new Set(hardFails)], softWarnings: [...new Set(softWarnings)],
    entityTypes: Object.fromEntries(entities.map((entity) => [entity.text, entity.type])), checkedAt: new Date().toISOString(), version: CLAIM_VALIDATION_VERSION };
}

export function validateClaimRewrite(claim: ResearchClaim, output: AiClaimRewrite): ClaimValidationResult {
  const hard: string[] = []; const soft: string[] = []; const spoken = output.spokenText.trim(); const rawNumbers = [...numbers(claim.claimText)]; const spokenNumbers = [...numbers(spoken)];
  const entities = classifyClaimEntities(claim.claimText, claim.people ?? [], claim.locations ?? []);
  if (output.claimId !== claim.id) hard.push("claim ID changed");
  if (output.preservedClaimType !== claim.claimType) hard.push("claim type changed");
  if (!sameSet([...(claim.sourceIds ?? [])].sort(), [...output.preservedSourceIds].sort())) hard.push("source IDs changed");
  if (!spoken) hard.push("spoken text is empty");
  const addedNumbers = spokenNumbers.filter((number) => !rawNumbers.includes(number));
  if (addedNumbers.some((number) => number !== "1")) hard.push("number was invented or changed");
  else if (addedNumbers.includes("1")) soft.push("format-derived singular added");
  const requiredNumbers = essentialNumbers(claim.claimText); if ([...requiredNumbers].some((number) => !spokenNumbers.includes(number))) hard.push("essential age, toll, missing count, sentence, or case count was omitted");
  if (rawNumbers.some((number) => !spokenNumbers.includes(number)) && ![...requiredNumbers].some((number) => !spokenNumbers.includes(number))) soft.push("optional number omitted");
  const rawYears: string[] = claim.claimText.match(/\b(?:18|19|20)\d{2}\b/g) ?? []; const spokenYears: string[] = spoken.match(/\b(?:18|19|20)\d{2}\b/g) ?? [];
  if (spokenYears.some((year) => !rawYears.includes(year))) hard.push("unsupported date added");
  if (rawYears.some((year) => !spokenYears.includes(year))) soft.push("publication or nonessential date omitted");
  const allowedLocations = new Set([...locations(claim.claimText), ...(claim.locations ?? []).flatMap(locations)]); const outputLocations = locations(spoken);
  if (outputLocations.some((location) => !allowedLocations.has(location))) hard.push("location changed to an unsupported place");
  for (const entity of entities) {
    if (entity.type === "PERSON" && claim.claimText.toLowerCase().includes(entity.text.toLowerCase()) && !containsEntity(spoken, entity.text)) hard.push(`named person omitted: ${entity.text}`);
    if (entity.type === "ORGANISATION" && !containsEntity(spoken, entity.text)) soft.push(`organisation shortened or omitted: ${entity.text}`);
    if (entity.type === "PLACE" && !containsEntity(spoken, entity.text)) soft.push(`minor place generalized or omitted: ${entity.text}`);
  }
  const rawNegated = /\b(?:no|not|never|without|failed to)\b/i.test(claim.claimText); const spokenNegated = /\b(?:tidak|tiada|bukan|tanpa|gagal|belum)\b/i.test(spoken);
  if (rawNegated && !spokenNegated) hard.push("negation removed");
  for (const [rawPattern, spokenPattern, reason] of SEMANTICS) {
    if (reason === "discovery action omitted" && /\bfound that\b/i.test(claim.claimText)) { if (!/\b(?:mendapati|mendapat kesimpulan)\b/i.test(spoken)) hard.push(reason); continue; }
    if (rawPattern.test(claim.claimText) && !spokenPattern.test(spoken)) hard.push(reason);
  }
  const rawLegal = /\b(?:trial|assizes?|charge|remand|conviction|convicted|sentence|culpable homicide|manslaughter)\b/i.test(claim.claimText);
  const spokenLegal = /\b(?:perbicaraan|mahkamah|pertuduhan|tuduhan|reman|direman|sabitan|hukuman|membunuh tanpa niat)\b/i.test(spoken);
  if (rawLegal && !spokenLegal) hard.push("legal proceeding or legal distinction changed");
  if (/\b(?:trial|trials|assizes?)\b/i.test(claim.claimText) && /\b(?:dibunuh|membunuh)\b/i.test(spoken) && !/\b(?:perbicaraan|kes|mahkamah|pertuduhan|tuduhan)\b/i.test(spoken)) hard.push("murder trial was changed into a murder event");
  if (claim.claimType === "REPORTED" && !/\b(?:dilaporkan|melaporkan|menurut laporan|laporan (?:itu |ketika itu )?(?:menyatakan|menyebut|merekodkan)|mendakwa)\b/i.test(spoken)) hard.push("reported status became an assertion");
  if (claim.claimType === "FOLKLORE" && !/\b(?:menurut legenda|cerita rakyat|cerita yang tersebar|legenda tempatan)\b/i.test(spoken)) hard.push("folklore status became an assertion");
  if (claim.claimType === "UNRESOLVED" && !/\b(?:masih|belum|tiada|tidak diketahui|tidak dapat dipastikan|hilang|kehilangan)\b/i.test(spoken)) hard.push("unresolved status was removed");
  const qualityClaim = { ...claim, spokenText: spoken }; if (!assessNarrationQuality([qualityClaim]).passes) hard.push("Malay language or spoken-naturalness gate failed");
  return makeResult(hard, soft, entities);
}

export function validateRewriteSet(claims: ResearchClaim[], outputs: AiClaimRewrite[]) {
  type Entry = { claim: ResearchClaim; output: AiClaimRewrite; result: ClaimValidationResult };
  type RejectedEntry = { claim?: ResearchClaim; output: AiClaimRewrite | null; result: ClaimValidationResult };
  const known = new Map(claims.map((claim) => [claim.id, claim])); const seen = new Set<string>(); const accepted: Entry[] = []; const rejected: RejectedEntry[] = [];
  for (const output of outputs) {
    const claim = known.get(output.claimId); if (!claim) { rejected.push({ output, result: { valid: false, reasons: ["unknown claim ID"], checkedAt: new Date().toISOString(), version: CLAIM_VALIDATION_VERSION } }); continue; }
    if (seen.has(output.claimId)) { rejected.push({ output, result: { valid: false, reasons: ["duplicate claim ID"], checkedAt: new Date().toISOString(), version: CLAIM_VALIDATION_VERSION } }); continue; }
    seen.add(output.claimId); const result = validateClaimRewrite(claim, output); if (result.valid) accepted.push({ claim, output, result }); else rejected.push({ claim, output, result });
  }
  for (const claim of claims) if (!seen.has(claim.id)) rejected.push({ claim, output: null, result: { valid: false, reasons: ["claim ID missing"], checkedAt: new Date().toISOString(), version: CLAIM_VALIDATION_VERSION } });
  return { accepted, rejected };
}
