import { loadPersistedCatalog, writeAudit } from "./audit-lib.mjs";

const persisted = await loadPersistedCatalog();
const stories = persisted.stories;
const output = {
  generatedAt: new Date().toISOString(), scope: persisted.configured ? "persistent PostgreSQL story index" : "database not configured",
  totalCandidates: persisted.stats?.total ?? null, countsByStatus: persisted.stats ? { DISCOVERED: persisted.stats.discovered, PARTIAL: persisted.stats.partial, READY: persisted.stats.ready, HIDDEN: persisted.stats.hidden } : null,
  countsByCategory: persisted.stats?.categories ?? null, malaysiaMalayaCount: persisted.stats?.malaysiaMalaya ?? null,
  confirmedMalaysiaCount: persisted.stats?.confirmedMalaysia ?? null, probableMalaysiaCount: persisted.stats?.probableMalaysia ?? null,
  unknownGeographyCount: persisted.stats?.unknownGeography ?? null, globalCount: persisted.stats?.global ?? null,
  exportedItems: stories.length, exportNote: "Latest 100 rows are included as an audit sample; counts cover the full persisted index.", stories,
};
console.log(`Wrote ${await writeAudit("catalog-summary.json", output)} (${persisted.stats?.total ?? "unconfigured"} persisted candidates).`);
