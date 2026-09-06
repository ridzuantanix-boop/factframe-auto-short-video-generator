import { searchVisuals, searchVideos } from "../data/wikimedia.ts";
import { getEntities, searchEntities } from "../data/wikidata.ts";
import type { Visual } from "../types.ts";
import { classifyRelevance, contentHash, scoreAsset, usageForLicense } from "./assetQuality.ts";
import type { AssetSearchContext, AssetSearchProvider, AssetType, VisualAssetRecord } from "./types.ts";

const caches = new Map<string, Promise<VisualAssetRecord[]>>();
const withCache = (key: string, task: () => Promise<VisualAssetRecord[]>) => { if (!caches.has(key)) caches.set(key, task()); return caches.get(key)!; };

function fromCommons(visual: Visual, context: AssetSearchContext, provider: "WIKIMEDIA_COMMONS" | "WIKIDATA", intended: AssetType): VisualAssetRecord {
  const caption = `${visual.title} ${visual.description}`;
  const relevanceType = classifyRelevance(caption, context.story.title, context.query, context.locations, provider);
  const assetType: AssetType = visual.mediaType === "video" ? "ARCHIVAL_VIDEO" : intended === "LOCATION" ? "LOCATION" : intended === "PORTRAIT" ? "PORTRAIT" : "ENTITY_IMAGE";
  const asset: VisualAssetRecord = {
    id: crypto.randomUUID(), storyCandidateId: context.story.id, sourceId: null, providerAssetId: visual.id ?? visual.sourceUrl,
    assetType, provider, url: visual.url, thumbnailUrl: visual.thumbUrl, originalUrl: visual.sourceUrl, title: visual.title,
    description: visual.description, creator: visual.creator, license: visual.license, licenseUrl: visual.licenseUrl,
    attribution: `${visual.title} — ${visual.creator} (${visual.license})`, publishedAt: null, relevanceScore: 0,
    relevanceType, representationType: relevanceType === "EXACT_EVENT" ? "EXACT" : "CONTEXTUAL", visualRole: context.script.segments[context.segmentIndex]?.visualIntent ?? "ENTITY_IMAGE",
    usageStatus: usageForLicense(visual.license), contentHash: contentHash(visual.sourceUrl), metadata: { width: visual.width, height: visual.height, mimeType: visual.mimeType, query: context.query },
  };
  asset.relevanceScore = scoreAsset(asset, context.story.title, context.query, context.locations, context.story.year, intended);
  return asset;
}

function intendedType(context: AssetSearchContext): AssetType {
  const intent = context.script.segments[context.segmentIndex]?.visualIntent;
  return intent === "LOCATION" ? "LOCATION" : intent === "PORTRAIT" ? "PORTRAIT" : intent === "NEWSPAPER" ? "NEWSPAPER_CLIP" : "ENTITY_IMAGE";
}

export const commonsAssetProvider: AssetSearchProvider = {
  id: "WIKIMEDIA_COMMONS",
  search(context) { return withCache(`commons:${context.query}`, async () => {
    const images = await searchVisuals(context.query).catch(() => []);
    const videos = await searchVideos(context.query).catch(() => []);
    return [...images, ...videos].map((item) => fromCommons(item, context, "WIKIMEDIA_COMMONS", intendedType(context)));
  }); },
};

export const wikidataImageProvider: AssetSearchProvider = {
  id: "WIKIDATA",
  search(context) { return withCache(`wikidata:${context.story.title}`, async () => {
    const hit = (await searchEntities(context.story.title).catch(() => []))[0]; if (!hit?.id) return [];
    const entities = await getEntities([hit.id]).catch(() => null);
    const entity = entities?.[hit.id];
    const value = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const filename = typeof value === "string" ? value : ""; if (!filename) return [];
    const matches = await searchVisuals(filename.replace(/\.[^.]+$/, "")).catch(() => []);
    const exact = matches.find((item) => decodeURIComponent(item.sourceUrl).toLowerCase().includes(filename.replaceAll(" ", "_").toLowerCase())) ?? matches[0];
    return exact ? [fromCommons(exact, context, "WIKIDATA", intendedType(context))] : [];
  }); },
};

type NominatimItem = { lat: string; lon: string; display_name: string; osm_type: string; osm_id: number; boundingbox?: string[] };
export const openStreetMapProvider: AssetSearchProvider = {
  id: "OPENSTREETMAP",
  search(context) { const place = context.locations.find((value) => value && value !== "Malaysia / Malaya") ?? context.locations[0];
    if (!place) return Promise.resolve([]);
    return withCache(`osm:${place}`, async () => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search"); url.searchParams.set("q", place); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1");
        const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "FactFrame/2.0 (evidence-aware visual planner)", Accept: "application/json" } });
        if (!response.ok) return []; const item = (await response.json() as NominatimItem[])[0]; if (!item) return [];
        const originalUrl = `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=9/${item.lat}/${item.lon}`;
        return [{ id: crypto.randomUUID(), storyCandidateId: context.story.id, sourceId: null, providerAssetId: `${item.osm_type}/${item.osm_id}`,
          assetType: "MAP", provider: "OPENSTREETMAP", url: originalUrl, thumbnailUrl: "", originalUrl, title: `Peta ${place}`,
          description: `Penanda lokasi sebenar bagi ${item.display_name}`, creator: "OpenStreetMap contributors", license: "ODbL 1.0", licenseUrl: "https://www.openstreetmap.org/copyright",
          attribution: "© OpenStreetMap contributors", publishedAt: null, relevanceScore: .78, relevanceType: "EXACT_PLACE", representationType: "EXACT",
          visualRole: "MAP", usageStatus: "REUSABLE", contentHash: contentHash(originalUrl), metadata: { lat: Number(item.lat), lon: Number(item.lon), regionLabel: item.display_name, boundingBox: item.boundingbox, renderMode: "MAP_MARKER" } }];
      } catch { return []; } finally { clearTimeout(timer); }
    });
  },
};

export const defaultAssetProviders = [commonsAssetProvider, openStreetMapProvider, wikidataImageProvider];
