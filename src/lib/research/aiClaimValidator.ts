import type { ClaimType } from "../types.ts";
import type { ClaimValidationResult, ResearchClaim } from "./types.ts";
import { assessNarrationQuality } from "./narrationRewriter.ts";

export const CLAIM_VALIDATION_VERSION = "5.0-claim-preservation";
export type AiClaimRewrite = { claimId: string; spokenText: string; preservedClaimType: ClaimType; preservedSourceIds: string[] };

const NUMBER_WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", triple: "3",
  a: "1", an: "1", seorang: "1", sebuah: "1", satu: "1", dua: "2", tiga: "3", empat: "4", lima: "5", enam: "6", tujuh: "7", lapan: "8", sembilan: "9", sepuluh: "10",
  sebelas: "11", duabelas: "12", tigabelas: "13", empatbelas: "14", limabelas: "15", enambelas: "16", tujuhbelas: "17", lapanbelas: "18", sembilanbelas: "19", duapuluh: "20" };
const LOCATIONS = ["Johor", "Melaka", "Malacca", "Perak", "Pahang", "Selangor", "Sarawak", "Sabah", "Kuala Lumpur", "Penang", "Pulau Pinang", "Terengganu", "Kelantan", "Kedah", "Negeri Sembilan", "Singapore", "Singapura"];
const SEMANTICS: Array<[RegExp, RegExp, string]> = [
  [/\b(?:missing|disappear|vanish)/i, /\b(?:hilang|kehilangan|belum ditemukan)\b/i, "missing/disappearance meaning changed"],
  [/\b(?:search|hunt)\b/i, /\b(?:cari|mencari|pencarian|operasi|usaha)\b/i, "search action omitted"],
  [/\b(?:found|discovered|recovered)\b/i, /\b(?:ditemui|menemui|ditemukan|menemukan|dijumpai|menjumpai)\b/i, "discovery action omitted"],
  [/\b(?:body|dead|death|died|killed|murder)\b/i, /\b(?:mayat|maut|mati|kematian|dibunuh|membunuh|pembunuhan)\b/i, "death meaning changed"],
  [/\b(?:arrested|detained|remanded)\b/i, /\b(?:ditahan|menahan|direman|reman)\b/i, "legal action omitted"],
  [/\b(?:accident|crash|capsized|sank|sinks?)\b/i, /\b(?:kemalangan|nahas|terhempas|terbalik|karam)\b/i, "incident meaning changed"],
];

function normalize(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function numbers(value: string) {
  const joined = normalize(value).replace(/\b(dua|tiga|empat|lima|enam|tujuh|lapan|sembilan)\s+(belas)\b/g, "$1$2").replace(/\bdua\s+puluh\b/g, "duapuluh");
  const result = new Set<string>(); for (const token of joined.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (/^\d+$/.test(token)) result.add(String(Number(token))); else if (NUMBER_WORDS[token]) result.add(NUMBER_WORDS[token]);
  } return result;
}
function locations(value: string) { return LOCATIONS.filter((location) => normalize(value).includes(normalize(location))).map((location) => normalize(location).replace("malacca", "melaka").replace("singapore", "singapura")); }
function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((item) => right.includes(item)); }

export function validateClaimRewrite(claim: ResearchClaim, output: AiClaimRewrite): ClaimValidationResult {
  const reasons: string[] = []; const spoken = output.spokenText.trim(); const rawNumbers = [...numbers(claim.claimText)]; const spokenNumbers = [...numbers(spoken)];
  if (output.claimId !== claim.id) reasons.push("claim ID changed");
  if (output.preservedClaimType !== claim.claimType) reasons.push("claim type changed");
  if (!sameSet([...claim.sourceIds].sort(), [...output.preservedSourceIds].sort())) reasons.push("source IDs changed");
  if (!spoken) reasons.push("spoken text is empty");
  if (!sameSet(rawNumbers.sort(), spokenNumbers.sort())) reasons.push("numbers were added, removed, or changed");
  const rawYears: string[] = claim.claimText.match(/\b(?:18|19|20)\d{2}\b/g) ?? []; const spokenYears: string[] = spoken.match(/\b(?:18|19|20)\d{2}\b/g) ?? [];
  if (spokenYears.some((year) => !rawYears.includes(year))) reasons.push("unsupported date added");
  const allowedLocations = new Set([...locations(claim.claimText), ...claim.locations.flatMap(locations)]); const outputLocations = locations(spoken);
  if (outputLocations.some((location) => !allowedLocations.has(location))) reasons.push("unsupported location added");
  for (const person of claim.people.filter((person) => !/from our|correspondent|reporter|remanded|police|court/i.test(person) && claim.claimText.toLowerCase().includes(person.toLowerCase()))) if (!spoken.toLowerCase().includes(person.toLowerCase())) reasons.push(`named person omitted: ${person}`);
  const rawNegated = /\b(?:no|not|never|without|failed to)\b/i.test(claim.claimText); const spokenNegated = /\b(?:tidak|bukan|tanpa|gagal|belum)\b/i.test(spoken);
  if (rawNegated && !spokenNegated) reasons.push("negation removed");
  for (const [rawPattern, spokenPattern, reason] of SEMANTICS) if (rawPattern.test(claim.claimText) && !spokenPattern.test(spoken)) reasons.push(reason);
  if (claim.claimType === "REPORTED" && !/\b(?:dilaporkan|menurut laporan|laporan (?:itu |ketika itu )?(?:menyatakan|menyebut|merekodkan)|mendakwa)\b/i.test(spoken)) reasons.push("reported status became an assertion");
  if (claim.claimType === "FOLKLORE" && !/\b(?:menurut legenda|cerita rakyat|cerita yang tersebar|legenda tempatan)\b/i.test(spoken)) reasons.push("folklore status became an assertion");
  if (claim.claimType === "UNRESOLVED" && !/\b(?:masih|belum|tidak diketahui|tidak dapat dipastikan|hilang)\b/i.test(spoken)) reasons.push("unresolved status was removed");
  const qualityClaim = { ...claim, spokenText: spoken }; if (!assessNarrationQuality([qualityClaim]).passes) reasons.push("Malay language or spoken-naturalness gate failed");
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], checkedAt: new Date().toISOString(), version: CLAIM_VALIDATION_VERSION };
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
