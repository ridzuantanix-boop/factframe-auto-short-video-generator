# Discovery and persistent catalog

## Current truth

FactFrame now follows `DISCOVER -> NORMALIZE -> DEDUPE -> CLASSIFY -> UPSERT`. PostgreSQL is the production-compatible persistence layer; browser localStorage, process memory, and ephemeral SQLite are not used. The 10 manual mystery records remain regression fixtures and guaranteed fallback examples, not the production catalog.

The controlled Phase 2.1 reclassification snapshot on 2026-09-04 contains **987 genuine provider results**. The old query-contaminated Malaysia count was 630. Entity-evidence reclassification corrected it to **542 Malaysia/Malaya**: 431 confirmed (`HIGH`/`MEDIUM`) and 111 probable text-only (`LOW`). Another 225 are evidenced global and 220 remain `UNKNOWN`; unknown is no longer forced into Global. Historical Malaya entities are included only when the entity graph or explicit entity text supports that relationship, while a modern non-Malaysia country takes precedence.

The controlled Phase 3 archive run inspected 2,191 raw results and normalized 2,150 documents. Deterministic extraction produced 634 event records and 519 conservative clusters. After hiding 12 deterministic sport/low-information false positives, the durable local catalog contains 503 active archive-connected Malaysia/Malaya candidates, of which 502 are active additions relative to the 987-row Phase 2.1 baseline and one enriched an existing candidate. There are 76 candidates with at least two sources and 13 with at least three; the 20-candidate three-source target was not reached and is not padded.

All 14 configured categories have persisted rows in the validation snapshot: interesting, people, history, malaysia, world, business, science, entertainment, sports, places, current, events, mysteries, and malaysia_mysteries. Upstream rate limits reduced some categories, but the index-first/live-fallback smoke test grew `mysteries` to 61 primary-category rows. `malaysia_mysteries` has 53, including the provider-backed Highland Towers collapse entity.

## Schema and dedupe

`story_candidates` stores canonical entity/URL, normalized title, slug, summary, geography, category/type/status, actual source/claim counts, nullable evaluated scores, JSON source/search/alias/metadata fields, timestamps, and first origin provider/query. `metadata.originProviders` retains every contributing provider. `story_sources` stores provider, type, title, publisher, URL, publication/access dates, snippet, metadata and reliability level, with unique provider URL. Categories discovered by later queries are retained even when the primary category remains stable.

`originQuery`, `originProvider`, `metadata.categories` and `discoveredViaCategory` are provenance only. Country, region and story type are derived from entity evidence, never query/category wording. Metadata stores `geographyEvidence`, `geographyConfidence`, `storyTypeEvidence`, `mysteryPotential` and `classificationVersion`. A later live rediscovery cannot overwrite an entity-evidence classification with text fallback.

Q-ID is the preferred identity. Canonical URL is second and normalized title third. Upsert merges alternate titles such as an MH370 alias into the same Q-ID record. It never manufactures semantic clones or filler rows.

## Ingestion and browsing

Run migration and ingestion with:

```bash
npm run db:migrate
npm run index:stories -- --pages=1 --limit=15 --concurrency=2 --delay=350
npm run reclassify:stories -- --delay=300
npm run index:archives -- --pages=1 --limit=15 --delay=250
npm run audit:archives
```

Archive flags are `--provider`, `--region`, `--query-group`, `--pages`, `--limit`, `--delay` and optional `--concurrency`. Provider results are normalized, deterministically inspected for dates/places/people/event verbs, then conservatively clustered by date proximity, normalized location/name and headline overlap. Query words are provenance only. No Gemini call occurs during mass discovery.

`GET /api/catalog` supports `category`, `country`, `status`, `page` (1-based), `limit` (max 100), `search`, and `sort=newest|oldest|title|research`. It returns `items`, `total`, `page`, and `hasMore`. Hidden rows are excluded unless `status=HIDDEN` is explicit.

`/api/discover` reads this index first and falls back to live provider search when a category is empty or DB is unavailable. Valid `/api/search` results are saved after the response. `/api/topic` updates source/claim counts, research score, timestamps, and status after real hydration.

## Auditing and scheduling

`npm run audit:project`, `npm run audit:discovery`, `npm run audit:classification`, `npm run audit:archives`, and `npm run export:catalog` read actual database/evidence counts when `DATABASE_URL` is set. Provider failures are counted per provider and do not abort partial success. `/api/index` remains the Wikipedia/Wikidata scheduled endpoint; archive scheduling is intentionally not activated until production DB migration and secrets are confirmed.
