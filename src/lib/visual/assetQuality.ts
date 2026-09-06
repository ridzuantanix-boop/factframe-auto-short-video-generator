import { createHash } from "node:crypto";
import type { AssetType, RelevanceType, UsageStatus, VisualAssetRecord } from "./types.ts";

const terms = (value: string) => new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((x) => x.length > 2));
const overlap = (a: string, b: string) => { const left = terms(a), right = terms(b); return [...left].filter((x) => right.has(x)).length / Math.max(1, Math.min(left.size, right.size)); };

export function normalizeLicense(value: string) {
  const v = value.toLowerCase();
  if (/noncommercial|no derivatives|cc[ -]?by[ -]?(?:nc|nd)/.test(v)) return "RESTRICTED_OR_UNKNOWN";
  if (v.includes("public domain")) return "PUBLIC_DOMAIN";
  if (v.includes("cc0")) return "CC0";
  if (/cc[ -]?by[ -]?sa|attribution-sharealike/.test(v)) return "CC_BY_SA";
  if (/cc[ -]?by|creative commons attribution/.test(v)) return "CC_BY";
  if (v.includes("odbl")) return "ODBL";
  if (v.includes("factframe_generated")) return "GENERATED";
  if (/copyright|all rights|unknown/.test(v)) return "RESTRICTED_OR_UNKNOWN";
  return "UNKNOWN";
}
export function reusableLicense(value: string) { return ["PUBLIC_DOMAIN", "CC0", "CC_BY", "CC_BY_SA"].includes(normalizeLicense(value)); }
export function contentHash(url: string) { return createHash("sha256").update(url.trim().toLowerCase()).digest("hex"); }

export function classifyRelevance(assetText: string, storyTitle: string, query: string, locations: string[], provider: string): RelevanceType {
  const text = assetText.toLowerCase();
  const titleMatch = overlap(assetText, storyTitle);
  const locationMatch = locations.some((place) => place.length > 2 && text.includes(place.toLowerCase()));
  if (provider === "OPENSTREETMAP" && locationMatch) return "EXACT_PLACE";
  if (titleMatch >= .8 && overlap(assetText, query) >= .55) return "EXACT_EVENT";
  if (titleMatch >= .45 || overlap(assetText, query) >= .55) return "EXACT_ENTITY";
  if (locationMatch) return "EXACT_PLACE";
  if (/histor|archive|museum|memorial|operation|rescue|search/.test(text)) return "HISTORICAL_CONTEXT";
  return "GENERIC_CONTEXT";
}

export function scoreAsset(asset: Pick<VisualAssetRecord, "title" | "description" | "assetType" | "publishedAt" | "relevanceType">, storyTitle: string, query: string, locations: string[], storyYear: number, intended: AssetType) {
  const caption = `${asset.title} ${asset.description}`; const entity = overlap(caption, storyTitle); const queryMatch = overlap(caption, query); const titleMatch = overlap(asset.title, query);
  const location = locations.some((place) => caption.toLowerCase().includes(place.toLowerCase())) ? 1 : 0;
  const year = Number(asset.publishedAt?.slice(0, 4)); const date = year ? Math.max(0, 1 - Math.abs(year - storyYear) / 50) : 0;
  const suitability = asset.assetType === intended || (intended === "ENTITY_IMAGE" && asset.assetType === "ARCHIVAL_PHOTO") ? 1 : .45;
  const tier: Record<RelevanceType, number> = { EXACT_EVENT: 1, EXACT_ENTITY: .82, EXACT_PLACE: .78, HISTORICAL_CONTEXT: .6, GENERIC_CONTEXT: .35, FALLBACK: .2 };
  return Math.max(0, Math.min(1, entity * .2 + queryMatch * .15 + titleMatch * .18 + location * .13 + date * .08 + suitability * .1 + tier[asset.relevanceType] * .16));
}

export function validAsset(asset: VisualAssetRecord) {
  if (!asset.url || !asset.title || !asset.license || asset.usageStatus === "REJECTED") return false;
  if (asset.metadata.broken === true || asset.metadata.httpStatus && Number(asset.metadata.httpStatus) >= 400) return false;
  const text = `${asset.title} ${asset.description} ${asset.url}`.toLowerCase();
  if (/shutterstock|alamy|istock|dreamstime|watermark/.test(text)) return false;
  const width = Number(asset.metadata.width ?? 0), height = Number(asset.metadata.height ?? 0);
  if (asset.provider !== "FACTFRAME" && asset.provider !== "OPENSTREETMAP" && (width && width < 640 || height && height < 320)) return false;
  if (["ARCHIVAL_PHOTO", "ENTITY_IMAGE", "LOCATION"].includes(asset.assetType) && /\b(logo|icon|coat of arms|signature)\b/.test(text)) return false;
  return asset.usageStatus !== "REUSABLE" || asset.provider === "OPENSTREETMAP" || reusableLicense(asset.license);
}

export function dedupeAssets(values: VisualAssetRecord[]) {
  const seen = new Set<string>(); return values.filter((asset) => {
    const keys = [`${asset.provider}:${asset.providerAssetId ?? ""}`, asset.originalUrl, asset.contentHash ?? ""].filter((x) => x && !x.endsWith(":"));
    if (keys.some((key) => seen.has(key))) return false; keys.forEach((key) => seen.add(key)); return true;
  });
}

export function usageForLicense(license: string, restricted = false): UsageStatus { return restricted ? "RESTRICTED_REFERENCE" : reusableLicense(license) ? "REUSABLE" : "REJECTED"; }
