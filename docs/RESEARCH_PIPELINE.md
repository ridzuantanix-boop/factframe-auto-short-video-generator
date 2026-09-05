# Archive research pipeline

Phase 4 converts an archive-derived candidate into a durable, source-backed generation input:

```text
PARTIAL candidate
  -> linked story_sources
  -> deterministic atomic claim extraction
  -> OCR quality/confidence
  -> near-duplicate merge with all source IDs
  -> timeline + people + normalized locations
  -> grounded hooks, turning points, questions, payoff
  -> calculated research/narrative metrics
  -> strict READY or retained PARTIAL
  -> persisted ResearchPackage
  -> narration with source IDs
```

## Persistence

`migrations/003_story_research.sql` creates `story_claims` and `story_research_packages`. A claim stores normalized text, type, confidence, source IDs, publication/event date, people, locations, narrative priority, visual intent, and OCR quality. The package stores the complete research input and calculated decision. Persistence is transactional and rerunning enrichment replaces claims for that candidate, so the command is idempotent.

## Extraction and trust

The extractor uses generic event language and never contains entity names, organisations, countries, or fixed years. Rich snippet sentences are preferred; a distinct factual headline can be retained but duplicate headline/body statements are merged. Archive newspaper claims are `REPORTED`, disappearance/unexplained claims are `UNRESOLVED`, and folklore is `FOLKLORE`. Confidence rises only when independent providers/publishers support a merged claim. Publication dates remain labelled as publication dates.

OCR quality is calculated from readable characters, broken tokens, mixed letter/digit tokens, embedded OCR symbols, and mojibake. Severely degraded chunks are dropped. LOW claims remain stored for inspection but do not satisfy the minimum of three useful READY claims.

## READY gate

All conditions must pass:

- at least three clear factual claims;
- at least two sources, or one clear source with at least four claims;
- source coverage exactly 1 and zero unsupported claims;
- grounded hook and payoff;
- narrative potential at least 0.55;
- about 20 seconds of unique evidence without padding;
- temporally coherent source set;
- no outstanding current-aware verification.

Visual availability is not part of Phase 4 readiness. A failed gate persists the package and explanatory reasons while retaining `PARTIAL`.

## Commands and audit

```bash
npm run db:migrate
npm run enrich:stories -- --status=PARTIAL --limit=25 --category=archive --min-sources=1 --concurrency=2 --delay=100
npm run audit:research
```

The 2026-09-05 controlled `--status=ALL --limit=100` audit produced 242 raw claims, 166 unique claims, 76 merges, 2 READY, 98 PARTIAL, average coverage 0.85, zero unsupported claims, and no processing failures. Ten complete packages spanning the seven required story types are exported in `audit/research-examples.json`; summary metrics are in `audit/research-audit.json`.

## Generation integration

`/api/research?id=<candidate UUID>` returns only a persisted READY package converted to `StoryRecord`. Search/discovery expose archive candidates only after READY promotion. Generator, Gemini script, and media routes resolve that same record. The deterministic mystery engine uses its claims/timeline/hooks/payoff and preserves `sourceIds` on every factual segment. Existing ten manual seeds keep their current structures.

Gemini remains optional and is never called by the batch. When configured for a selected story, it receives the grounded package constraints; deterministic generation remains the fallback.
