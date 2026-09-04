import assert from "node:assert/strict";
import test from "node:test";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { indexSearchResults } from "../src/lib/discovery/indexer.ts";
import { normalizeCandidate } from "../src/lib/discovery/normalizer.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = (name, fn) => test(name, { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" }, fn);
const runId = `phase2-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const qid = `Q${Date.now()}${Math.floor(Math.random() * 1000)}`;

integration("candidate upsert dedupes the same Q-ID and preserves status", async () => {
  const store = createStoryStore(databaseUrl); await store.migrate();
  try {
    const first = normalizeCandidate({ id: qid, label: `${runId} Malaysia Airlines Flight 370`, description: "Malaysian aviation disappearance", url: `https://www.wikidata.org/wiki/${qid}` }, "malaysia_mysteries", "Malaysia disappearance");
    await store.upsert(first);
    await store.upsert({ ...normalizeCandidate({ id: qid, label: `${runId} MH370`, description: "aircraft disappearance in Malaysia", url: `https://en.wikipedia.org/wiki/${runId}` }, "mysteries", "Flight MH370"), status: "PARTIAL", sourceCount: 1, claimCount: 3, researchScore: 0.5 });
    const found = await store.findByIdentity(first);
    assert.ok(found); assert.equal(found.id, first.id); assert.equal(found.status, "PARTIAL"); assert.equal(found.sourceCount, 1);
    const matches = await store.list({ search: runId, page: 1, limit: 10 });
    assert.equal(matches.total, 1); assert.ok(matches.items[0].aliases.some((alias) => alias.includes("MH370")));
  } finally { await store.close(); }
});

integration("records survive a connection restart and filters paginate", async () => {
  let store = createStoryStore(databaseUrl); await store.migrate();
  for (let index = 0; index < 3; index += 1) {
    const candidate = normalizeCandidate({ id: `Q${Date.now()}${index}${Math.floor(Math.random() * 1000)}`, label: `${runId} Johor ${index}`, description: "place in Johor", url: `https://example.test/${runId}/${index}` }, "malaysia", "Johor history");
    await store.upsert(candidate);
  }
  await store.close();
  store = createStoryStore(databaseUrl);
  try {
    const firstPage = await store.list({ country: "Malaysia", search: runId, page: 1, limit: 2, sort: "title" });
    const secondPage = await store.list({ country: "Malaysia", search: runId, page: 2, limit: 2, sort: "title" });
    assert.equal(firstPage.total, 4); assert.equal(firstPage.items.length, 2); assert.equal(firstPage.hasMore, true);
    assert.equal(secondPage.items.length, 2); assert.equal(secondPage.hasMore, false);
    const stats = await store.stats(); assert.ok(stats.total >= 4); assert.ok(stats.malaysiaMalaya >= 4);
  } finally { await store.close(); }
});

integration("search results are indexed and duplicate Q-IDs count once", async () => {
  const store = createStoryStore(databaseUrl); await store.migrate();
  try {
    const searchQid = `Q${Date.now()}77`;
    const result = { id: searchQid, label: `${runId} Search Discovery`, description: "Malaysian historical event", url: `https://www.wikidata.org/wiki/${searchQid}` };
    await indexSearchResults([result, { ...result, label: `${runId} Search Alias` }], "malaysia", "Malaysian history", store);
    const matches = await store.list({ search: runId, page: 1, limit: 20 });
    assert.equal(matches.items.filter((item) => item.canonicalEntityId === searchQid).length, 1);
  } finally { await store.close(); }
});

integration("an explicit status survives a new database connection", async () => {
  const statusQid = `Q${Date.now()}88`;
  let store = createStoryStore(databaseUrl); await store.migrate();
  const candidate = { ...normalizeCandidate({ id: statusQid, label: `${runId} Hidden`, description: "invalid candidate", url: `https://www.wikidata.org/wiki/${statusQid}` }, "interesting", "test"), status: "HIDDEN" };
  await store.upsert(candidate); await store.close();
  store = createStoryStore(databaseUrl);
  try { assert.equal((await store.findByIdentity(candidate))?.status, "HIDDEN"); }
  finally { await store.close(); }
});
