import type { EntityType, Fact, SearchResult } from "@/lib/types";

const WD = "https://www.wikidata.org/wiki/";
const REST = "https://www.wikidata.org/w/rest.php/wikibase/v1";
const REQUEST_HEADERS = { "Api-User-Agent": "FactFrame/1.0 (local educational video generator)" };

async function wikidataFetch(url: string, revalidate: number) {
  let response = await fetch(url, { headers: REQUEST_HEADERS, next: { revalidate } });
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    response = await fetch(url, { headers: REQUEST_HEADERS, next: { revalidate } });
  }
  return response;
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string; url?: string }>;
  claims?: Record<string, Claim[]>;
};

export async function searchEntities(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, language: "ms", limit: "8" });
  let response = await wikidataFetch(`${REST}/search/items?${params}`, 3600);
  if (!response.ok) throw new Error("Wikidata search failed");
  let data = await response.json();
  if (!(data.results ?? []).length) {
    params.set("language", "en");
    response = await wikidataFetch(`${REST}/search/items?${params}`, 3600);
    data = await response.json();
  }
  return (data.results ?? []).map((item: { id: string; "display-label"?: { value?: string }; description?: { value?: string; language?: string }; match?: { text?: string } }) => ({
    id: item.id,
    label: item.match?.text ?? item["display-label"]?.value ?? item.id,
    description: item.description?.language === "ms" ? item.description.value ?? "entiti dalam Wikidata" : "entiti berkaitan dalam Wikidata",
    url: `${WD}${item.id}`,
  }));
}

export async function searchEntityPage(query: string, offset = 0, limit = 25): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const params = new URLSearchParams({ action: "wbsearchentities", search: query, language: "en", uselang: "ms", type: "item", limit: String(limit), continue: String(offset), format: "json" });
  const response = await wikidataFetch(`https://www.wikidata.org/w/api.php?${params}`, 21600);
  if (!response.ok) throw new Error("Wikidata discovery failed");
  const data = await response.json();
  const results = (data.search ?? []).map((item: { id: string; label?: string; description?: string; concepturi?: string }) => ({
    id: item.id,
    label: item.label ?? item.id,
    description: item.description ?? "entiti bersumber dalam Wikidata",
    url: item.concepturi ?? `${WD}${item.id}`,
  }));
  return { results, hasMore: typeof data["search-continue"] === "number" };
}

export async function searchWikipediaCandidates(query: string, offset = 0, limit = 25): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "0", gsrlimit: String(limit), gsroffset: String(offset), prop: "pageprops|description|info", inprop: "url", format: "json", origin: "*" });
  const response = await wikidataFetch(`https://en.wikipedia.org/w/api.php?${params}`, 21600);
  if (!response.ok) throw new Error("Wikipedia discovery failed");
  const data = await response.json();
  const pages = Object.values(data.query?.pages ?? {}) as Array<{ title: string; description?: string; fullurl?: string; pageprops?: { wikibase_item?: string } }>;
  const results = pages.filter((page) => page.pageprops?.wikibase_item).map((page) => ({ id: page.pageprops!.wikibase_item!, label: page.title, description: page.description ?? `Rencana bersumber tentang ${page.title}`, url: page.fullurl ?? `${WD}${page.pageprops!.wikibase_item}` }));
  return { results, hasMore: typeof data.continue?.gsroffset === "number" };
}

export async function getEntity(id: string): Promise<Entity> {
  const response = await wikidataFetch(`${WD}Special:EntityData/${id}.json`, 86400);
  if (!response.ok) throw new Error("Wikidata lookup failed");
  const data = await response.json();
  return data.entities[id];
}

function rawValue(entity: Entity, property: string): unknown {
  return entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
}

function entityId(entity: Entity, property: string): string | undefined {
  const value = rawValue(entity, property) as { id?: string } | undefined;
  return value?.id;
}

function timeYear(entity: Entity, property: string): string | undefined {
  const value = rawValue(entity, property) as { time?: string } | undefined;
  const match = value?.time?.match(/[+-](\d{4,})-/);
  return match ? String(Number(match[1])) : undefined;
}

function quantity(entity: Entity, property: string, expectedUnit: string): number | undefined {
  const value = rawValue(entity, property) as { amount?: string; unit?: string } | undefined;
  return value?.amount && value.unit?.endsWith(expectedUnit) ? Number(value.amount) : undefined;
}

async function labels(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const values = await Promise.all(unique.map(async (id) => {
    let response = await wikidataFetch(`${REST}/entities/items/${id}/labels/ms`, 86400);
    if (!response.ok) response = await wikidataFetch(`${REST}/entities/items/${id}/labels/en`, 86400);
    return [id, response.ok ? await response.json() : id] as const;
  }));
  return Object.fromEntries(values);
}

