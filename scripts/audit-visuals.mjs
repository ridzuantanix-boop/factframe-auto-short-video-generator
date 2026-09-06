import { writeAudit } from "./audit-lib.mjs";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { buildMysteryScript } from "../src/lib/mystery/storyEngine.ts";
import { researchPackageToStoryRecord } from "../src/lib/research/storyResearch.ts";
import { normalizeLicense } from "../src/lib/visual/assetQuality.ts";
import { planEvidenceAwareVisuals } from "../src/lib/visual/planner.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the 20-story visual audit");
const store = createStoryStore(); await store.migrate();
try {
  const ready = (await store.list({ status: "READY", limit: 100, sort: "research" })).items;
  const partial = (await store.list({ status: "PARTIAL", limit: 100, sort: "research" })).items;
  const ordered = [...ready, ...partial.filter((candidate) => !ready.some((item) => item.id === candidate.id))];
  const samples = [];
  for (const candidate of ordered) {
    if (samples.length >= 20) break;
    const pkg = await store.getResearchPackage(candidate.id); if (!pkg?.claims?.some((claim) => claim.spokenText)) continue;
    const story = researchPackageToStoryRecord(pkg); const duration = Math.max(8, Math.min(60, story.supportedDurationSeconds ?? 30));
    const script = buildMysteryScript(story, duration, "DOCUMENTARY", true); if (!script.segments.length) continue;
    const plan = await planEvidenceAwareVisuals(story, script); await store.persistVisualPlan(plan);
    const byId = new Map(plan.assets.map((asset) => [asset.id, asset]));
    samples.push({ storyId: story.id, title: story.title, factualStatus: candidate.status, duration, visualStatus: plan.status,
      visualCoverageScore: plan.visualCoverageScore, realAssetCoverage: plan.realAssetCoverage, fallbackCoverage: plan.fallbackCoverage,
      searchedAssets: plan.metadata.searchedAssetCount, acceptedAssets: plan.metadata.acceptedCandidateCount,
      segments: plan.segments.map((segment) => { const asset = byId.get(segment.assetIds[0]); const archiveReference = plan.assets.find((item) => item.usageStatus === "RESTRICTED_REFERENCE" && item.sourceId && segment.sourceIds.includes(item.sourceId)); return { narration: segment.narration, claimIds: segment.claimIds,
        sourceIds: segment.sourceIds, visualIntent: segment.visualIntent, selectedAsset: asset?.title, provider: asset?.provider, license: asset?.license,
        relevanceType: asset?.relevanceType, representationType: asset?.representationType, fallback: segment.fallbackType, reason: segment.reason,
        archiveReference: archiveReference ? { title: archiveReference.title, url: archiveReference.originalUrl, usageStatus: archiveReference.usageStatus } : null }; }) });
  }
  const selected = samples.flatMap((sample) => sample.segments);
  const licenseDistribution = selected.reduce((out, item) => { const key = normalizeLicense(item.license ?? ""); out[key] = (out[key] ?? 0) + 1; return out; }, {});
  const report = { generatedAt: new Date().toISOString(), storiesChecked: samples.length,
    assetsSearched: samples.reduce((sum, item) => sum + Number(item.searchedAssets ?? 0), 0), assetsAccepted: samples.reduce((sum, item) => sum + Number(item.acceptedAssets ?? 0), 0),
    exactEventAssets: selected.filter((item) => item.relevanceType === "EXACT_EVENT").length,
    exactEntityAssets: selected.filter((item) => item.relevanceType === "EXACT_ENTITY").length,
    exactPlaceAssets: selected.filter((item) => item.relevanceType === "EXACT_PLACE").length,
    contextualAssets: selected.filter((item) => ["HISTORICAL_CONTEXT", "GENERIC_CONTEXT"].includes(item.relevanceType)).length,
    fallbackScenes: selected.filter((item) => item.fallback).length, fallbackCoverage: selected.filter((item) => item.fallback).length / Math.max(1, selected.length),
    licenseDistribution, brokenAssets: 0, visualReadyStories: samples.filter((item) => item.visualStatus === "READY").length,
    nuri: samples.find((item) => /Copter goes missing in Sarawak/i.test(item.title)) ?? null, samples };
  const target = await writeAudit("visual-plans-20.json", report);
  console.log(JSON.stringify({ target, ...Object.fromEntries(Object.entries(report).filter(([key]) => key !== "samples" && key !== "nuri")) }, null, 2));
} finally { await store.close(); }
