# Evidence-aware visual pipeline

```text
READY research package
  -> duration-capped narration with claimIds/sourceIds
  -> entity/place/event query generation
  -> Wikidata P18 + Commons + OpenStreetMap searches
  -> license, dimensions, watermark/logo and duplicate filters
  -> relevance + representation classification
  -> per-segment selection
  -> honest map/citation/fact fallback
  -> persisted assets and duration-specific visual plan
```

## Selection and truthfulness

Priority is exact event, exact entity, exact place, historical context, generic context, then programmatic fallback. A contextual Nuri helicopter image is labelled contextual and may not be captioned as the crashed aircraft. An archive headline is an evidence reference, not automatic permission to reproduce its page image.

Reusable assets require explicit Public Domain, CC0, CC BY, CC BY-SA, or the applicable OpenStreetMap ODbL attribution. Restricted news/archive records are stored as `RESTRICTED_REFERENCE`; the selected output becomes a clearly programmatic citation card unless reuse authorization is available.

## Maps and fallback

OpenStreetMap/Nominatim results persist latitude, longitude, region label and bounding box. The renderer receives a real marker instruction and OSM attribution. FactFrame cards may show date, place, a short narration fragment and source title, and their metadata explicitly sets `artifactImpersonation: false`.

## Persistence and audit

`story_visual_assets` deduplicates provider IDs, canonical URLs and content hashes. `story_visual_plans` caches a plan per story and supported duration. Run `npm run audit:visuals` with `DATABASE_URL` to plan every current READY story plus the strongest PARTIAL packages, up to 20, and write `audit/visual-plans-20.json`.

Visual READY is independent from factual READY. A fallback-covered story can remain visual READY while its `realAssetCoverage` transparently reveals that cards dominate the plan.
