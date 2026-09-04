import assert from "node:assert/strict";
import test from "node:test";
import { clusterArchiveEvents } from "../src/lib/archive/clustering.ts";
import { classifyArchiveStoryType, classifyHistoricalContext, extractArchiveEvent, normalizeHistoricalLocations } from "../src/lib/archive/extractor.ts";
import { createNlbOneSearchProvider } from "../src/lib/archive/providers/nlbOneSearch.ts";

const newspaper = createNlbOneSearchProvider("newspaper");
const document = (overrides = {}) => ({ provider: "NLB_NEWSPAPERSG", providerId: "article-1", sourceType: "ARCHIVAL_NEWSPAPER",
  title: "Search for missing Inspector Ahmad in Johore", publisher: "Malaya Tribune",
  url: "https://eresources.nlb.gov.sg/newspapers/digitised/article/article-1", publishedAt: "1948-03-01T00:00:00.000Z",
  accessedAt: "2026-09-04T00:00:00.000Z", snippet: "Police reported that Inspector Ahmad disappeared near Johore town.",
  originalLocationTerms: [], people: [], metadata: { format: "Article" }, reliabilityLevel: "ARCHIVAL_NEWSPAPER", ...overrides });

test("NewspaperSG result normalization preserves traceable archive metadata", () => {
  const result = newspaper.normalize({ Id: "maltribune19460123-1.2.15", Source: "Newspapers", Title: "Question Of Representing Malaya, Burma",
    Date: "23 Jan 1946", Format: "Article", Description: "A report from the Malaya Tribune.", IsAccessible: true, IsRequiredLogin: false });
  assert.ok(result); assert.equal(result.provider, "NLB_NEWSPAPERSG"); assert.equal(result.publisher, "Malaya Tribune");
  assert.equal(result.publishedAt, "1946-01-23T00:00:00.000Z"); assert.match(result.url, /maltribune19460123-1\.2\.15$/);
  assert.equal(result.metadata.requiresLogin, false);
});

test("historical spelling variants normalize to modern Malaysia labels", () => {
  const values = normalizeHistoricalLocations("Kwala Lumpur, Johore, Trengganu, Negri Sembilan, Malacca and North Borneo");
  assert.deepEqual(values.map((item) => item.display), ["Kuala Lumpur", "Johor", "Terengganu", "Negeri Sembilan", "Melaka", "Sabah"]);
  assert.equal(values[0].original, "Kwala Lumpur");
});

test("historical context uses date and region instead of defaulting pre-1963 records to modern Malaysia", () => {
  assert.notEqual(classifyHistoricalContext("Kuala Lumpur incident", ["Kuala Lumpur"], "1930-05-01T00:00:00.000Z").historicalContext, "MODERN_MALAYSIA");
  assert.notEqual(classifyHistoricalContext("Perak incident", ["Perak"], "1940-05-01T00:00:00.000Z").historicalContext, "MODERN_MALAYSIA");
  assert.equal(classifyHistoricalContext("Kuala Lumpur incident", ["Kuala Lumpur"], "1970-05-01T00:00:00.000Z").historicalContext, "MODERN_MALAYSIA");
  assert.equal(classifyHistoricalContext("Sabah incident", ["Sabah"], "1960-05-01T00:00:00.000Z").historicalContext, "NORTH_BORNEO");
  assert.equal(classifyHistoricalContext("Sarawak incident", ["Sarawak"], "1960-05-01T00:00:00.000Z").historicalContext, "SARAWAK");
});

test("headline-weighted story classification handles required integrity cases", () => {
  assert.equal(classifyArchiveStoryType("Girl, 10 Missing", "Police began a search in Kuala Lumpur.").storyType, "DISAPPEARANCE");
  assert.equal(classifyArchiveStoryType("Body Found in Perak River", "Police opened an inquest.").storyType, "MYSTERIOUS_DEATH");
  assert.notEqual(classifyArchiveStoryType("Municipal commissioners adopt new crest", "The design briefly mentions a local legend.").storyType, "FOLKLORE");
  assert.notEqual(classifyArchiveStoryType("Annual rifle shooting", "The Selangor club won the team match.").storyType, "CRIME_MYSTERY");
  assert.notEqual(classifyArchiveStoryType("Money And Jewellery Missing", "The estate manager opened the safe in Kuala Lumpur.").storyType, "DISAPPEARANCE");
  assert.notEqual(classifyArchiveStoryType("Newcomer in Dial M for Murder", "An actress takes the heroine role on the Ipoh stage.").storyType, "CRIME_MYSTERY");
  assert.equal(classifyArchiveStoryType("Police find body in Perak River", "Police recovered an unidentified body.").storyType, "MYSTERIOUS_DEATH");
  assert.equal(classifyArchiveStoryType("Bandits ambush river party", "Two officers were killed in Terengganu.").storyType, "CRIME_MYSTERY");
});

test("archive extraction uses document evidence, never its discovery query", () => {
  assert.equal(extractArchiveEvent(document({ title: "Annual concert announced", snippet: "A school concert will be held tomorrow.", originalLocationTerms: [] })), null);
  const event = extractArchiveEvent(document()); assert.ok(event); assert.equal(event.locations[0], "Johor");
  assert.equal(event.incidentType, "DISAPPEARANCE"); assert.equal(event.claimStatus, "UNRESOLVED");
  assert.match(event.claim, /dilaporkan/);
});

test("sport shooting headlines are not classified as crime without violence evidence", () => {
  assert.equal(extractArchiveEvent(document({ title: "Ladies' Rifle Shooting", snippet: "Selangor club competition results." })), null);
  assert.equal(extractArchiveEvent(document({ title: "Successful shooters", snippet: "Selangor champions won the team match." })), null);
  assert.equal(extractArchiveEvent(document({ title: "Sundram's not about to panic", snippet: "The LionsXII coach prepared his team to face Kedah." })), null);
});

test("same person, town and week cluster while uncertain records remain separate", () => {
  const first = extractArchiveEvent(document());
  const second = extractArchiveEvent(document({ providerId: "article-2", url: "https://example.test/article-2", title: "Missing Inspector Ahmad: search continues in Johor", publishedAt: "1948-03-05T00:00:00.000Z" }));
  const distant = extractArchiveEvent(document({ providerId: "article-3", url: "https://example.test/article-3", title: "Missing Inspector Ahmad reported in Johor", publishedAt: "1949-03-05T00:00:00.000Z" }));
  const result = clusterArchiveEvents([first, second, distant].filter(Boolean));
  assert.equal(result.clusters.length, 2); assert.equal(result.clusters[0].events.length, 2); assert.equal(result.duplicateMerges, 1);
});
