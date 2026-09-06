# Current-aware research

Archive research now separates `caseStateAtSourceTime` from `latestKnownState`. Claims containing unresolved, missing, ongoing-search/investigation, pending-trial, or unknown-outcome signals enter a bounded follow-up gate before READY. Historical checks search forward at +1, +7, +30 and +365 days and stop when a strongly continuous resolution source is accepted. The original dated claim is retained; resolution claims and their source IDs are appended to the timeline.

The implemented follow-up providers are NewspaperSG via NLB OneSearch and a small editorially verified public-web source registry. The Nuri correction uses The Star's 17 August 2004 report. There is no Google Search integration, general news crawler, official-office registry, company filing feed, sports feed, knowledge-diff job, or scheduled freshness worker.

Research packages persist `verificationType`, `verificationStatus`, `verifiedAt`, `verificationTTL`, and `nextVerificationDue`. Closed historical follow-ups have no recurring TTL. Mutable current facts use a seven-day TTL and become STALE when overdue. READY accepts only NOT_REQUIRED or VERIFIED; PENDING, FAILED, and STALE remain PARTIAL.

`/api/topic` hydration still only uses Wikidata/Wikipedia cache behavior and is not yet wired to a scheduled persistence refresh. Living politicians, active companies, athletes, technology, current affairs, and live investigations therefore remain the highest-risk area until official/current providers and a scheduled verifier are added.
