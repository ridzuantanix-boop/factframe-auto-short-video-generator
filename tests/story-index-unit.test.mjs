import assert from "node:assert/strict";
import test from "node:test";
import { classifyLocation, normalizeCandidate, normalizeTitle } from "../src/lib/discovery/normalizer.ts";
import { qualifyCandidate, calculateResearchScore } from "../src/lib/discovery/storyScorer.ts";

test("normalization and Malaysia classification are deterministic", () => {
  assert.equal(normalizeTitle("Flight MH-370"), "flight mh 370");
  assert.deepEqual(classifyLocation({ label: "Kellie's Castle", description: "castle in Perak" }, "historical place"), { country: "Malaysia", region: "Perak" });
  const candidate = normalizeCandidate({ id: "Q123", label: "Test Entity", description: "historical event", url: "https://en.wikipedia.org/wiki/Test_Entity?oldid=1" }, "history", "history");
  assert.equal(candidate.canonicalEntityId, "Q123"); assert.equal(candidate.status, "DISCOVERED");
  assert.equal(candidate.researchScore, null); assert.equal(candidate.visualScore, null);
});

test("qualification uses actual source and claim counts", () => {
  assert.equal(qualifyCandidate(0, 0), "DISCOVERED");
  assert.equal(qualifyCandidate(1, 3), "PARTIAL");
  assert.equal(qualifyCandidate(2, 5), "READY");
  assert.equal(calculateResearchScore(0, 8), null);
  assert.notEqual(calculateResearchScore(1, 2), calculateResearchScore(2, 6));
});
