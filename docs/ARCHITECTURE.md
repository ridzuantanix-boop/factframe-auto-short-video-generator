# Architecture

FactFrame ialah aplikasi Next.js 16 App Router dengan indeks calon cerita PostgreSQL. Adapter menggunakan `DATABASE_URL`, jadi pangkalan Postgres yang tahan lama dan serasi Vercel boleh digunakan tanpa mengikat domain kepada satu vendor. Deployment production belum menerima konfigurasi DB dalam Phase 2; migration mesti dijalankan sebelum deployment.

| Stage | Pelaksanaan sebenar | Lokasi/runtime |
|---|---|---|
| User | Memilih mode, topik, sudut, tempoh, nada, suara dan watermark | Browser, `Generator.tsx` |
| Discovery/catalog | PostgreSQL index dahulu; Wikipedia/Wikidata dan provider arkib berabstraksi; 10 seed kekal fixture/fallback | `/api/catalog`, `/api/discover`, `story_candidates`, `story_sources` |
| Story/entity selection | Seed dipilih terus; calon live dihidratkan melalui Wikidata/Wikipedia; calon arkib READY dimuat daripada research package tersimpan | Browser + `/api/topic`, `/api/research` |
| Story angle | Dynamic generic event clusters dengan supporting fact IDs | Browser, `explainerEngine.ts` |
| Research | Entity JSON/Wikipedia untuk entity live; deterministic source-to-claim enrichment dan research package kekal untuk calon arkib | Server + `story_claims`, `story_research_packages` |
| Current-aware check | Flag heuristik untuk person/organisation/place/event dan `lastVerifiedAt` tarikh request | Server; tiada semakan provider berita khusus |
| Source ranking | Seed menyimpan reliability label; data live dianggap `REFERENCE` | Build-time/manual + browser |
| Claim extraction/classification | Seed manual; explainer live menukar fakta kepada `VERIFIED`; arkib mengekstrak `REPORTED`, `UNRESOLVED`, atau `FOLKLORE` dengan source IDs dan penalti OCR | Server batch + browser |
| Story arc | Algoritma deterministik atau Gemini JSON berstruktur | Browser; Gemini melalui server |
| Retention narration | Hook/open-loop/escalation/twist/payoff dan quality gate | Browser; Gemini opsyenal server |
| Visual planner | Satu intent/query set bagi setiap segmen | Server `/api/media` |
| Historical archive discovery | NLB OneSearch NewspaperSG, Records & Papers, audiovisual; LOC connector dengan failure reporting | Batch server-side + PostgreSQL |
| Archive classification | Explicit territory text, kemudian date + location, kemudian safe historical fallback; scored headline/snippet evidence dengan confidence | Batch server-side + candidate/source JSONB metadata |
| Image/video search | Wikimedia Commons sahaja; source arkib belum menjadi media visual automatik | Server + external API |
| Gemini TTS | Gemini API server-side, dua cubaan; fallback MMS-VITS dalam worker | Server + browser worker |
| Renderer | Canvas 720×1280, media muted, audio graph dan MediaRecorder | Browser |
| Captions/watermark | Dilukis ke Canvas pada setiap frame | Browser |
| MP4 | MP4 terus jika disokong; selain itu WebM ditranskod melalui FFmpeg/WASM | Browser + jsDelivr runtime asset |

```text
USER
  -> POSTGRES STORY INDEX
  -> ARCHIVE DOCUMENTS -> EVENT EXTRACTION -> CROSS-ARTICLE CLUSTERS
  -> STORY SOURCES -> CLAIM EXTRACTION -> DEDUPE -> RESEARCH PACKAGE
  -> INDEX-FIRST DISCOVERY / LIVE FALLBACK
  -> STORY / ENTITY SELECTION
  -> STORY ANGLE
  -> PERSISTED RESEARCH (FOR READY ARCHIVE STORIES)
  -> CURRENT-AWARE FLAG
  -> SOURCE METADATA
  -> CLAIM EXTRACTION / CLASSIFICATION
  -> STORY ARC / RETENTION NARRATION
  -> VISUAL PLANNER
  -> WIKIMEDIA IMAGE / VIDEO SEARCH
  -> GEMINI TTS OR LOCAL FALLBACK
  -> CANVAS + MEDIARECORDER
  -> CAPTIONS + WATERMARK
  -> MP4
```

Major trust boundaries: browser input enters Next.js routes; Gemini key stays server-side; public sources and media are untrusted external dependencies; generated video never needs to be uploaded to the server.

## Persistent story index

Migration `migrations/001_story_index.sql` creates `story_candidates`; `migrations/002_archive_sources.sql` adds durable `story_sources`; `migrations/003_story_research.sql` adds normalized `story_claims` and versioned JSONB `story_research_packages`. Constraints cover four statuses, source/claim foreign keys, JSONB metadata, browse/search indexes, Q-ID, canonical URL and normalized title. Upsert takes a PostgreSQL advisory lock per identity, then merges aliases, categories, search terms, source hints and `originProviders` without downgrading qualification.

`DISCOVERED` rows keep research/visual/narrative scores null. Archive ingestion promotes to `PARTIAL` only after one usable persisted source and one extracted event/claim. Enrichment alone may promote to `READY`: at least three clear claims, two sources (or one unusually rich source), 100% claim linkage, zero unsupported claims, grounded hook/payoff, narrative score ≥0.55, about 20 seconds of unique evidence, coherent source dates, and no pending current verification. Visual readiness is deliberately separate. `HIDDEN` is sticky and reserved for invalid/noisy/manual suppression.

Archive generation is index-first: a UUID selection calls `/api/research`, which returns a `StoryRecord` built from the persisted READY package. The mystery engine carries each claim's `sourceIds` through narration. Gemini/media routes resolve the same package and do not reconstruct archive stories from a title or snippet.

Discovery provenance and entity classification are separate. `originQuery`, `originProvider`, `metadata.categories` and `discoveredViaCategory` explain how a candidate was found; they never prove geography or story type. Geography classification prioritizes Wikidata P17/P27/P495, location hierarchy, coordinates, historical relationships, then explicit entity text. Evidence and `HIGH|MEDIUM|LOW|UNKNOWN` confidence are stored in metadata. `mysteryPotential` is preliminary and does not imply `storyType=MYSTERY` or readiness.

Archive classification follows a separate evidence path. Historical territory wording has priority, followed by publication date plus region; missing dates use `PRE_MALAYSIA` rather than an unsupported modern label. Story types use weighted headline and snippet signals plus compatible subject/action context. The reclassifier updates both `story_candidates` and every linked `story_sources` row and is idempotently audited against the original Phase 3 rules.

The authenticated `/api/index` endpoint provides bounded scheduled ingestion, but no Vercel Cron declaration is enabled until production `DATABASE_URL`, migration, and `CRON_SECRET` are safely configured.
