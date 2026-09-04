# Story angles

Phase 1 replaces entity-type templates with evidence-driven angle research in `src/lib/story/angleResearch.ts` and `genericEvents.ts`.

`generateDynamicStoryAngles(topic)` inspects every sourced fact, extracts a year when present, and classifies generic event signals: early period, appointment, leadership, achievement, breakthrough, discovery, award, conflict, crisis, setback, legal event, comeback, death, current status and legacy. No person name, organisation, country or fixed year participates in ranking.

Each fact receives an importance score from its strongest event signal, source availability, date specificity and information specificity. The engine then builds only clusters supported by facts:

- turning point from high-impact changes;
- achievement/breakthrough when at least two related facts exist;
- challenge and recovery from setback/conflict plus later change;
- chronological journey when at least two dated facts exist;
- legacy/current impact when relevant evidence exists.

Every returned angle contains `supportingFactIds` and a calculated `narrativePotentialScore`. Empty clusters are not returned; duplicate titles are removed; results are ranked and capped at five. Titles use labels from the supporting facts, so different biographies produce different angles.

Remaining limitation: classification uses multilingual term matching and year extraction, not semantic embeddings or an LLM. Fact quality is bounded by the material returned by Wikidata/Wikipedia, and related wording not present in the signal vocabulary may be classified only as a milestone.
