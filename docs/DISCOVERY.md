# Discovery and persistent catalog

## Current truth

FactFrame now follows `DISCOVER -> NORMALIZE -> DEDUPE -> CLASSIFY -> UPSERT`. PostgreSQL is the production-compatible persistence layer; browser localStorage, process memory, and ephemeral SQLite are not used. The 10 manual mystery records remain regression fixtures and guaranteed fallback examples, not the production catalog.

The controlled Phase 2.1 reclassification snapshot on 2026-09-04 contains **987 genuine provider results**. The old query-contaminated Malaysia count was 630. Entity-evidence reclassification corrected it to **542 Malaysia/Malaya**: 431 confirmed (`HIGH`/`MEDIUM`) and 111 probable text-only (`LOW`). Another 225 are evidenced global and 220 remain `UNKNOWN`; unknown is no longer forced into Global. Historical Malaya entities are included only when the entity graph or explicit entity text supports that relationship, while a modern non-Malaysia country takes precedence.

All 14 configured categories have persisted rows in the validation snapshot: interesting, people, history, malaysia, world, business, science, entertainment, sports, places, current, events, mysteries, and malaysia_mysteries. Upstream rate limits reduced some categories, but the index-first/live-fallback smoke test grew `mysteries` to 61 primary-category rows. `malaysia_mysteries` has 53, including the provider-backed Highland Towers collapse entity.

## Schema and dedupe

`story_candidates` stores canonical entity/URL, normalized title, slug, summary, geography, category/type/status, actual source/claim counts, nullable evaluated scores, JSON source/search/alias/metadata fields, timestamps, and origin provider/query. Unique constraints cover Wikidata Q-ID, canonical URL, and normalized title. Categories discovered by later queries are retained in JSON metadata even when the primary category remains stable.

`originQuery`, `originProvider`, `metadata.categories` and `discoveredViaCategory` are provenance only. Country, region and story type are derived from entity evidence, never query/category wording. Metadata stores `geographyEvidence`, `geographyConfidence`, `storyTypeEvidence`, `mysteryPotential` and `classificationVersion`. A later live rediscovery cannot overwrite an entity-evidence classification with text fallback.

Q-ID is the preferred identity. Canonical URL is second and normalized title third. Upsert merges alternate titles such as an MH370 alias into the same Q-ID record. It never manufactures semantic clones or filler rows.

## Ingestion and browsing

Run migration and ingestion with:

```bash
npm run db:migrate
npm run index:stories -- --pages=1 --limit=15 --concurrency=2 --delay=350
npm run reclassify:stories -- --delay=300
```

Optional flags are `--category`, `--pages`, `--limit`, `--concurrency`, and `--delay`. Wikipedia article search is primary; the existing Wikidata entity search is the fallback. Pacing and bounded concurrency reduce upstream load. No Gemini call occurs during mass discovery.

`GET /api/catalog` supports `category`, `country`, `status`, `page` (1-based), `limit` (max 100), `search`, and `sort=newest|oldest|title|research`. It returns `items`, `total`, `page`, and `hasMore`. Hidden rows are excluded unless `status=HIDDEN` is explicit.

`/api/discover` reads this index first and falls back to live provider search when a category is empty or DB is unavailable. Valid `/api/search` results are saved after the response. `/api/topic` updates source/claim counts, research score, timestamps, and status after real hydration.

## Auditing and scheduling

`npm run audit:project`, `npm run audit:discovery`, `npm run audit:classification`, and `npm run export:catalog` read actual database/evidence counts when `DATABASE_URL` is set; an unconfigured database is reported as null, never as “1,000+”. The corrected 50-record confirmed-Malaysia sample measured 100% precision; the same deterministic sample method measured the pre-fix pool at 82.22%. `/api/index` is callable with `Authorization: Bearer $CRON_SECRET` and processes one bounded category. A production cron is intentionally not activated until production DB migration is confirmed.
