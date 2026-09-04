import { catalogStatus, distribution, isMalaysia, loadModules, writeAudit } from "./audit-lib.mjs";

const modules = await loadModules();
const queries = Object.entries(modules.DISCOVERY_CATEGORY_QUERIES).flatMap(([category, values]) => values.map((query) => ({ category, query })));
const statuses = modules.mysteryCatalog.map(catalogStatus);
const output = {
  generatedAt: new Date().toISOString(), mode: "static and seeded diagnostics; live candidates are request-time and not persisted",
  discoveryProviders: [...modules.DISCOVERY_PROVIDERS], queryCount: queries.length, queries,
  storedCandidateCount: modules.mysteryCatalog.length, liveCandidateCount: null, rejectedCount: null,
  rejectionReasons: ["list/category/disambiguation pages", "fiction/film/album/book/game matches in mystery mode", "missing usable facts", "visual readiness gate below thresholds"],
  duplicateClusters: [], malaysiaMalayaStoredCount: modules.mysteryCatalog.filter(isMalaysia).length,
  readyCount: statuses.filter((value) => value === "READY").length, partialCount: statuses.filter((value) => value === "PARTIAL").length,
  hiddenCount: statuses.filter((value) => value === "HIDDEN").length, topRejectionCauses: "not measurable because rejected live candidates are not stored",
  sourceScoreDistribution: distribution(modules.mysteryCatalog.map((story) => story.researchScore)),
  visualScoreDistribution: distribution(modules.mysteryCatalog.map((story) => story.visualScore)),
};
console.log(`Wrote ${await writeAudit("discovery-diagnostics.json", output)}.`);
