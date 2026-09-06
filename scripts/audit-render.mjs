import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(await fs.readFile(path.join(root, "audit/render-manifest.json"), "utf8"));
const failures = report.attempts.filter((item) => !item.playbackValidation?.canPlay || !item.playbackValidation?.reachedNearEnd || !item.audioTrack || !item.videoTrack || item.fileSize < 10_000);
if (failures.length) throw new Error(`${failures.length} render audit attempts failed validation`);
console.log(JSON.stringify({ storiesAttempted: report.storiesAttempted, rendersSucceeded: report.rendersSucceeded, rendersFailed: report.rendersFailed,
  audioGenerated: report.audioGenerated, actualDurations: report.attempts.map((item) => item.actualAudioDuration), videoDurations: report.attempts.map((item) => item.videoDuration),
  formats: [...new Set(report.attempts.map((item) => item.mimeType))], resolution: [...new Set(report.attempts.map((item) => item.resolution))],
  assetFailures: report.attempts.reduce((sum, item) => sum + item.assetFailures, 0), fallbackSubstitutions: report.attempts.reduce((sum, item) => sum + item.fallbackSubstitutions, 0),
  captionCoverage: Math.min(...report.attempts.map((item) => item.captionCoverage)), playbackValidation: "PASS" }, null, 2));
