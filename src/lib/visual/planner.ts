import type { MysteryScript, StoryRecord } from "../types.ts";
import { buildVisualQueries } from "../video/visualQueries.ts";
import { visualKeywords } from "../video/visualQueries.ts";
import { dedupeAssets, validAsset } from "./assetQuality.ts";
import { defaultAssetProviders } from "./providers.ts";
import type { AssetSearchProvider, AssetType, VisualAssetRecord, VisualPlan, VisualPlanSegment } from "./types.ts";

const realProviders = new Set(["WIKIMEDIA_COMMONS", "WIKIDATA", "OPENSTREETMAP"]);
const relevanceRank = { EXACT_EVENT: 6, EXACT_ENTITY: 5, EXACT_PLACE: 4, HISTORICAL_CONTEXT: 3, GENERIC_CONTEXT: 2, FALLBACK: 1 } as const;
const narrativeQueryWords = new Set(["mulanya", "sebuah", "dilaporkan", "orang", "dalamnya", "kira", "daripada", "ditemukan", "berlaku", "anggota", "tentera", "udara", "diraja", "malaysia"]);

export function sceneRange(seconds: number) { return seconds <= 12 ? [2, 4] : seconds <= 20 ? [3, 5] : seconds <= 35 ? [4, 7] : [6, 10]; }
function targetCount(script: MysteryScript) { const [min, max] = sceneRange(script.durationTarget); return Math.min(max, Math.max(min, script.segments.length)); }
function relevantClaims(story: StoryRecord, claimIds: string[]) { return story.claims.filter((claim) => claimIds.includes(claim.id)); }
function fallbackType(intent: string): AssetType { return intent === "MAP" || intent === "LOCATION" ? "MAP" : intent === "TIMELINE" ? "TIMELINE" : intent === "NEWSPAPER" || intent === "DOCUMENT" ? "DOCUMENT" : "FACT_CARD"; }

function fallbackAsset(story: StoryRecord, script: MysteryScript, index: number, sourceTitle: string): VisualAssetRecord {
  const segment = script.segments[index], type = fallbackType(segment.visualIntent); const sourceId = segment.sourceIds[0] ?? null;
  return { id: crypto.randomUUID(), storyCandidateId: story.id, sourceId, providerAssetId: null, assetType: type, provider: "FACTFRAME", url: "", thumbnailUrl: "", originalUrl: "",
    title: `${type.replaceAll("_", " ")} — ${story.title}`, description: `Grafik programatik berlabel; bukan artifak arkib. ${segment.text}`,
    creator: "FactFrame", license: "FACTFRAME_GENERATED", licenseUrl: "", attribution: sourceTitle ? `Sumber fakta: ${sourceTitle}` : "FactFrame",
    publishedAt: null, relevanceScore: .2, relevanceType: "FALLBACK", representationType: "PROGRAMMATIC", visualRole: segment.visualIntent,
    usageStatus: "GENERATED_SAFE", contentHash: null, metadata: { sourceTitle, place: story.region, date: story.year, artifactImpersonation: false } };
}

function archiveReference(story: StoryRecord, script: MysteryScript, index: number) {
  const segment = script.segments[index]; const source = story.sources.find((item) => segment.sourceIds.includes(item.id)); if (!source) return null;
  return { id: crypto.randomUUID(), storyCandidateId: story.id, sourceId: source.id, providerAssetId: source.id, assetType: "NEWSPAPER_CLIP" as const,
    provider: "INDEXED_ARCHIVE" as const, url: source.url, thumbnailUrl: "", originalUrl: source.url, title: source.title, description: `Rujukan metadata arkib: ${source.publisher}`,
    creator: source.publisher, license: "COPYRIGHT_STATUS_UNKNOWN", licenseUrl: "", attribution: `${source.title}, ${source.publisher}`,
    publishedAt: source.date ?? null, relevanceScore: .7, relevanceType: "EXACT_EVENT" as const, representationType: "CONTEXTUAL" as const,
    visualRole: "NEWSPAPER", usageStatus: "RESTRICTED_REFERENCE" as const, contentHash: null, metadata: { citationOnly: true, previewReuseAuthorized: false } };
}

