import process from "node:process";
import { loadModules, catalogStatus, isMalaysia, readJson } from "./audit-lib.mjs";

const packageJson = await readJson("package.json");
const modules = await loadModules();
const statuses = modules.mysteryCatalog.map(catalogStatus);
const diagnostics = {
  framework: `Next.js ${packageJson.dependencies.next}`,
  node: process.version,
  appVersion: packageJson.version,
  storedStoryCount: modules.mysteryCatalog.length,
  readyCount: statuses.filter((value) => value === "READY").length,
  partialCount: statuses.filter((value) => value === "PARTIAL").length,
  hiddenCount: statuses.filter((value) => value === "HIDDEN").length,
  malaysiaMalayaCount: modules.mysteryCatalog.filter(isMalaysia).length,
  globalCount: modules.mysteryCatalog.filter((story) => !isMalaysia(story)).length,
  discoveryCategories: Object.keys(modules.DISCOVERY_CATEGORY_QUERIES).length,
  storyAngleTypes: ["BIOGRAPHICAL_JOURNEY", "TURNING_POINT", "ORIGIN_STORY", "TIMELINE", "HOW_IT_CHANGED", "WHY_IT_MATTERS", "MAJOR_MOMENTS", "HISTORICAL_OVERVIEW"],
  sourceProviders: ["Wikidata", "Wikipedia", "seeded institutional/primary/academic/reference URLs", "Gemini"],
  visualProviders: ["Wikimedia Commons", "FactFrame programmatic scenes"],
  videoRetrievalEnabled: true,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY) && process.env.DEMO_MODE !== "true",
  demoMode: process.env.DEMO_MODE === "true",
  narratorPresets: modules.VOICE_PRESETS.length,
  renderer: "browser Canvas + MediaRecorder + FFmpeg/WASM fallback",
  watermarkEnabledByDefault: false,
};
console.log(JSON.stringify(diagnostics, null, 2));
