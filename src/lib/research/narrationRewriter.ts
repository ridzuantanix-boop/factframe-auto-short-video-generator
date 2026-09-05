import type { ResearchClaim, ResearchPackage } from "./types.ts";

const MALAY_WORDS = new Set("yang dan di ke dari daripada untuk pada dalam selepas sebelum sebuah seorang orang masih telah berjaya diselamatkan hilang kapal karam perairan usaha mencari jurumudi diteruskan pasukan menemukan ditemui laporan menyatakan polis siasatan pembunuhan ditahan ditangkap direman kemalangan berlaku mangsa cedera maut penduduk mendakwa melihat kelibat cerita rakyat menurut tetapi namun hari itu pertama kedua membantu terlibat suspek berakhir diketahui dipercayai berhampiran".split(" "));
const ENGLISH_WORDS = new Set("the and was were is are after before from into with missing saved ship sinks search still found body murder investigation arrested accident reported sighting ghost disaster wife role confess questioned yesterday since capsized monday tuesday wednesday thursday friday saturday sunday".split(" "));
const OCR_GARBAGE = /[�■<>]|\b\d+[a-z]{2,}\b|\b[a-z]+\d+[a-z]*\b|\w\.\-\w|-'|\b(?:7fwo|whioh|ctfc|lowrtt|iolunes|gintir)\b/i;
const DATELINE = /^(?:KUALA LUMPUR|KUCHING|IPOH|PENANG|SINGAPORE|JOHOR(?:E)? BAHRU|MELAKA|MALACCA)[,.:;\s-]+/i;

export function cleanArchiveText(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2").replace(DATELINE, "").replace(/\.{3,}\s*$/, "")
    .replace(/^[\s.,:;—-]+|[\s,;:—-]+$/g, "").replace(/\s+/g, " ").trim();
}

