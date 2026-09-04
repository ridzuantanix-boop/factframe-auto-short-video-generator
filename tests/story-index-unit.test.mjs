import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCandidate, normalizeTitle } from "../src/lib/discovery/normalizer.ts";
import { classifyEntityEvidence } from "../src/lib/discovery/classification.ts";
import { mergeCandidates } from "../src/lib/discovery/dedupe.ts";
import { qualifyCandidate, calculateResearchScore } from "../src/lib/discovery/storyScorer.ts";

test("normalization and Malaysia classification are deterministic", () => {
  assert.equal(normalizeTitle("Flight MH-370"), "flight mh 370");
  const textCandidate = normalizeCandidate({ id: "Q123", label: "Kellie's Castle", description: "castle in Perak", url: "https://www.wikidata.org/wiki/Q123" }, "places", "historical place");
  assert.equal(textCandidate.country, "Malaysia"); assert.equal(textCandidate.metadata.geographyConfidence, "LOW");
  const candidate = normalizeCandidate({ id: "Q123", label: "Test Entity", description: "historical event", url: "https://en.wikipedia.org/wiki/Test_Entity?oldid=1" }, "history", "history");
  assert.equal(candidate.canonicalEntityId, "Q123"); assert.equal(candidate.status, "DISCOVERED");
  assert.equal(candidate.researchScore, null); assert.equal(candidate.visualScore, null);
});

const entityClaim = (id) => ({ mainsnak: { datavalue: { value: { id } } } });
const entity = (id, description, claims = {}, entityLabel = id) => ({ id, labels: { en: { value: entityLabel } }, descriptions: { en: { value: description } }, claims });

test("discovery query never acts as Malaysia geography evidence", () => {
  const eiffel = normalizeCandidate({ id: "Q243", label: "Eiffel Tower", description: "tower in Paris, France", url: "https://www.wikidata.org/wiki/Q243" }, "malaysia", "Malaysia history");
  const globalPerson = normalizeCandidate({ id: "Q19837", label: "Steve Jobs", description: "American entrepreneur", url: "https://www.wikidata.org/wiki/Q19837" }, "malaysia_mysteries", "Johor mystery");
  assert.notEqual(eiffel.country, "Malaysia"); assert.notEqual(globalPerson.country, "Malaysia");
  assert.equal(eiffel.metadata.discoveredViaCategory, "malaysia");
});

test("Wikidata evidence classifies Johor, Villa Nabila and Highland Towers as Malaysia", () => {
  const malaysia = entity("Q833", "country in Southeast Asia");
  const johor = entity("Q183032", "state of Malaysia", { P17: [entityClaim("Q833")] });
  const villa = entity("Q20465421", "Malaysian film", { P495: [entityClaim("Q833")] });
  const highland = entity("Q5759146", "1993 apartment building collapse in Malaysia", { P17: [entityClaim("Q833")] });
  const graph = new Map([["Q833", malaysia], ["Q183032", johor], ["Q20465421", villa], ["Q5759146", highland]]);
  for (const [record, item] of [[johor, { label: "Johor", description: "state" }], [villa, { label: "Villa Nabila", description: "film" }], [highland, { label: "Highland Towers", description: "collapse" }]]) {
    const result = classifyEntityEvidence(item, record, graph);
    assert.equal(result.country, "Malaysia"); assert.equal(result.geographyConfidence, "HIGH");
    assert.equal(result.geographyEvidence[0].type, "WIKIDATA_COUNTRY");
  }
});

test("historical Malaya evidence is Malaysia unless a modern country takes precedence", () => {
  const britishMalaya = entity("Q215682", "former group of British territories", {}, "British Malaya");
  const singapore = entity("Q334", "sovereign island country", {}, "Singapore");
  const historicalSubject = entity("QHISTORY", "historical institution", { P17: [entityClaim("Q215682")] });
  const modernSubject = entity("QMODERN", "museum in Singapore", { P17: [entityClaim("Q334")], P361: [entityClaim("Q215682")] });
  const graph = new Map([["Q215682", britishMalaya], ["Q334", singapore], ["QHISTORY", historicalSubject], ["QMODERN", modernSubject]]);

  const historical = classifyEntityEvidence({ label: "Historic institution", description: "historical institution" }, historicalSubject, graph);
  assert.equal(historical.country, "Malaysia"); assert.equal(historical.geographyConfidence, "MEDIUM");
  assert.equal(historical.geographyEvidence[0].type, "WIKIDATA_HISTORICAL_COUNTRY");

  const modern = classifyEntityEvidence({ label: "Singapore museum", description: "museum" }, modernSubject, graph);
  assert.equal(modern.country, "Singapore"); assert.equal(modern.geographyConfidence, "HIGH");
});

test("mystery discovery category alone does not force MYSTERY story type", () => {
  const candidate = normalizeCandidate({ id: "Q243", label: "Eiffel Tower", description: "wrought-iron tower in Paris", url: "https://www.wikidata.org/wiki/Q243" }, "mysteries", "Johor mystery");
  assert.notEqual(candidate.storyType, "MYSTERY"); assert.equal(candidate.metadata.mysteryPotential, "UNKNOWN");
});

test("live rediscovery cannot overwrite entity-evidence classification", () => {
  const fallback = normalizeCandidate({ id: "Q243", label: "Eiffel Tower", description: "tower in Paris", url: "https://www.wikidata.org/wiki/Q243" }, "malaysia", "Malaysia history");
  const existing = { ...fallback, id: "stored", country: "France", region: "Paris", storyType: "PLACE", discoveredAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: { ...fallback.metadata, classificationVersion: "2.1-entity-evidence", geographyConfidence: "HIGH", geographyEvidence: [{ type: "WIKIDATA_COUNTRY", value: "France" }] } };
  const merged = mergeCandidates(existing, { ...fallback, country: "Malaysia", storyType: "MYSTERY", metadata: { ...fallback.metadata, geographyConfidence: "LOW" } });
  assert.equal(merged.country, "France"); assert.equal(merged.storyType, "PLACE"); assert.equal(merged.metadata.geographyConfidence, "HIGH");
});

test("qualification uses actual source and claim counts", () => {
  assert.equal(qualifyCandidate(0, 0), "DISCOVERED");
  assert.equal(qualifyCandidate(1, 3), "PARTIAL");
  assert.equal(qualifyCandidate(2, 5), "READY");
  assert.equal(calculateResearchScore(0, 8), null);
  assert.notEqual(calculateResearchScore(1, 2), calculateResearchScore(2, 6));
});
