import process from "node:process";
import { loadModules, loadPersistedCatalog, readJson } from "./audit-lib.mjs";

const packageJson = await readJson("package.json");
const modules = await loadModules();
const persisted = await loadPersistedCatalog();
const diagnostics = {
  framework: `Next.js ${packageJson.dependencies.next}`,
  node: process.version,
  appVersion: packageJson.version,
  storyIndexConfigured: persisted.configured,
  persistedCandidateCount: persisted.stats?.total ?? null,
  discoveredCount: persisted.stats?.discovered ?? null,
  readyCount: persisted.stats?.ready ?? null,
  partialCount: persisted.stats?.partial ?? null,
  hiddenCount: persisted.stats?.hidden ?? null,
  malaysiaMalayaCount: persisted.stats?.malaysiaMalaya ?? null,
  confirmedMalaysiaCount: persisted.stats?.confirmedMalaysia ?? null,
  probableMalaysiaCount: persisted.stats?.probableMalaysia ?? null,
  unknownGeographyCount: persisted.stats?.unknownGeography ?? null,
  globalCount: persisted.stats?.global ?? null,
  fallbackSeedCount: modules.mysteryCatalog.length,
  discoveryCategories: Object.keys(modules.DISCOVERY_CATEGORY_QUERIES).length,
  storyAngleTypes: ["BIOGRAPHICAL_JOURNEY", "TURNING_POINT", "ORIGIN_STORY", "TIMELINE", "HOW_IT_CHANGED", "WHY_IT_MATTERS", "MAJOR_MOMENTS", "HISTORICAL_OVERVIEW"],
  sourceProviders: ["Wikidata", "Wikipedia", "NLB OneSearch / NewspaperSG", "NLB Records & Papers", "NLB audiovisual", "seeded institutional/primary/academic/reference URLs", "Gemini"],
  visualProviders: ["Wikimedia Commons", "FactFrame programmatic scenes"],
  videoRetrievalEnabled: true,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY) && process.env.DEMO_MODE !== "true",
  demoMode: process.env.DEMO_MODE === "true",
  narratorPresets: modules.VOICE_PRESETS.length,
  renderer: "browser Canvas + MediaRecorder + FFmpeg/WASM fallback",
  watermarkEnabledByDefault: false,
};
console.log(JSON.stringify(diagnostics, null, 2));
