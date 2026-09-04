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

Duration handling remains 30/60/90 seconds. Mystery 60/90-second deterministic expansion still uses evidence bridges; semantic filler detection beyond repetition scoring is not part of Phase 1.