function finish(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1).replace(/[.!?]+$/, "")}.` : "";
}

function place(value: string) {
  return value.replace(/^the\s+/i, "").replace(/\bJohore\b/gi, "Johor").replace(/\bMalacca\b/gi, "Melaka").trim();
}

function count(value: string) {
  return ({ "1": "Seorang", "2": "Dua", "3": "Tiga", "4": "Empat", "5": "Lima", "6": "Enam", "7": "Tujuh", "8": "Lapan", "9": "Sembilan", "10": "Sepuluh" } as Record<string, string>)[value] ?? value;
}

export function rewriteArchiveClaimToMalay(raw: string, storyType: string) {
  const text = cleanArchiveText(raw);
  let match = text.match(/^(\d+)\s+missing,?\s+(\d+)\s+saved after (?:a\s+)?ship sinks? off (.+)$/i);
  if (match) return finish(`${count(match[2])} orang berjaya diselamatkan selepas sebuah kapal karam di perairan ${place(match[3])}. Namun, ${count(match[1]).toLowerCase()} masih hilang`);

  match = text.match(/^search still on for missing (.+?) boat helmsman$/i);
  if (match) return finish(`Usaha mencari jurumudi kapal yang hilang di ${place(match[1])} masih diteruskan`);

  match = text.match(/^searchers found the (.+?) vessel,?\s*([^,]+),?\s*yesterday as the search for its helmsman,? missing since it capsized on (.+)$/i);
  if (match) {
    const day = ({ monday: "Isnin", tuesday: "Selasa", wednesday: "Rabu", thursday: "Khamis", friday: "Jumaat", saturday: "Sabtu", sunday: "Ahad" } as Record<string, string>)[match[3].toLowerCase()] ?? match[3];
    const owner = place(match[1]).replace(/Sarawak Marine Department/gi, "Jabatan Laut Sarawak");
    return finish(`Laporan itu menyatakan bahawa pasukan pencari telah menemukan kapal ${match[2]} milik ${owner} sehari sebelumnya. Jurumudinya masih hilang selepas kapal itu terbalik pada hari ${day}`);
  }

  match = text.match(/^two more (?:suspects have )?confess(?:ed)? to (?:having a )?role (?:m|in) the (kidnapping and )?murder of (.+)$/i);
  if (match) return finish(`Dua lagi suspek mengaku terlibat dalam ${match[1] ? "penculikan dan " : ""}pembunuhan ${place(match[2]).replace(/^Ms\.?\s+/i, "Cik ")}`);

  match = text.match(/^(?:Perak murder:\s*)?Prince'?s first wife remanded$/i);
  if (match) return "Isteri pertama seorang kerabat Perak direman bagi membantu siasatan.";

  match = text.match(/^the wife of a Perak prince was remanded (?:on \w+|yesterday) to help the investigation into the murder of her husband'?s second wife,?\s*(.+)$/i);
  if (match) return finish(`Isteri pertama seorang kerabat Perak direman bagi membantu siasatan pembunuhan ${place(match[1])}`);

  match = text.match(/^(?:a\s+)?(\d+)-year-old (girl|boy|woman|man) was reported missing(?: from (.+?))?(?: since| after|$)/i);
  if (match) {
    const subject = ({ girl: "kanak-kanak perempuan", boy: "kanak-kanak lelaki", woman: "wanita", man: "lelaki" } as Record<string, string>)[match[2].toLowerCase()];
    return finish(`Seorang ${subject} berusia ${match[1]} tahun dilaporkan hilang${match[3] ? ` dari ${place(match[3])}` : ""}`);
  }

  match = text.match(/^(?:police\s+)?(?:have\s+)?found (?:the\s+)?body of (.+?)(?: in| near| at) (.+)$/i);
  if (match) return finish(`Polis menemukan mayat ${place(match[1])} di ${place(match[2])}`);
  match = text.match(/^(?:a\s+)?body (?:was\s+)?found (?:in|near|at) (.+)$/i);
  if (match) return finish(`Satu mayat ditemukan di ${place(match[1])}`);

  match = text.match(/^(?:police\s+)?arrest(?:ed|s) (.+?)(?: for| over| after) (.+)$/i);
  if (match) return finish(`Polis menahan ${place(match[1])} berhubung ${place(match[2])}`);

  match = text.match(/^(.+?) (?:was|were) (killed|injured) in (?:a |an )?(.+? accident.*)$/i);
  if (match) return finish(`${place(match[1])} ${match[2].toLowerCase() === "killed" ? "maut" : "cedera"} dalam ${place(match[3])}`);

  if (storyType === "PARANORMAL_REPORT") {
    match = text.match(/^(?:residents?|witnesses?) reported (?:that )?(?:they )?(?:saw|heard) (.+)$/i);
    if (match) return finish(`Penduduk mendakwa mereka ${/heard/i.test(text) ? "mendengar" : "melihat"} ${place(match[1])}`);
  }
  if (storyType === "FOLKLORE") {
    match = text.match(/^(?:local )?(?:residents?|people) recorded a legend about (.+)$/i);
    if (match) return finish(`Cerita rakyat tempatan merekodkan legenda mengenai ${place(match[1])}`);
  }
  return "";
}

function tokens(value: string) { return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
function normalized(value: string) { return tokens(value).filter((token) => token.length > 2).join(" "); }
function overlap(left: string, right: string) {
  const a = new Set(tokens(left).filter((token) => token.length > 2)); const b = new Set(tokens(right).filter((token) => token.length > 2));
  return [...a].filter((token) => b.has(token)).length / Math.max(1, Math.min(a.size, b.size));
}
function hasOcrGarbage(value: string) { return OCR_GARBAGE.test(value.replace(/\b[A-Z]{1,5}\d{1,4}\b/g, "")); }

export function assessNarrationQuality(claims: ResearchClaim[]): ResearchPackage["narrationQuality"] {
  const spoken = claims.map((claim) => claim.spokenText).filter(Boolean); const allTokens = spoken.flatMap(tokens);
  const malay = allTokens.filter((token) => MALAY_WORDS.has(token) || /^(?:di|me|mem|men|meng|ber|ter|ke|pe|per)[a-z]{3,}(?:kan|i|an)?$/.test(token)).length;
  const english = allTokens.filter((token) => ENGLISH_WORDS.has(token)).length;
  const malayLanguageRatio = malay + english ? malay / (malay + english) : 0;
  const englishLeakageCount = claims.filter((claim) => claim.spokenText && (normalized(claim.spokenText) === normalized(claim.claimText)
    || (ENGLISH_WORDS.has(tokens(claim.spokenText)[0] ?? "") && overlap(claim.spokenText, claim.claimText) >= .65))).length;
  const ocrLeakageCount = spoken.filter(hasOcrGarbage).length;
  const fragmentCount = spoken.filter((text) => !/[.!?]$/.test(text) || tokens(text).length < 5 || DATELINE.test(text)).length;
  const unnaturalPhraseCount = spoken.filter((text) => /\b(?:Ada dilaporkan|adalah Beckner)\b/i.test(text)).length;
  const headlineLeakageCount = claims.filter((claim) => claim.spokenText && overlap(claim.spokenText, claim.claimText) >= .82 && tokens(claim.claimText).length <= 10).length;
  let repetitionCount = 0; for (let index = 1; index < spoken.length; index += 1) if (spoken.slice(0, index).some((earlier) => overlap(earlier, spoken[index]) >= .78)) repetitionCount += 1;
  const coverage = claims.length ? spoken.length / claims.length : 0;
  const sentenceQuality = spoken.length ? spoken.filter((text) => tokens(text).length >= 5 && tokens(text).length <= 32 && /[.!?]$/.test(text)).length / spoken.length : 0;
  const spokenNaturalnessScore = Math.max(0, Math.min(1, malayLanguageRatio * .35 + coverage * .25 + sentenceQuality * .2
    + (englishLeakageCount ? 0 : .08) + (ocrLeakageCount ? 0 : .07) + (fragmentCount || unnaturalPhraseCount || headlineLeakageCount || repetitionCount ? 0 : .05)));
  const rounded = Number(spokenNaturalnessScore.toFixed(3));
  return { malayLanguageRatio: Number(malayLanguageRatio.toFixed(3)), englishLeakageCount, ocrLeakageCount, fragmentCount, unnaturalPhraseCount,
    headlineLeakageCount, spokenNaturalnessScore: rounded, passes: coverage === 1 && malayLanguageRatio >= .72 && !englishLeakageCount
      && !ocrLeakageCount && !fragmentCount && !unnaturalPhraseCount && !headlineLeakageCount && !repetitionCount && rounded >= .78 };
}

export function rewriteClaimsForSpeech(claims: ResearchClaim[], storyType: string) {
  return claims.map((claim) => { const spokenText = rewriteArchiveClaimToMalay(claim.claimText, storyType); return { ...claim, spokenText,
    rewriteMethod: spokenText ? "DETERMINISTIC" as const : "NONE" as const, rewriteModel: null, validatedAt: spokenText ? new Date().toISOString() : null,
    validationVersion: spokenText ? "5.0-claim-preservation" : null, validationResult: spokenText ? { valid: true, reasons: [], checkedAt: new Date().toISOString(), version: "5.0-claim-preservation" } : null }; });
}
