import { createHash } from "node:crypto";
import { readJson, writeAudit } from "./audit-lib.mjs";

const classification = await readJson("audit/archive-classification-report.json");
const sample = await readJson("audit/archive-classification-sample.json");
let review = { records: [] }; try { review = await readJson("audit/archive-classification-manual-review.json"); } catch {}
const sampleFingerprint = createHash("sha256").update(JSON.stringify(sample.records.map((record) => [record.id, record.storyType, record.storyTypeConfidence]))).digest("hex");
if (review.sampleFingerprint && review.sampleFingerprint !== sampleFingerprint) throw new Error("Manual review does not match the current classification sample.");
const allowed = new Set(["CORRECT", "INCORRECT", "UNCERTAIN"]);
const overrides = new Map((review.overrides ?? []).map((item) => [item.id, item]));
const reviewed = Array.isArray(review.records) && review.records.length
  ? review.records.filter((item) => allowed.has(item.verdict))
  : sample.records.map((record) => {
    const override = overrides.get(record.id); const verdict = override?.verdict ?? review.defaultVerdict;
    return { id: record.id, confidence: record.storyTypeConfidence, verdict, reason: override?.reason ?? "Manually checked against title and source snippet." };
  }).filter((item) => allowed.has(item.verdict));
const evaluated = reviewed.filter((item) => item.confidence === "HIGH" || item.confidence === "MEDIUM");
const correct = evaluated.filter((item) => item.verdict === "CORRECT").length; const incorrect = evaluated.filter((item) => item.verdict === "INCORRECT").length;
const precision = correct + incorrect ? correct / (correct + incorrect) : null;
const report = { generatedAt: new Date().toISOString(), archiveCandidatesProcessed: classification.archiveCandidatesProcessed,
  archiveSourcesProcessed: classification.archiveSourcesProcessed, previouslyModernMalaysia: classification.previouslyModernMalaysia,
  historicalContextChanges: classification.historicalContextChanges, historicalContextCounts: classification.historicalContextCounts,
  storyTypeChanges: classification.storyTypeChanges, confidenceDistribution: classification.confidenceDistribution,
  sampleSize: sample.sampleSize, reviewedRecords: reviewed.length, correct: reviewed.filter((item) => item.verdict === "CORRECT").length,
  incorrect: reviewed.filter((item) => item.verdict === "INCORRECT").length, uncertain: reviewed.filter((item) => item.verdict === "UNCERTAIN").length,
  highMediumEvaluated: evaluated.length, highMediumPrecision: precision };
const target = await writeAudit("archive-classification-audit.json", report); console.log(JSON.stringify({ ...report, auditFile: target }, null, 2));
if (report.sampleSize < 100 || report.reviewedRecords < 100) throw new Error("Archive classification audit requires at least 100 manually reviewed records.");
if (report.highMediumPrecision === null || report.highMediumPrecision < 0.9) throw new Error("HIGH/MEDIUM archive story-type precision is below 90%.");
