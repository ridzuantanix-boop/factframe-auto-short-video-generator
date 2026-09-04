# Archive discovery

## Supported providers

`DiscoveryProvider` separates provider search, normalization and optional detail fetch. Phase 3 implements NLB OneSearch connectors for NewspaperSG, Records & Papers, and audiovisual/oral-history metadata. These public JSON searches require no login. FactFrame stores metadata and source links only; it never bypasses NewspaperSG login, on-site, copyright or paywall controls.

The Library of Congress JSON connector targets the official `loc.gov/search/?fo=json` API. During the controlled 2026-09-04 run, every LOC request returned HTTP 403 from Cloudflare, so no LOC result was counted or stored. The failure is explicit in the archive audit.

## Pipeline

```text
PROVIDER RESULT
  -> NORMALIZED DOCUMENT
  -> DATE / LOCATION / PEOPLE / EVENT-VERB EXTRACTION
  -> INCIDENT + CLAIM STATUS
  -> CONSERVATIVE CROSS-ARTICLE CLUSTER
  -> STORY CANDIDATE
  -> DURABLE STORY_SOURCES
```

One article is not blindly converted into one story. Advertisements, mastheads, untitled/page-only records, documents without Malaysia/Malaya evidence, and documents without an incident signal are rejected. Multiple reports merge only with strong headline overlap or compatible incident type, location, week and recurring person. Ambiguous cases remain separate.

Historical spellings such as Johore, Trengganu, Negri Sembilan, Kwala Lumpur, Malacca and North Borneo are retained in source metadata and normalized for display. `historicalContext` is one of `MALAYA`, `STRAITS_SETTLEMENTS`, `NORTH_BORNEO`, `SARAWAK`, or `MODERN_MALAYSIA`.

Archive query text remains provenance. Geography comes from the source title/snippet/location metadata. Paranormal and extraordinary statements are stored as `REPORTED`, `FOLKLORE`, `UNRESOLVED`, `DISPUTED`, `THEORY` or another explicit claim status; a newspaper report proves that a claim was reported, not that it was true.

## Qualification and cost

A candidate becomes `PARTIAL` after at least one persisted usable source and one deterministic event/claim. Archive ingestion never marks a candidate `READY`. READY requires two or more linked sources, at least five factual claims, source coverage of at least 0.8 and enough non-repetitive material for the requested short. Visual readiness remains separate.

No Gemini calls occur during archive indexing. Requests use timeouts, two retries, bounded concurrency, delay, page/limit caps and provider-specific failure isolation.

```bash
npm run index:archives -- --provider=newspapersg --region=Johore --query-group=mysteries --pages=1 --limit=15 --delay=250
npm run audit:archives
```

Supported provider arguments are `newspapersg`, `nlb_records`, `nlb_audiovisual`, and `library_of_congress`. Query groups are `mysteries`, `incidents`, and `historical`.
