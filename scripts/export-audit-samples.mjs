import { defaultWatermark, loadModules, readJson, writeAudit } from "./audit-lib.mjs";

const modules = await loadModules();
const fixtureTopics = await readJson("fixtures/audit/explainer-topics.json");
const mysteryIds = ["mh370", "highland-towers", "villa-nabila", "dyatlov-pass"];
const mysterySamples = mysteryIds.map((id) => {
  const story = modules.mysteryCatalog.find((candidate) => candidate.id === id);
  const script = modules.buildMysteryScript(story, 30, "DOCUMENTARY", true);
  const visualPlan = script.segments.map((segment, index) => ({ segmentIndex: index, role: segment.role, visualIntent: segment.visualIntent, queries: modules.buildVisualQueries(story, segment.text, segment.visualIntent), selectedMedia: "resolved live by /api/media" }));
  return { story, storyAngles: [], sources: story.sources, claims: story.claims, claimTypes: [...new Set(story.claims.map((claim) => claim.type))], storyArc: script.segments.map((segment) => segment.role), narration: script.segments.map((segment) => segment.text).join(" "), segments: script.segments, sourceIdsPerSegment: script.segments.map((segment) => segment.sourceIds), visualPlan, visualSearchQueries: visualPlan.map((item) => item.queries), selectedMediaMetadata: { state: "runtime-dependent", provider: "Wikimedia Commons", rawMediaIncluded: false }, ttsPreset: modules.VOICE_PRESETS[0], ttsStyle: modules.VOICE_PRESETS[0].stylePrompt, watermarkConfig: defaultWatermark };
});
const explainerSamples = fixtureTopics.map((topic) => {
  const angles = modules.generateStoryAngles(topic); const script = modules.buildExplainerScript(topic, angles[0], 30, "DOCUMENTARY", true);
  return { story: topic, storyAngles: angles, sources: script.sources, claims: topic.facts, claimTypes: ["VERIFIED"], storyArc: script.segments.map((segment) => segment.role), narration: script.segments.map((segment) => segment.text).join(" "), segments: script.segments, sourceIdsPerSegment: script.segments.map((segment) => segment.sourceIds), visualPlan: script.segments.map((segment, index) => ({ segmentIndex: index, visualIntent: segment.visualIntent })), visualSearchQueries: [], selectedMediaMetadata: { state: "runtime-dependent", provider: "Wikimedia Commons", rawMediaIncluded: false }, ttsPreset: modules.VOICE_PRESETS[0], ttsStyle: modules.VOICE_PRESETS[0].stylePrompt, watermarkConfig: defaultWatermark };
});
const output = { generatedAt: new Date().toISOString(), fixtureNotice: "Testing fixtures; not a replacement for live discovery/research/media selection.", samples: [...explainerSamples, ...mysterySamples] };
console.log(`Wrote ${await writeAudit("audit-samples.json", output)} (${output.samples.length} samples).`);
