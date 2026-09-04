import postgres, { type Sql, type TransactionSql } from "postgres";
import type { StoryCandidate, StoryCandidateInput, StoryIndexStatus } from "../types";
import { dedupeKey, mergeCandidates } from "./dedupe.ts";
import { STORY_INDEX_SCHEMA } from "./schema.ts";

type Row = Record<string, unknown>;
export type CatalogQuery = { category?: string; country?: string; status?: StoryIndexStatus; search?: string; page?: number; limit?: number; sort?: "newest" | "oldest" | "title" | "research" };
export type CatalogStats = { total: number; discovered: number; partial: number; ready: number; hidden: number; malaysiaMalaya: number; confirmedMalaysia: number; probableMalaysia: number; unknownGeography: number; global: number; categories: Record<string, number> };

function date(value: unknown) { return value instanceof Date ? value.toISOString() : String(value); }
function nullableDate(value: unknown) { return value ? date(value) : null; }
function strings(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }

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

  async findByIdentity(candidate: Pick<StoryCandidateInput, "canonicalEntityId" | "canonicalUrl" | "normalizedTitle">, sql: Sql | TransactionSql = this.sql) {
    const rows = await sql<Row[]>`
      SELECT * FROM story_candidates
      WHERE (${candidate.canonicalEntityId}::text IS NOT NULL AND canonical_entity_id = ${candidate.canonicalEntityId})
         OR (${candidate.canonicalUrl}::text IS NOT NULL AND canonical_url = ${candidate.canonicalUrl})
         OR normalized_title = ${candidate.normalizedTitle}
      ORDER BY CASE WHEN canonical_entity_id = ${candidate.canonicalEntityId} THEN 0 WHEN canonical_url = ${candidate.canonicalUrl} THEN 1 ELSE 2 END
      LIMIT 1`;
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
