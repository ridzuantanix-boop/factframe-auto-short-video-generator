import postgres, { type Sql, type TransactionSql } from "postgres";
import type { StoryCandidate, StoryCandidateInput, StoryIndexStatus } from "../types";
import type { StoredStorySource, StorySourceInput } from "../archive/types.ts";
import type { ResearchClaim, ResearchPackage } from "../research/types.ts";
import { dedupeKey, mergeCandidates } from "./dedupe.ts";
import { STORY_INDEX_SCHEMA } from "./schema.ts";

type Row = Record<string, unknown>;
export type CatalogQuery = { category?: string; country?: string; status?: StoryIndexStatus; search?: string; page?: number; limit?: number; sort?: "newest" | "oldest" | "title" | "research" };
export type CatalogStats = { total: number; discovered: number; partial: number; ready: number; hidden: number; malaysiaMalaya: number; confirmedMalaysia: number; probableMalaysia: number; unknownGeography: number; global: number; categories: Record<string, number> };

function date(value: unknown) { return value instanceof Date ? value.toISOString() : String(value); }
function nullableDate(value: unknown) { return value ? date(value) : null; }
function strings(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function sourceFromRow(row: Row): StoredStorySource {
  return { id: String(row.id), storyCandidateId: String(row.story_candidate_id), provider: String(row.provider), sourceType: row.source_type as StoredStorySource["sourceType"],
    title: String(row.title), publisher: String(row.publisher), url: String(row.url), publishedAt: nullableDate(row.published_at), accessedAt: date(row.accessed_at),
    snippet: String(row.snippet), metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
    reliabilityLevel: row.reliability_level as StoredStorySource["reliabilityLevel"] };
}

function claimFromRow(row: Row): ResearchClaim {
  return { id: String(row.id), storyCandidateId: String(row.story_candidate_id), claimText: String(row.claim_text), spokenText: String(row.spoken_text ?? ""), normalizedClaim: String(row.normalized_claim),
    claimType: row.claim_type as ResearchClaim["claimType"], confidence: row.confidence as ResearchClaim["confidence"], sourceIds: strings(row.source_ids),
    eventDate: nullableDate(row.event_date), people: strings(row.people), locations: strings(row.locations), priority: row.priority as ResearchClaim["priority"],
    visualIntent: row.visual_intent as ResearchClaim["visualIntent"], ocrQuality: Number(row.ocr_quality) };
}

function fromRow(row: Row): StoryCandidate {
  return {
    id: String(row.id), canonicalEntityId: row.canonical_entity_id ? String(row.canonical_entity_id) : null,
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : null, title: String(row.title),
    normalizedTitle: String(row.normalized_title), slug: String(row.slug), summary: String(row.summary),
    country: String(row.country), region: String(row.region), category: String(row.category), storyType: String(row.story_type),
    status: row.status as StoryIndexStatus, sourceCount: Number(row.source_count), claimCount: Number(row.claim_count),
    researchScore: row.research_score === null ? null : Number(row.research_score),
    visualScore: row.visual_score === null ? null : Number(row.visual_score),
    narrativePotentialScore: row.narrative_potential_score === null ? null : Number(row.narrative_potential_score),
    sourceHints: strings(row.source_hints), searchTerms: strings(row.search_terms), aliases: strings(row.aliases),
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
    discoveredAt: date(row.discovered_at), lastResearchedAt: nullableDate(row.last_researched_at),
    lastVerifiedAt: nullableDate(row.last_verified_at), updatedAt: date(row.updated_at),
    originProvider: String(row.origin_provider), originQuery: String(row.origin_query),
  };
}

function databaseOptions(url: string) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  const sslSetting = process.env.DATABASE_SSL;
  return { max: Number(process.env.DATABASE_POOL_SIZE ?? 5), prepare: false, idle_timeout: 20, connect_timeout: 15,
    ssl: sslSetting === "disable" || (local && sslSetting !== "require") ? false : "require" as const };
}

