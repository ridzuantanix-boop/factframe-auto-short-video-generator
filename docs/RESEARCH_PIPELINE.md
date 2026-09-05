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

Phase 5 keeps that factual path intact. Phase 5.1 adds typed entity validation (`PERSON`, `ORGANISATION`, `PLACE`, `DATE`, `NUMBER`, `LEGAL_TERM`, `VESSEL`, `OTHER`) and separates hard factual failures from soft compression warnings. Named people, essential numbers, event meaning and epistemic status remain hard constraints; a minor place, abbreviated organisation or nonessential publication date may be omitted when the underlying event is unchanged. Validation compares subject/action/object/result signals instead of treating capitalization alone as identity evidence.

For an explicit, bounded enrichment run, the pipeline may deepen metadata from linked public pages and search adjacent NLB reports using person/place/event terms and a preferred -7/+30 day window. A report is linked only when it has strong specific-entity continuity, event continuity and at least 0.2 incremental information gain. Gemini can rewrite newly extracted non-LOW claims into natural Malaysian Malay but cannot discover facts or act as a source. Multiple claims may share one structured request while each output remains independently validated by claim ID. A correctable hard failure receives at most one reason-specific retry and otherwise remains blank/deterministic.

## Persistence

`migrations/003_story_research.sql` creates `story_claims` and `story_research_packages`; migration `004_narration_cluster_integrity.sql` adds durable `spoken_text`, and migration `005_ai_enrichment.sql` adds rewrite provenance to existing databases. A claim stores both untouched factual `claimText` and TTS-ready `spokenText`, plus normalized text, type, confidence, source IDs, publication/event date, people, locations, narrative priority, visual intent, OCR quality, rewrite method/model, validation version/result, and validation time.

## Extraction and trust

The extractor uses generic event language and never contains entity names, organisations, countries, or fixed years. Rich snippet sentences are preferred; a distinct factual headline can be retained but duplicate headline/body statements are merged. Archive newspaper claims are `REPORTED`, disappearance/unexplained claims are `UNRESOLVED`, and folklore is `FOLKLORE`. Confidence rises only when independent providers/publishers support a merged claim. Publication dates remain labelled as publication dates.

OCR quality is calculated from readable characters, broken tokens, mixed letter/digit tokens, embedded OCR symbols, and mojibake. Severely degraded chunks are dropped. LOW claims remain stored for inspection but do not satisfy the minimum of three useful READY claims.

## READY gate

All conditions must pass:

- at least two distinct clear factual claims, or one unusually rich claim containing a complete subject, event, context and outcome;
- at least one clear persisted source; a single archival source is allowed for a complete micro-story while retaining its reported/medium-confidence language;
- source coverage exactly 1 and zero unsupported claims;
- grounded hook and payoff;
- story completeness at least 0.85;
- enough grounded spoken material for the package's calculated supported duration, with an absolute floor of about eight seconds/20 words;
- HIGH or validated MEDIUM date/entity cluster confidence;
- complete Malaysian Malay narration with no English headline/OCR leakage and a passing spoken-naturalness score;
- no outstanding current-aware verification.

Validated claim-level Gemini text may be assembled by the deterministic story path and does not require another story-level Gemini call. Gemini availability never changes readiness by itself. Modern unresolved/current cases remain blocked until current-aware verification exists.

Phase 5.2 calculates `supportedDurationSeconds`, `supportedDurationBand`, `estimatedNarrationSeconds`, `storyCompletenessScore`, and an honest ending type from distinct usable spoken claims. MICRO/SHORT stories use a direct HOOK → DETAIL/KNOWN OUTCOME structure without a forced question. A longer user request is capped to the evidence-supported duration; it never duplicates claims to fill time.

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
npm run audit:validator
npm run audit:readiness
npm run deepen:evidence -- --candidate-ids-file=audit/ai-enrichment-report.json --limit=100
```

`enrich:ai` defaults to 20 records, caps a run at 100, caps concurrency at two, caches validated output, and falls back without breaking deterministic research when Gemini is absent or rate-limited. Optional filters include `--region`, `--category`, and `--candidate-ids-file`. The AI audit exports aggregate cost/quality metrics plus 20 traceable examples in `audit/ai-enrichment-examples.json`.

The controlled Phase 5 cohort contained 100 PARTIAL candidates across disappearance, crime, mysterious death, disaster, historical incident, paranormal report, and folklore. Among 108 eligible claims, narratable coverage rose from 2.8% deterministic to 47.2% after validated Gemini output. The final cached pass recorded 94 requests, 48 validated Gemini claims in the cohort, 50 rejected rewrites, 42 retries, zero unsupported claims, and zero English/OCR leakage. READY remained 0 → 0 because the thin archive snippets still failed evidence-depth/duration gates; no gate was relaxed.

Phase 5.1 revalidated those exact 50 rejected outputs before generating anything. Manual inspection classified 36 as safe false rejects and retained 14 real hard failures, producing 100% measured hard-fail precision and zero false rejects among the retained hard failures. The recovered cache raised valid spoken coverage on the same cohort from 47.2% to 79.1%; useful claims averaged 1.08 → 1.10 and READY stayed 0 → 0. Follow-up discovery ran 190 NLB searches and inspected 596 results. None passed the tightened event/entity continuity rule, so no source was linked; the two additional useful claims came from initializing previously missing deterministic packages, not from follow-up sources. The new-source-only Gemini pass therefore made zero requests and consumed zero tokens. Full results are preserved in `audit/validator-audit.json`, `audit/evidence-deepening-report.json`, and `audit/ai-enrichment-audit.json`.

The Phase 5.2 recalculation used the same 100 IDs and made no Gemini calls. One complete 10-second MICRO story became READY; the other 99 remained PARTIAL. It has two distinct useful claims, one coherent archival source, 100% source coverage, zero unsupported claims, and passed the only available newly-READY manual review. No SHORT/STANDARD/LONG story passed the unchanged factual and language gates. Audit details are in `audit/readiness-report.json`, `audit/readiness-ready-stories.json`, and `audit/readiness-manual-review.json`.

The Phase 4.1 recheck starts from the same 100 IDs. It found 16 suspicious candidates, split them into 35 additional event candidates, and reassigned 50 source links without deleting source records. The resulting 135 coherent candidates contain 175 claims; strict narration gates leave one READY and 134 PARTIAL. Details are in `audit/cluster-repair-report.json`, `audit/narration-audit.json`, and ten before/after samples in `audit/narration-examples.json`.

## Generation integration

`/api/research?id=<candidate UUID>` returns only a persisted READY package converted to `StoryRecord`. Search/discovery expose archive candidates only after READY promotion. Generator, Gemini script, and media routes resolve that same record. The deterministic mystery engine uses its claims/timeline/hooks/payoff and preserves `sourceIds` on every factual segment. Existing ten manual seeds keep their current structures.

Validated story-level AI segments are persisted in the research package and consumed by the same video script path, retaining their source IDs. They use HOOK → CONTEXT → DEVELOPMENT → TURN/PAYOFF and do not force a question/open loop. Gemini remains optional; deterministic generation remains the fallback.
