# Archive research and controlled AI enrichment

Phase 4 converts an archive-derived candidate into a durable, source-backed generation input:

```text
PARTIAL candidate
  -> linked story_sources
  -> deterministic atomic claim extraction
  -> OCR quality/confidence
  -> near-duplicate merge with all source IDs
  -> date/entity cluster validation and repair
  -> deterministic claimText -> Malaysian Malay spokenText
  -> timeline + people + normalized locations
  -> grounded hooks, turning points, questions, payoff
  -> calculated research/narrative metrics
  -> strict READY or retained PARTIAL
  -> persisted ResearchPackage
  -> narration with source IDs
```

Phase 5 keeps that factual path intact. For an explicit, bounded enrichment run, it may deepen metadata from the candidate's already-linked public pages, then sends only existing non-LOW claims to Gemini. Gemini can rewrite one claim into natural Malaysian Malay but cannot act as a source. Every response is checked deterministically for claim ID, immutable source IDs/type, names, numbers, dates, locations, negation, event meaning, and epistemic language. A failed rewrite receives at most one corrective retry and otherwise remains blank/deterministic.

## Persistence

`migrations/003_story_research.sql` creates `story_claims` and `story_research_packages`; migration `004_narration_cluster_integrity.sql` adds durable `spoken_text`, and migration `005_ai_enrichment.sql` adds rewrite provenance to existing databases. A claim stores both untouched factual `claimText` and TTS-ready `spokenText`, plus normalized text, type, confidence, source IDs, publication/event date, people, locations, narrative priority, visual intent, OCR quality, rewrite method/model, validation version/result, and validation time.

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
- HIGH or validated MEDIUM date/entity cluster confidence;
- complete Malaysian Malay narration with no English headline/OCR leakage and a passing spoken-naturalness score;
- no outstanding current-aware verification.

If Gemini rewrote any claim, READY additionally requires a validated four-part AI narration built only from approved spoken claims. Gemini availability never changes readiness by itself. Modern unresolved/current cases remain blocked until current-aware verification exists.

Visual availability is not part of Phase 4 readiness. A failed gate persists the package and explanatory reasons while retaining `PARTIAL`.

## Commands and audit

```bash
npm run db:migrate
npm run repair:clusters
npm run enrich:stories -- --status=PARTIAL --limit=25 --category=archive --min-sources=1 --concurrency=2 --delay=100
npm run audit:research
npm run audit:narration
npm run enrich:ai -- --status=PARTIAL --limit=20 --min-sources=1 --min-claims=1
npm run audit:ai-enrichment
```

`enrich:ai` defaults to 20 records, caps a run at 100, caps concurrency at two, caches validated output, and falls back without breaking deterministic research when Gemini is absent or rate-limited. Optional filters include `--region`, `--category`, and `--candidate-ids-file`. The AI audit exports aggregate cost/quality metrics plus 20 traceable examples in `audit/ai-enrichment-examples.json`.

The controlled Phase 5 cohort contained 100 PARTIAL candidates across disappearance, crime, mysterious death, disaster, historical incident, paranormal report, and folklore. Among 108 eligible claims, narratable coverage rose from 2.8% deterministic to 47.2% after validated Gemini output. The final cached pass recorded 94 requests, 48 validated Gemini claims in the cohort, 50 rejected rewrites, 42 retries, zero unsupported claims, and zero English/OCR leakage. READY remained 0 → 0 because the thin archive snippets still failed evidence-depth/duration gates; no gate was relaxed.

The Phase 4.1 recheck starts from the same 100 IDs. It found 16 suspicious candidates, split them into 35 additional event candidates, and reassigned 50 source links without deleting source records. The resulting 135 coherent candidates contain 175 claims; strict narration gates leave one READY and 134 PARTIAL. Details are in `audit/cluster-repair-report.json`, `audit/narration-audit.json`, and ten before/after samples in `audit/narration-examples.json`.

## Generation integration

`/api/research?id=<candidate UUID>` returns only a persisted READY package converted to `StoryRecord`. Search/discovery expose archive candidates only after READY promotion. Generator, Gemini script, and media routes resolve that same record. The deterministic mystery engine uses its claims/timeline/hooks/payoff and preserves `sourceIds` on every factual segment. Existing ten manual seeds keep their current structures.

Validated story-level AI segments are persisted in the research package and consumed by the same video script path, retaining their source IDs. They use HOOK → CONTEXT → DEVELOPMENT → TURN/PAYOFF and do not force a question/open loop. Gemini remains optional; deterministic generation remains the fallback.