export class StoryStore {
  private readonly sql: Sql;
  constructor(sql: Sql) { this.sql = sql; }

  async migrate() { await this.sql.unsafe(STORY_INDEX_SCHEMA); }
  async close() { await this.sql.end({ timeout: 5 }); }

  async findByIdentity(candidate: Pick<StoryCandidateInput, "canonicalEntityId" | "canonicalUrl" | "normalizedTitle"> & { id?: string }, sql: Sql | TransactionSql = this.sql) {
    const rows = await sql<Row[]>`
      SELECT * FROM story_candidates
      WHERE (${candidate.id ?? null}::text IS NOT NULL AND id = ${candidate.id ?? null})
         OR (${candidate.canonicalEntityId}::text IS NOT NULL AND canonical_entity_id = ${candidate.canonicalEntityId})
         OR (${candidate.canonicalUrl}::text IS NOT NULL AND canonical_url = ${candidate.canonicalUrl})
         OR normalized_title = ${candidate.normalizedTitle}
      ORDER BY CASE WHEN id = ${candidate.id ?? null} THEN 0 WHEN canonical_entity_id = ${candidate.canonicalEntityId} THEN 1 WHEN canonical_url = ${candidate.canonicalUrl} THEN 2 ELSE 3 END
      LIMIT 1`;
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByArchiveCluster(clusterKey: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates WHERE metadata->>'archiveClusterKey'=${clusterKey} LIMIT 1`;
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async upsert(candidate: StoryCandidateInput) {
    return this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey(candidate)}))`;
      const existing = await this.findByIdentity(candidate, tx);
      const value = existing ? mergeCandidates(existing, candidate) : candidate;
      const now = value.updatedAt ?? new Date().toISOString();
      if (existing) {
        const rows = await tx<Row[]>`UPDATE story_candidates SET
          canonical_entity_id=${value.canonicalEntityId}, canonical_url=${value.canonicalUrl}, title=${value.title}, slug=${value.slug},
          summary=${value.summary}, country=${value.country}, region=${value.region}, category=${value.category}, story_type=${value.storyType},
          status=${value.status}, source_count=${value.sourceCount}, claim_count=${value.claimCount}, research_score=${value.researchScore},
          visual_score=${value.visualScore}, narrative_potential_score=${value.narrativePotentialScore}, source_hints=${tx.json(value.sourceHints)},
          search_terms=${tx.json(value.searchTerms)}, aliases=${tx.json(value.aliases)}, metadata=${tx.json(JSON.parse(JSON.stringify(value.metadata)))},
          last_researched_at=${value.lastResearchedAt}, last_verified_at=${value.lastVerifiedAt}, updated_at=${now}
          WHERE id=${existing.id} RETURNING *`;
        return fromRow(rows[0]);
      }
      const rows = await tx<Row[]>`INSERT INTO story_candidates
        (id, canonical_entity_id, canonical_url, title, normalized_title, slug, summary, country, region, category, story_type, status,
         source_count, claim_count, research_score, visual_score, narrative_potential_score, source_hints, search_terms, aliases, metadata,
         discovered_at, last_researched_at, last_verified_at, updated_at, origin_provider, origin_query)
        VALUES (${value.id!}, ${value.canonicalEntityId}, ${value.canonicalUrl}, ${value.title}, ${value.normalizedTitle}, ${value.slug},
          ${value.summary}, ${value.country}, ${value.region}, ${value.category}, ${value.storyType}, ${value.status}, ${value.sourceCount},
          ${value.claimCount}, ${value.researchScore}, ${value.visualScore}, ${value.narrativePotentialScore}, ${tx.json(value.sourceHints)},
          ${tx.json(value.searchTerms)}, ${tx.json(value.aliases)}, ${tx.json(JSON.parse(JSON.stringify(value.metadata)))}, ${value.discoveredAt ?? now},
          ${value.lastResearchedAt}, ${value.lastVerifiedAt}, ${now}, ${value.originProvider}, ${value.originQuery}) RETURNING *`;
      return fromRow(rows[0]);
    });
  }

  async list(query: CatalogQuery = {}) {
    const page = Math.max(1, query.page ?? 1); const limit = Math.min(100, Math.max(1, query.limit ?? 24));
    const offset = (page - 1) * limit; const category = query.category || null; const country = query.country || null;
    const status = query.status || null; const search = query.search?.trim() || null; const pattern = search ? `%${search}%` : null;
    const condition = this.sql`WHERE (${category}::text IS NULL OR category=${category} OR metadata->'categories' ? ${category})
      AND (${country}::text IS NULL OR country=${country})
      AND ((${status}::text IS NULL AND status != 'HIDDEN') OR status=${status})
      AND (${pattern}::text IS NULL OR title ILIKE ${pattern} OR summary ILIKE ${pattern} OR aliases::text ILIKE ${pattern})`;
    const [{ count }] = await this.sql<{ count: string }[]>`SELECT count(*)::text AS count FROM story_candidates ${condition}`;
    const order = query.sort === "oldest" ? this.sql`discovered_at ASC` : query.sort === "title" ? this.sql`title ASC` : query.sort === "research" ? this.sql`research_score DESC NULLS LAST, updated_at DESC` : this.sql`updated_at DESC`;
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates ${condition} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;
    const total = Number(count);
    return { items: rows.map(fromRow), total, page, hasMore: offset + rows.length < total };
  }

  async stats(): Promise<CatalogStats> {
    const [row] = await this.sql<Row[]>`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='DISCOVERED')::int AS discovered, count(*) FILTER (WHERE status='PARTIAL')::int AS partial,
      count(*) FILTER (WHERE status='READY')::int AS ready, count(*) FILTER (WHERE status='HIDDEN')::int AS hidden,
      count(*) FILTER (WHERE country='Malaysia')::int AS malaysia_malaya,
      count(*) FILTER (WHERE country='Malaysia' AND metadata->>'geographyConfidence' IN ('HIGH','MEDIUM'))::int AS confirmed_malaysia,
      count(*) FILTER (WHERE country='Malaysia' AND metadata->>'geographyConfidence'='LOW')::int AS probable_malaysia,
      count(*) FILTER (WHERE metadata->>'geographyConfidence'='UNKNOWN' OR country='Unknown')::int AS unknown_geography,
      count(*) FILTER (WHERE country!='Malaysia' AND country!='Unknown' AND coalesce(metadata->>'geographyConfidence','UNKNOWN')!='UNKNOWN')::int AS global FROM story_candidates`;
    const categories = await this.sql<{ category: string; count: number }[]>`SELECT category, count(*)::int AS count FROM story_candidates GROUP BY category ORDER BY category`;
    return { total: Number(row.total), discovered: Number(row.discovered), partial: Number(row.partial), ready: Number(row.ready), hidden: Number(row.hidden),
      malaysiaMalaya: Number(row.malaysia_malaya), confirmedMalaysia: Number(row.confirmed_malaysia), probableMalaysia: Number(row.probable_malaysia),
      unknownGeography: Number(row.unknown_geography), global: Number(row.global), categories: Object.fromEntries(categories.map((item) => [item.category, Number(item.count)])) };
  }

  async listAll() {
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates ORDER BY id`;
    return rows.map(fromRow);
  }

  async updateClassification(id: string, value: Pick<StoryCandidate, "country" | "region" | "storyType" | "metadata">) {
    const rows = await this.sql<Row[]>`UPDATE story_candidates SET country=${value.country}, region=${value.region},
      story_type=${value.storyType}, metadata=${this.sql.json(JSON.parse(JSON.stringify(value.metadata)))}, updated_at=now()
      WHERE id=${id} RETURNING *`;
    if (!rows[0]) throw new Error(`Story candidate not found: ${id}`);
    return fromRow(rows[0]);
  }

  async upsertSource(source: StorySourceInput) {
    const id = source.id ?? crypto.randomUUID();
    const rows = await this.sql<Row[]>`INSERT INTO story_sources
      (id, story_candidate_id, provider, source_type, title, publisher, url, published_at, accessed_at, snippet, metadata, reliability_level)
      VALUES (${id}, ${source.storyCandidateId}, ${source.provider}, ${source.sourceType}, ${source.title}, ${source.publisher}, ${source.url},
        ${source.publishedAt}, ${source.accessedAt}, ${source.snippet}, ${this.sql.json(JSON.parse(JSON.stringify(source.metadata)))}, ${source.reliabilityLevel})
      ON CONFLICT (provider, url) DO UPDATE SET title=EXCLUDED.title, publisher=EXCLUDED.publisher, published_at=EXCLUDED.published_at,
        accessed_at=EXCLUDED.accessed_at, snippet=EXCLUDED.snippet, metadata=EXCLUDED.metadata, reliability_level=EXCLUDED.reliability_level
      RETURNING *, (xmax=0) AS inserted`;
    return { id: String(rows[0].id), storyCandidateId: String(rows[0].story_candidate_id), inserted: Boolean(rows[0].inserted) };
  }

  async refreshSourceMetrics(candidateId: string) {
    const rows = await this.sql<Row[]>`UPDATE story_candidates candidate SET
      source_count=(SELECT count(*)::int FROM story_sources source WHERE source.story_candidate_id=candidate.id),
      status=CASE WHEN candidate.status='DISCOVERED' AND candidate.claim_count >= 1 AND EXISTS
        (SELECT 1 FROM story_sources source WHERE source.story_candidate_id=candidate.id) THEN 'PARTIAL' ELSE candidate.status END,
      updated_at=now() WHERE id=${candidateId} RETURNING *`;
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async archiveStats() {
    const [row] = await this.sql<Row[]>`SELECT
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status!='HIDDEN')::int AS archive_candidates,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status='HIDDEN')::int AS hidden_archive_candidates,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status!='HIDDEN' AND country='Malaysia')::int AS malaysia_archive_candidates,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status!='HIDDEN' AND source_count >= 2)::int AS two_plus_sources,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status!='HIDDEN' AND source_count >= 3)::int AS three_plus_sources,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status='DISCOVERED')::int AS discovered,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status='PARTIAL')::int AS partial,
      count(*) FILTER (WHERE metadata->>'archiveDerived'='true' AND status='READY')::int AS ready
      FROM story_candidates`;
    const sources = await this.sql<{ provider: string; count: number }[]>`SELECT provider, count(*)::int AS count FROM story_sources GROUP BY provider ORDER BY provider`;
    const distribution = await this.sql<{ source_count: number; count: number }[]>`SELECT source_count, count(*)::int AS count FROM story_candidates WHERE metadata->>'archiveDerived'='true' AND status!='HIDDEN' GROUP BY source_count ORDER BY source_count`;
    return { archiveCandidates: Number(row.archive_candidates), malaysiaArchiveCandidates: Number(row.malaysia_archive_candidates),
      hiddenArchiveCandidates: Number(row.hidden_archive_candidates),
      twoPlusSources: Number(row.two_plus_sources), threePlusSources: Number(row.three_plus_sources), discovered: Number(row.discovered),
      partial: Number(row.partial), ready: Number(row.ready), providers: Object.fromEntries(sources.map((item) => [item.provider, Number(item.count)])),
      sourceCountDistribution: Object.fromEntries(distribution.map((item) => [String(item.source_count), Number(item.count)])) };
  }

  async listArchiveExamples(limit = 10) {
    const rows = await this.sql<Row[]>`WITH ranked AS (
      SELECT *, row_number() OVER (PARTITION BY story_type ORDER BY source_count DESC, updated_at DESC) AS archive_rank
      FROM story_candidates WHERE metadata->>'archiveDerived'='true' AND country='Malaysia' AND status!='HIDDEN'
        AND length(title) BETWEEN 12 AND 180 AND title !~* '^(page\\s+[0-9]+|advert|classified|contents|.*rifle shooting|.*assizes)'
    ) SELECT * FROM ranked WHERE archive_rank <= 2 ORDER BY archive_rank, source_count DESC, updated_at DESC
      LIMIT ${Math.min(50, Math.max(1, limit))}`;
    return rows.map(fromRow);
  }

  async listArchiveCandidatesForClassification() {
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates WHERE metadata->>'archiveDerived'='true' ORDER BY id`;
    return rows.map(fromRow);
  }

  async listArchiveSourcesForClassification() {
    const rows = await this.sql<Row[]>`SELECT source.* FROM story_sources source JOIN story_candidates candidate ON candidate.id=source.story_candidate_id
      WHERE candidate.metadata->>'archiveDerived'='true' ORDER BY source.story_candidate_id, source.published_at NULLS LAST, source.id`;
    return rows.map(sourceFromRow);
  }

  async updateArchiveClassification(id: string, storyType: string, metadata: Record<string, unknown>) {
    const rows = await this.sql<Row[]>`UPDATE story_candidates SET story_type=${storyType}, metadata=${this.sql.json(JSON.parse(JSON.stringify(metadata)))}, updated_at=now()
      WHERE id=${id} RETURNING *`;
    if (!rows[0]) throw new Error(`Archive candidate not found: ${id}`); return fromRow(rows[0]);
  }

  async updateArchiveSourceMetadata(id: string, metadata: Record<string, unknown>) {
    await this.sql`UPDATE story_sources SET metadata=${this.sql.json(JSON.parse(JSON.stringify(metadata)))} WHERE id=${id}`;
  }

  async findById(id: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates WHERE id=${id} LIMIT 1`;
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async listSourcesForCandidate(candidateId: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM story_sources WHERE story_candidate_id=${candidateId} ORDER BY published_at NULLS LAST, id`;
    return rows.map(sourceFromRow);
  }

  async listResearchCandidates(options: { status?: StoryIndexStatus | "ALL"; limit?: number; category?: string; region?: string; minSources?: number } = {}) {
    const status = options.status ?? "PARTIAL"; const category = options.category || null; const region = options.region || null;
    const minSources = Math.max(1, options.minSources ?? 1); const limit = Math.min(500, Math.max(1, options.limit ?? 25));
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates WHERE metadata->>'archiveDerived'='true'
      AND (${status}='ALL' AND status IN ('PARTIAL', 'READY') OR status=${status})
      AND source_count >= ${minSources} AND (${category}::text IS NULL OR category=${category} OR metadata->'categories' ? ${category})
      AND (${region}::text IS NULL OR region ILIKE ${region ? `%${region}%` : null})
      ORDER BY source_count DESC, CASE metadata->>'storyTypeConfidence' WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
        length(summary) DESC, updated_at DESC LIMIT ${limit}`;
    return rows.map(fromRow);
  }

  async listResearchCandidatesByIds(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.sql<Row[]>`SELECT * FROM story_candidates WHERE id = ANY(${ids}) ORDER BY updated_at DESC`;
    const byId = new Map(rows.map((row) => [String(row.id), fromRow(row)]));
    return ids.map((id) => byId.get(id)).filter((item): item is StoryCandidate => Boolean(item));
  }

  async moveSources(sourceIds: string[], candidateId: string) {
    if (!sourceIds.length) return 0;
    const rows = await this.sql<{ id: string }[]>`UPDATE story_sources SET story_candidate_id=${candidateId} WHERE id = ANY(${sourceIds}) RETURNING id`;
    return rows.length;
  }

  async resetClusterResearch(candidateId: string, metadata: Record<string, unknown>) {
    return this.sql.begin(async (tx) => {
      await tx`DELETE FROM story_claims WHERE story_candidate_id=${candidateId}`;
      await tx`DELETE FROM story_research_packages WHERE story_candidate_id=${candidateId}`;
      const rows = await tx<Row[]>`UPDATE story_candidates candidate SET status='PARTIAL', claim_count=0, research_score=NULL,
        narrative_potential_score=NULL, metadata=${tx.json(JSON.parse(JSON.stringify(metadata)))}, last_researched_at=NULL,
        last_verified_at=NULL, source_count=(SELECT count(*)::int FROM story_sources source WHERE source.story_candidate_id=candidate.id), updated_at=now()
        WHERE id=${candidateId} RETURNING *`;
      if (!rows[0]) throw new Error(`Story candidate not found: ${candidateId}`);
      return fromRow(rows[0]);
    });
  }

  async getResearchPackage(candidateId: string) {
    const rows = await this.sql<{ package: ResearchPackage }[]>`SELECT package FROM story_research_packages WHERE story_candidate_id=${candidateId} LIMIT 1`;
    return rows[0]?.package ?? null;
  }

  async listClaimsForCandidate(candidateId: string) {
    const rows = await this.sql<Row[]>`SELECT * FROM story_claims WHERE story_candidate_id=${candidateId} ORDER BY priority, event_date NULLS LAST, id`;
    return rows.map(claimFromRow);
  }

  async persistResearchPackage(candidate: StoryCandidate, claims: ResearchClaim[], researchPackage: ResearchPackage) {
    return this.sql.begin(async (tx) => {
      await tx`DELETE FROM story_claims WHERE story_candidate_id=${candidate.id}`;
      for (const claim of claims) await tx`INSERT INTO story_claims
        (id, story_candidate_id, claim_text, spoken_text, normalized_claim, claim_type, confidence, source_ids, event_date, people, locations, priority, visual_intent, ocr_quality, created_at, updated_at)
        VALUES (${claim.id}, ${candidate.id}, ${claim.claimText}, ${claim.spokenText}, ${claim.normalizedClaim}, ${claim.claimType}, ${claim.confidence},
          ${tx.json(claim.sourceIds)}, ${claim.eventDate}, ${tx.json(claim.people)}, ${tx.json(claim.locations)}, ${claim.priority}, ${claim.visualIntent}, ${claim.ocrQuality}, now(), now())`;
      await tx`INSERT INTO story_research_packages (story_candidate_id, package, created_at, updated_at)
        VALUES (${candidate.id}, ${tx.json(JSON.parse(JSON.stringify(researchPackage)))}, now(), now())
        ON CONFLICT (story_candidate_id) DO UPDATE SET package=EXCLUDED.package, updated_at=now()`;
      const priorCategories = (Array.isArray(candidate.metadata.categories) ? candidate.metadata.categories.map(String) : [])
        .filter((category) => !["mysteries", "malaysia_mysteries"].includes(category));
      const metadata = { ...candidate.metadata, categories: [...new Set([...priorCategories, "archive",
        ...(researchPackage.readyDecision.status === "READY" ? ["mysteries", "malaysia_mysteries"] : [])])],
        clusterConfidence: researchPackage.clusterConfidence, researchPackageVersion: "4.1-coherent-malay" };
      const rows = await tx<Row[]>`UPDATE story_candidates SET status=${researchPackage.readyDecision.status}, claim_count=${claims.length},
        research_score=${researchPackage.researchScore}, narrative_potential_score=${researchPackage.narrativePotentialScore},
        metadata=${tx.json(JSON.parse(JSON.stringify(metadata)))}, last_researched_at=${researchPackage.lastResearchedAt},
        last_verified_at=${researchPackage.lastVerifiedAt}, updated_at=now() WHERE id=${candidate.id} RETURNING *`;
      return fromRow(rows[0]);
    });
  }
}

export function createStoryStore(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the persistent story index");
  return new StoryStore(postgres(databaseUrl, databaseOptions(databaseUrl)));
}

export function isStoryIndexConfigured() { return Boolean(process.env.DATABASE_URL); }

const globalStore = globalThis as typeof globalThis & { factFrameStoryStore?: StoryStore };
export function getStoryStore() {
  if (!globalStore.factFrameStoryStore) globalStore.factFrameStoryStore = createStoryStore();
  return globalStore.factFrameStoryStore;
}
