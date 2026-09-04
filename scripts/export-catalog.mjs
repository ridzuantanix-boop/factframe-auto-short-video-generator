import { loadModules, catalogStatus, isMalaysia, writeAudit } from "./audit-lib.mjs";

const { mysteryCatalog } = await loadModules();
const stories = mysteryCatalog.map((story) => ({
  id: story.id, title: story.title, storyType: "MYSTERY", status: catalogStatus(story), category: story.category, country: story.country,
  region: story.region, sourceCount: story.sources.length, researchScore: story.researchScore, visualScore: story.visualScore,
  currentAware: false, dateDiscovered: story.sources.map((source) => source.accessedAt).sort()[0] ?? null,
  lastVerifiedDate: story.sources.map((source) => source.accessedAt).sort().at(-1) ?? null,
}));
const countBy = (key) => Object.fromEntries([...new Set(stories.map((story) => story[key]))].sort().map((value) => [value, stories.filter((story) => story[key] === value).length]));
const output = {
  generatedAt: new Date().toISOString(), scope: "stored seeded mystery catalog only; live discovery candidates are not persisted",
  totalCandidates: stories.length, countsByStatus: countBy("status"), countsByCategory: countBy("category"), countsByCountry: countBy("country"),
  countsByRegion: countBy("region"), malaysiaMalayaCount: mysteryCatalog.filter(isMalaysia).length,
  globalCount: mysteryCatalog.filter((story) => !isMalaysia(story)).length, stories,
};
console.log(`Wrote ${await writeAudit("catalog-summary.json", output)} (${stories.length} stored stories).`);
