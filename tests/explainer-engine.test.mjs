import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadModules, readJson } from "../scripts/audit-lib.mjs";

const people = await readJson("fixtures/audit/explainer-topics.json");
const modules = await loadModules();

test("generic engine contains no entity-specific ranking terms", async () => {
  const files = await Promise.all(["explainerEngine.ts", "genericEvents.ts"].map((name) => fs.readFile(new URL(`../src/lib/story/${name}`, import.meta.url), "utf8")));
  const source = files.join("\n").toLowerCase();
  for (const forbidden of ["anwar", "abim", "umno", "reformasi", "1998", "2018", "2022"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("four different people receive evidence-backed, distinct angles and hooks", () => {
  assert.deepEqual(people.map((person) => person.name).sort(), ["Anwar Ibrahim", "Michelle Yeoh", "Nikola Tesla", "Steve Jobs"].sort());
  const outputs = people.map((topic) => {
    const angles = modules.generateStoryAngles(topic);
    assert.ok(angles.length >= 2 && angles.length <= 5, topic.name);
    assert.ok(angles.every((angle) => angle.supportingFactIds.length && angle.narrativePotentialScore > 0), topic.name);
    const script = modules.buildExplainerScript(topic, angles[0], 30, "DOCUMENTARY", true);
    assert.equal(script.sourceCoverage, 1, topic.name);
    assert.equal(script.unsupportedClaims, 0, topic.name);
    return { name: topic.name, titles: angles.map((angle) => angle.title), hook: script.hook };
  });
  assert.equal(new Set(outputs.map((output) => output.hook)).size, people.length);
  assert.equal(new Set(outputs.map((output) => output.titles.join("|"))).size, people.length);
});

test("unsupported factual segments reduce calculated source coverage", () => {
  const sources = [{ id: "source-1" }];
  const segments = [
    { role: "HOOK", text: "Satu peristiwa berlaku pada 2001.", sourceIds: ["source-1"] },
    { role: "OPEN_LOOP", text: "Apakah yang berlaku selepas itu?", sourceIds: [] },
    { role: "PAYOFF", text: "Satu lagi dakwaan dibuat tanpa sumber.", sourceIds: [] },
  ];
  assert.equal(modules.calculateSourceCoverage(segments, sources), 0.5);
  assert.equal(modules.calculateUnsupportedClaims(segments, sources), 1);
});

test("semantic repetition lowers repetition score", () => {
  const unique = [
    { role: "HOOK", text: "Beliau melancarkan produk pertama pada 2001.", sourceIds: ["s"] },
    { role: "CONTEXT", text: "Pasukan itu kemudian memenangi anugerah antarabangsa.", sourceIds: ["s"] },
    { role: "PAYOFF", text: "Kerjanya meninggalkan kesan kepada industri.", sourceIds: ["s"] },
  ];
  const repeated = [...unique, { role: "ESCALATION", text: "Pada 2001 beliau melancarkan produk pertamanya.", sourceIds: ["s"] }];
  assert.ok(modules.calculateRepetitionScore(repeated) < modules.calculateRepetitionScore(unique));
});

test("storytelling score is calculated from output quality, not constant", () => {
  const topic = people.find((person) => person.name === "Steve Jobs");
  const angle = modules.generateStoryAngles(topic)[0];
  const strong = modules.buildExplainerScript(topic, angle, 30, "DOCUMENTARY", true);
  const weakSegments = [{ role: "HOOK", text: "Fakta ringkas.", sourceIds: [], claimType: "VERIFIED", visualIntent: "FACT_CARD" }];
  const weak = modules.calculateStorytellingScore({ segments: weakSegments, sources: [] });
  assert.notEqual(strong.storytellingScore, weak);
  assert.ok(strong.storytellingScore > weak);
});
