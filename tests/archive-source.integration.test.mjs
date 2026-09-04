import assert from "node:assert/strict";
import test from "node:test";
import { runArchiveIngestion } from "../src/lib/archive/indexer.ts";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { normalizeCandidate } from "../src/lib/discovery/normalizer.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = (name, fn) => test(name, { skip: databaseUrl ? false : "TEST_DATABASE_URL is not configured" }, fn);

integration("story sources persist and duplicate provider URLs remain unique", async () => {
  const store = createStoryStore(databaseUrl); await store.migrate(); const suffix = `${Date.now()}-${Math.random()}`;
  try {
    const base = normalizeCandidate({ id: suffix, label: `Archive source ${suffix}`, description: "missing person in Johor", url: `https://example.test/candidate/${suffix}` }, "archive", "test", "TEST_ARCHIVE");
    const candidate = await store.upsert({ ...base, status: "PARTIAL", claimCount: 1, metadata: { ...base.metadata, archiveDerived: true, originProviders: ["TEST_ARCHIVE"] } });
    const source = { id: suffix, storyCandidateId: candidate.id, provider: "TEST_ARCHIVE", sourceType: "ARCHIVAL_NEWSPAPER", title: "Missing person",
      publisher: "Test Archive", url: `https://example.test/source/${suffix}`, publishedAt: "1948-01-01T00:00:00.000Z", accessedAt: new Date().toISOString(),
      snippet: "A missing person was reported in Johor.", metadata: {}, reliabilityLevel: "ARCHIVAL_NEWSPAPER" };
    assert.equal((await store.upsertSource(source)).inserted, true); assert.equal((await store.upsertSource(source)).inserted, false);
    const refreshed = await store.refreshSourceMetrics(candidate.id); assert.equal(refreshed.sourceCount, 1); assert.equal(refreshed.status, "PARTIAL");
  } finally { await store.close(); }
});

integration("one archive provider failure does not abort successful providers", async () => {
  const store = createStoryStore(databaseUrl); const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const raw = { id: suffix };
  const success = { id: "TEST_SUCCESS", async search() { return { results: [raw], total: 1 }; }, normalize() { return {
    provider: "TEST_SUCCESS", providerId: suffix, sourceType: "ARCHIVAL_NEWSPAPER", title: `Missing man reported in Johor ${suffix}`,
    publisher: "Test Archive", url: `https://example.test/archive/${suffix}`, publishedAt: "1948-01-01T00:00:00.000Z", accessedAt: new Date().toISOString(),
    snippet: "Police searched Johor after a man disappeared.", originalLocationTerms: [], people: [], metadata: { format: "Article" }, reliabilityLevel: "ARCHIVAL_NEWSPAPER" }; }, async fetchDetails(value) { return this.normalize(value); } };
  const failure = { id: "TEST_FAILURE", async search() { throw new Error("provider unavailable"); }, normalize() { return null; }, async fetchDetails() { return null; } };
  try {
    const report = await runArchiveIngestion({ store, providerRegistry: { success, failure }, pages: 1, limit: 1, delayMs: 0, concurrency: 2 });
    assert.equal(report.newCandidates, 1); assert.equal(report.providerFailures.TEST_FAILURE, 1); assert.equal(report.errors.length, 1);
    const rerun = await runArchiveIngestion({ store, providerRegistry: { success }, pages: 1, limit: 1, delayMs: 0, concurrency: 1 });
    assert.equal(rerun.newCandidates, 0); assert.equal(rerun.updatedCandidates, 1); assert.equal(rerun.sourcesDeduped, 1);
  } finally { await store.close(); }
});
