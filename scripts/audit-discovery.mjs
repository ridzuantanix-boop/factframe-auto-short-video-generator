import { loadModules, loadPersistedCatalog, writeAudit } from "./audit-lib.mjs";

const modules = await loadModules();
const queries = Object.entries(modules.DISCOVERY_CATEGORY_QUERIES).flatMap(([category, values]) => values.map((query) => ({ category, query })));
const persisted = await loadPersistedCatalog();
const output = {
  generatedAt: new Date().toISOString(), mode: persisted.configured ? "persistent PostgreSQL story index" : "database not configured; live fallback only",
  discoveryProviders: [...modules.DISCOVERY_PROVIDERS], queryCount: queries.length, queries,
  storedCandidateCount: persisted.stats?.total ?? null, liveCandidateCount: null, rejectedCount: null,
  rejectionReasons: ["list/category/disambiguation pages", "fiction/film/album/book/game matches in mystery mode", "missing usable facts", "visual readiness gate below thresholds"],
  duplicateClusters: [], malaysiaMalayaStoredCount: persisted.stats?.malaysiaMalaya ?? null,
  confirmedMalaysiaCount: persisted.stats?.confirmedMalaysia ?? null, probableMalaysiaCount: persisted.stats?.probableMalaysia ?? null,
  unknownGeographyCount: persisted.stats?.unknownGeography ?? null,
  discoveredCount: persisted.stats?.discovered ?? null, readyCount: persisted.stats?.ready ?? null,
  partialCount: persisted.stats?.partial ?? null, hiddenCount: persisted.stats?.hidden ?? null,
  globalCount: persisted.stats?.global ?? null, countsByCategory: persisted.stats?.categories ?? null,
  topRejectionCauses: "per-run rejection counts are emitted by npm run index:stories",
};
console.log(`Wrote ${await writeAudit("discovery-diagnostics.json", output)}.`);
