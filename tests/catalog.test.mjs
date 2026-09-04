import test from "node:test";
import assert from "node:assert/strict";
import { loadModules, catalogStatus, isMalaysia } from "../scripts/audit-lib.mjs";

test("stored catalog has the mandatory audit mysteries", async () => {
  const { mysteryCatalog } = await loadModules();
  for (const id of ["mh370", "highland-towers", "villa-nabila", "dyatlov-pass"]) assert.ok(mysteryCatalog.some((story) => story.id === id), id);
  assert.equal(mysteryCatalog.filter(isMalaysia).length, 4);
});

test("READY scripts pass source and story quality gates", async () => {
  const modules = await loadModules();
  for (const story of modules.mysteryCatalog.filter((item) => catalogStatus(item) === "READY")) {
    const script = modules.buildMysteryScript(story, 30, "DOCUMENTARY", true);
    assert.equal(modules.passesQualityGate(script), true, story.id);
    assert.equal(script.unsupportedClaims, 0, story.id);
    assert.equal(script.sourceCoverage, 1, story.id);
  }
});

test("MH370 uses varied visual intents and segment-specific queries", async () => {
  const modules = await loadModules(); const story = modules.mysteryCatalog.find((item) => item.id === "mh370");
  const script = modules.buildMysteryScript(story, 30, "DOCUMENTARY", true);
  assert.ok(new Set(script.segments.map((segment) => segment.visualIntent)).size >= 5);
  const queries = script.segments.map((segment) => modules.buildVisualQueries(story, segment.text, segment.visualIntent)[0]);
  assert.ok(new Set(queries).size >= 4);
});