export async function extractFacts(entity: Entity): Promise<{ facts: Fact[]; entityType: EntityType }> {
  const properties = ["P31", "P106", "P27", "P19", "P20", "P17", "P170", "P176", "P112", "P57", "P61", "P138", "P361", "P276"];
  const ids = properties.map((p) => entityId(entity, p)).filter((x): x is string => Boolean(x));
  const names = await labels(ids);
  const named = (p: string) => { const id = entityId(entity, p); return id ? names[id] : undefined; };
  const instance = (named("P31") ?? "").toLowerCase();
  const description = entity.descriptions?.en?.value?.toLowerCase() ?? "";
  const descriptionMs = entity.descriptions?.ms?.value?.toLowerCase() ?? "";
  const haystack = `${instance} ${description} ${descriptionMs}`;
  let entityType: EntityType = "general";
  if (/human|person|scientist|artist|politician|inventor|manusia|tokoh|ahli politik|saintis|pelakon|penyanyi|perdana menteri/.test(haystack)) entityType = "person";
  else if (/planet|star|moon|asteroid|astronom|bintang|bulan|angkasa/.test(haystack)) entityType = "space";
  else if (/animal|species|mammal|bird|fish|reptile|haiwan|spesies|mamalia|burung|ikan|reptilia/.test(haystack)) entityType = "animal";
  else if (/city|country|mountain|building|tower|place|landmark|wall|fortification|bandar|negara|gunung|bangunan|tempat|menara|tembok|kubu/.test(haystack)) entityType = "place";
  else if (/company|organization|organisation|business|enterprise|syarikat|pertubuhan|organisasi/.test(haystack)) entityType = "organisation";
  else if (/event|disaster|battle|voyage|sinking|peristiwa|bencana|pertempuran|pelayaran/.test(haystack)) entityType = "event";
  else if (/invention|ship|liner|vessel|object|device|work|ciptaan|kapal|objek|alat/.test(haystack)) entityType = "object";

  const name = entity.labels?.ms?.value ?? entity.labels?.en?.value ?? entity.sitelinks?.mswiki?.title ?? entity.sitelinks?.enwiki?.title ?? entity.id;
  const sourceUrl = `${WD}${entity.id}`;
  const candidates: Array<Fact | undefined> = [];
  const born = timeYear(entity, "P569");
  const died = timeYear(entity, "P570");
  const inception = timeYear(entity, "P571");
  const dissolved = timeYear(entity, "P576");
  const population = quantity(entity, "P1082", "/Q199");
  const elevation = quantity(entity, "P2044", "/Q11573");
  const occupation = named("P106");
  const citizenship = named("P27");
  const birthplace = named("P19");
  const country = named("P17");
  const creator = named("P170") ?? named("P61") ?? named("P112");
  if (born) candidates.push({ label: `Dilahirkan pada ${born}`, sentence: `Kisah hidup ${name} bermula pada tahun ${born}${birthplace ? ` di ${birthplace}` : ""}.`, sourceUrl });
  if (occupation) candidates.push({ label: occupation, sentence: `Dalam perjalanan hidupnya, ${name} dikenali sebagai ${occupation}.`, sourceUrl });
  if (citizenship) candidates.push({ label: `Kewarganegaraan ${citizenship}`, sentence: `${name} mempunyai kewarganegaraan ${citizenship}.`, sourceUrl });
  if (died) candidates.push({ label: `Meninggal dunia pada ${died}`, sentence: `Perjalanan hidup ${name} berakhir pada tahun ${died}.`, sourceUrl });
  if (inception) candidates.push({ label: `Bermula pada ${inception}`, sentence: `Kisah ${name} bermula pada tahun ${inception}.`, sourceUrl });
  if (country) candidates.push({ label: `Terletak di ${country}`, sentence: `${name} terletak di ${country}.`, sourceUrl });
  if (creator) candidates.push({ label: `Dihasilkan oleh ${creator}`, sentence: `${name} dihasilkan oleh ${creator}.`, sourceUrl });
  if (population && population > 0) candidates.push({ label: `Penduduk ${Math.round(population).toLocaleString("ms-MY")}`, sentence: `Jumlah penduduk yang direkodkan ialah sekitar ${Math.round(population).toLocaleString("ms-MY")} orang.`, sourceUrl });
  if (elevation) candidates.push({ label: `Ketinggian ${Math.round(elevation).toLocaleString("ms-MY")} meter`, sentence: `Ketinggiannya mencecah kira-kira ${Math.round(elevation).toLocaleString("ms-MY")} meter dari aras laut.`, sourceUrl });
  if (dissolved) candidates.push({ label: `Berakhir pada ${dissolved}`, sentence: `Riwayatnya berakhir pada tahun ${dissolved}.`, sourceUrl });
  return { facts: candidates.filter((x): x is Fact => Boolean(x)).slice(0, 5), entityType };
}

export type { Entity };
