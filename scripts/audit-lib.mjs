import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const auditDir = path.join(root, "audit");

export async function loadModules() {
  const [{ mysteryCatalog }, storyEngine, explainerEngine, qualityScoring, angleResearch, visualQueries, discovery, voices] = await Promise.all([
    import("../src/lib/mystery/catalog.ts"), import("../src/lib/mystery/storyEngine.ts"), import("../src/lib/story/explainerEngine.ts"),
    import("../src/lib/story/qualityScoring.ts"), import("../src/lib/story/angleResearch.ts"),
    import("../src/lib/video/visualQueries.ts"), import("../src/lib/discovery/config.ts"), import("../src/lib/audio/voicePresets.ts"),
  ]);
  return { mysteryCatalog, ...storyEngine, ...explainerEngine, ...qualityScoring, ...angleResearch, ...visualQueries, ...discovery, ...voices };
}

export async function loadPersistedCatalog() {
  if (!process.env.DATABASE_URL) return { configured: false, stats: null, stories: [] };
  const { createStoryStore } = await import("../src/lib/discovery/store.ts");
  const store = createStoryStore();
  try {
    const [stats, catalog] = await Promise.all([store.stats(), store.list({ page: 1, limit: 100, sort: "newest" })]);
    return { configured: true, stats, stories: catalog.items };
  } finally { await store.close(); }
}

export function catalogStatus(story) {
  if (!story.sources.length || !story.claims.length || story.researchScore < 0.6 || story.visualScore < 0.5) return "HIDDEN";
  if (story.sourceCoveragePotential === "good" && story.researchScore >= 0.9 && story.visualScore >= 0.8) return "READY";
  return "PARTIAL";
}

export function isMalaysia(story) { return /malaysia|malaya/i.test(`${story.country} ${story.region}`); }
export const defaultWatermark = { enabled: false, text: "", position: "BOTTOM_RIGHT", opacity: 0.75, size: "SMALL" };

export async function readJson(relativePath) { return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8")); }
export async function writeAudit(name, value) {
  await fs.mkdir(auditDir, { recursive: true });
  const target = path.join(auditDir, name);
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path.relative(root, target).replaceAll("\\", "/");
}

export function distribution(values, bucketSize = 0.1) {
  return values.reduce((result, value) => {
    const start = Math.floor(value / bucketSize) * bucketSize;
    const key = `${start.toFixed(1)}-${Math.min(1, start + bucketSize).toFixed(1)}`;
    result[key] = (result[key] ?? 0) + 1; return result;
  }, {});
}
