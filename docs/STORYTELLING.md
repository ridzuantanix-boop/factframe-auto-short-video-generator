# Storytelling and quality scoring

## Explainer flow

The explainer ranks sourced facts with generic event signals, preserves the selected angle’s supporting-fact order, and uses chronological context for the remaining progression. The strongest supported event becomes the hook. Curiosity text changes by event class: challenge, achievement, current/leadership, or general milestone. The open loop is a question derived from the same class and therefore may remain unsourced. The payoff uses a separate sourced current/legacy/death/achievement/comeback fact where available.

There are no person names, organisations, countries or fixed years in ranking logic. The old fixed journey hook and fixed turning-point question were removed.

## Calculated quality

`qualityScoring.ts` provides:

- `calculateSourceCoverage`: validly sourced factual segments divided by factual segments;
- `calculateUnsupportedClaims`: factual segments with no source or an unknown source ID;
- `calculateRepetitionScore`: 0–1 score using normalized token containment plus matching-date overlap;
- `calculateStorytellingScore`: 0–14 score from sourced/concise hook, question open loop, role progression, factual depth and coverage, turning-point language/role, distinct payoff, spoken sentence length variation and low repetition.

An `OPEN_LOOP` is exempt from source coverage only when it is explicitly a question. Structure alone cannot earn the full score. Repeated paraphrases lower repetition and can prevent the ≥0.7 quality gate.

## Mystery flow

Seed mystery claims still map priority to hook/context/escalation/twist/theory/counterpoint/payoff, with labels distinguishing verified, reported, folklore, theory, disputed, explained-later and unresolved material. Gemini output remains constrained by JSON schema and known source IDs. Both deterministic and Gemini mystery scripts now use the same calculated quality functions rather than fixed score/coverage values.

Archive READY stories use the same engine through a persisted `ResearchPackage`. Archive English/OCR remains in `claimText`; deterministic, meaning-preserving Malaysian Malay is stored separately in `spokenText` with the same `claimType` and `sourceIds`. Only speakable claims enter the script. The strongest sourced sentence is used directly as the hook, the open loop is case-specific, and the payoff states the last known sourced condition without raw-source dumping or word-count padding.

Script quality now exposes separate `structureScore`, `sourceQualityScore`, and `narrationQualityScore`. A structurally complete script cannot compensate for English leakage, OCR debris, fragments, repetition, or missing sources. READY narration must pass all component thresholds.

Duration handling remains 30/60/90 seconds for the existing seed flow. The archive path no longer repeats evidence bridges merely to reach 60/90 seconds: insufficient unique material remains PARTIAL instead of being padded.

## Validated AI narration

Phase 5 first rewrites claims independently and validates each rewrite before any story-level request. The story writer receives only approved `spokenText`, claim IDs, source IDs, dates, entities, story type, and historical context. Its strict four-segment result is rejected if it changes the source union, references an unknown claim, adds a number, weakens REPORTED/FOLKLORE/UNRESOLVED status, or fails the Malaysian Malay gate.

The video script builder consumes a cached, validated AI narration when present; otherwise it uses the deterministic claim path. AI narration is not required to contain an open-loop question. Source coverage, unsupported-claim, repetition, structure, narration, and overall storytelling scores are still calculated on the actual final segments.
