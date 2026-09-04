import { loadModules, writeAudit } from "./audit-lib.mjs";

const modules = await loadModules();
const ids = ["mh370", "highland-towers", "villa-nabila", "dyatlov-pass"];
const programmatic = new Set(["MAP", "TIMELINE", "DOCUMENT", "NEWSPAPER", "EVIDENCE", "FACT_CARD", "THEORY_CARD"]);
const samples = ids.map((id) => {
  const story = modules.mysteryCatalog.find((candidate) => candidate.id === id);
  const script = modules.buildMysteryScript(story, 30, "DOCUMENTARY", true);
  return { storyId: id, title: story.title, segments: script.segments.map((segment, index) => ({ segmentIndex: index, narration: segment.text, visualIntent: segment.visualIntent, searchQueries: modules.buildVisualQueries(story, segment.text, segment.visualIntent), candidateMediaCount: null, selectedMedia: programmatic.has(segment.visualIntent) ? `FactFrame ${segment.visualIntent} scene` : "selected live by /api/media", mediaType: programmatic.has(segment.visualIntent) ? "programmatic" : "image/video", source: programmatic.has(segment.visualIntent) ? "FactFrame" : "Wikimedia Commons", license: programmatic.has(segment.visualIntent) ? "generated on device" : "retained from Commons metadata", duplicateRejectionReason: "same source URL or media ID receives a 0.65 score penalty", fallbackUsed: programmatic.has(segment.visualIntent) })) };
});
const output = { generatedAt: new Date().toISOString(), limitation: "Candidate counts and concrete Commons files depend on the live API and are deliberately not frozen. This export exposes the exact segment queries and deterministic programmatic decisions.", samples };
console.log(`Wrote ${await writeAudit("visual-diagnostics.json", output)}.`);