export async function planEvidenceAwareVisuals(story: StoryRecord, script: MysteryScript, options: { providers?: AssetSearchProvider[] } = {}): Promise<VisualPlan> {
  const providers = options.providers ?? defaultAssetProviders; const count = targetCount(script); const selectedSegments = script.segments.slice(0, count);
  const people = [...new Set(story.people ?? [])];
  const locations = [...new Set([story.region, ...(story.locations ?? [])].filter(Boolean))];
  const assets: VisualAssetRecord[] = []; const planSegments: VisualPlanSegment[] = []; const segmentDuration = script.durationTarget / selectedSegments.length;
  let searchedAssetCount = 0; let acceptedCandidateCount = 0; let rejectedAssetCount = 0;
  for (const [index, segment] of selectedSegments.entries()) {
    const claims = relevantClaims(story, segment.claimIds ?? []); const claimLocations = claims.length && story.region ? [story.region] : [];
    const segmentLocations = [...new Set([...locations, ...claimLocations])];
    const queries = buildVisualQueries(story, segment.text, segment.visualIntent);
    const visualTranslations: Record<string, string> = { helikopter: "helicopter", pesawat: "aircraft", kapal: "ship", bangunan: "building", lokasi: "location" };
    const salient = visualKeywords(segment.text).filter((word) => !narrativeQueryWords.has(word)).slice(0, 3).map((word) => visualTranslations[word] ?? word);
    const peopleText = people.join(" ").toLowerCase();
    const properNames = [...new Set(segment.text.match(/\b\p{Lu}[\p{L}’'-]+\b/gu) ?? [])]
      .filter((word) => !peopleText.includes(word.toLowerCase()) && !["Pada", "Namun", "Tiga", "Tujuh", "Menurut"].includes(word));
    const entityQuery = `${people.slice(0, 2).join(" ")} ${(properNames.length ? properNames : salient).slice(0, 3).join(" ")}`.trim();
    const query = segment.visualIntent === "LOCATION" || segment.visualIntent === "MAP"
      ? `${segmentLocations.at(-1) ?? story.region} ${story.country}` : entityQuery || queries[index % Math.max(1, Math.min(3, queries.length))] || story.title;
    const context = { story, script, segmentIndex: index, query, locations: segmentLocations, people };
    const searched: VisualAssetRecord[] = [];
    for (const provider of providers) searched.push(...await provider.search(context).catch(() => []));
    searchedAssetCount += searched.length; const valid = dedupeAssets(searched).filter(validAsset); acceptedCandidateCount += valid.length; rejectedAssetCount += searched.length - valid.length;
    let candidates = valid.filter((asset) => asset.usageStatus === "REUSABLE")
      .sort((a, b) => relevanceRank[b.relevanceType] - relevanceRank[a.relevanceType] || b.relevanceScore - a.relevanceScore);
    if (!['MAP', 'LOCATION'].includes(segment.visualIntent) && candidates.some((asset) => asset.assetType !== "MAP")) candidates = candidates.filter((asset) => asset.assetType !== "MAP");
    const unused = (asset: VisualAssetRecord) => !assets.some((prior) => prior.provider === asset.provider && prior.providerAssetId === asset.providerAssetId);
    let chosen = ['MAP', 'LOCATION'].includes(segment.visualIntent) && /\b(Ba['’]?Kelalan|Sarawak|Sabah|Johor|Melaka|Perak|Selangor|Kedah|Kelantan|Pahang|Terengganu|Penang|Pulau Pinang)\b/i.test(segment.text)
      ? candidates.find((asset) => asset.assetType === "MAP" && unused(asset)) : undefined;
    chosen ??= candidates.find(unused);
    const reference = archiveReference(story, script, index); if (reference) assets.push(reference);
    if (!chosen && (segment.visualIntent === "MAP" || segment.visualIntent === "LOCATION")) chosen = candidates.find((asset) => asset.assetType === "MAP" && unused(asset));
    if (!chosen) chosen = fallbackAsset(story, script, index, reference?.title ?? story.sources.find((source) => segment.sourceIds.includes(source.id))?.title ?? "");
    assets.push(chosen);
    planSegments.push({ segmentId: `${story.id}-segment-${index + 1}`, segmentIndex: index, narration: segment.text, claimIds: segment.claimIds ?? [], sourceIds: segment.sourceIds,
      visualIntent: segment.visualIntent, assetIds: [chosen.id], fallbackType: chosen.provider === "FACTFRAME" ? chosen.assetType : null,
      startTime: Number((index * segmentDuration).toFixed(2)), endTime: Number(((index + 1) * segmentDuration).toFixed(2)),
      reason: chosen.provider === "FACTFRAME" ? "Tiada aset boleh guna yang cukup relevan; fallback dilabel sebagai grafik programatik." : `${chosen.relevanceType}: ${chosen.title}` });
  }
  const unique = dedupeAssets(assets); const chosenIds = new Set(planSegments.flatMap((item) => item.assetIds)); const chosen = unique.filter((asset) => chosenIds.has(asset.id));
  const covered = planSegments.filter((segment) => segment.assetIds.length).length; const real = chosen.filter((asset) => realProviders.has(asset.provider)).length; const fallback = chosen.filter((asset) => asset.provider === "FACTFRAME").length;
  return { id: crypto.randomUUID(), storyCandidateId: story.id, durationSeconds: script.durationTarget, status: covered === planSegments.length ? "READY" : covered ? "PARTIAL" : "NOT_PLANNED",
    segments: planSegments, assets: unique, visualCoverageScore: covered / Math.max(1, planSegments.length), realAssetCoverage: real / Math.max(1, planSegments.length),
    fallbackCoverage: fallback / Math.max(1, planSegments.length), createdAt: new Date().toISOString(), metadata: { providers: providers.map((provider) => provider.id), targetSceneCount: count,
      searchedAssetCount, acceptedCandidateCount, rejectedAssetCount } };
}
