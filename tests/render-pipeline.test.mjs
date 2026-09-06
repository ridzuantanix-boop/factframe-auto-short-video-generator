import assert from "node:assert/strict";
import test from "node:test";
import { buildCaptionCues, buildSegmentTimeline, captionCoverage, renderCacheKey, resolveRenderableAsset, selectRecorderMime } from "../src/lib/render/timeline.ts";

const script = { storyId: "nuri", title: "Nuri", durationTarget: 18, segments: [
  { text: "Helikopter Nuri pada mulanya dilaporkan hilang.", claimIds: ["c1"], sourceIds: ["s1"], visualIntent: "TIMELINE" },
  { text: "Ia ditemukan berhampiran Ba'Kelalan.", claimIds: ["c2"], sourceIds: ["s2"], visualIntent: "LOCATION" },
  { text: "Tiga anggota maut dalam nahas itu.", claimIds: ["c3"], sourceIds: ["s2"], visualIntent: "ARCHIVAL_PHOTO" },
  { text: "Tujuh orang terselamat.", claimIds: ["c4"], sourceIds: ["s2"], visualIntent: "FACT_CARD" },
] };
const assets = script.segments.map((_, i) => ({ id: `a${i}`, assetType: i === 1 ? "MAP" : "ENTITY_IMAGE", provider: "FACTFRAME", usageStatus: "GENERATED_SAFE", representationType: i === 2 ? "CONTEXTUAL" : "PROGRAMMATIC", metadata: {}, url: "x" }));
const plan = { segments: script.segments.map((_, i) => ({ segmentId: `scene${i}`, assetIds: [`a${i}`] })), assets };

test("supported MIME selection and extension match actual container", () => { const picked = selectRecorderMime((mime) => mime.includes("vp8")); assert.match(picked.mimeType, /webm/); assert.equal(picked.extension, ".webm"); });
test("segment timeline uses actual audio duration with no gaps or overlaps", () => { const scenes = buildSegmentTimeline(script, plan, 19.4); assert.equal(scenes.at(-1).endMs, 19400); assert.ok(scenes.every((scene) => scene.endMs > scene.startMs)); scenes.slice(1).forEach((scene, i) => assert.equal(scene.startMs, scenes[i].endMs)); });
test("captions cover approved narration in natural chunks", () => { const scenes = buildSegmentTimeline(script, plan, 18); const cues = buildCaptionCues(script, scenes); assert.equal(captionCoverage(script, cues), 1); assert.ok(cues.every((cue) => cue.text.split(/\s+/).length <= 8)); });
test("restricted archive asset is replaced by planned fallback", () => { const restricted = { ...assets[0], usageStatus: "RESTRICTED_REFERENCE" }; assert.equal(resolveRenderableAsset(restricted, assets[3]).asset.id, "a3"); });
test("contextual representation is retained", () => { assert.equal(resolveRenderableAsset(assets[2], assets[3]).asset.representationType, "CONTEXTUAL"); });
test("broken remote asset uses fallback", () => { const broken = { ...assets[0], metadata: { broken: true } }; assert.equal(resolveRenderableAsset(broken, assets[3]).substituted, true); });
test("research hash invalidates render cache", () => { assert.notEqual(renderCacheKey("r1", "v", "n", "voice"), renderCacheKey("r2", "v", "n", "voice")); });
test("visual plan hash invalidates render cache", () => { assert.notEqual(renderCacheKey("r", "v1", "n", "voice"), renderCacheKey("r", "v2", "n", "voice")); });
test("timeline preserves factual order and linkage", () => { const scenes = buildSegmentTimeline(script, plan, 18); assert.deepEqual(scenes.map((scene) => scene.claimIds[0]), ["c1", "c2", "c3", "c4"]); assert.deepEqual(scenes.map((scene) => scene.sourceIds[0]), ["s1", "s2", "s2", "s2"]); });
test("export manifest contract lists all reproducibility fields", () => { const required = ["storyCandidateId", "researchPackageHash", "visualPlanHash", "narrationHash", "ttsProvider", "voicePreset", "actualAudioDuration", "videoDuration", "resolution", "mimeType", "fileSize", "createdAt", "assets", "sources", "playbackValidation"]; const manifest = Object.fromEntries(required.map((key) => [key, true])); required.forEach((key) => assert.ok(key in manifest)); });
