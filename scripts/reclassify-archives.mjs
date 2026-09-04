import { reclassifyArchiveRecords } from "../src/lib/archive/reclassifier.ts";
import { writeAudit } from "./audit-lib.mjs";

const report = await reclassifyArchiveRecords();
const { sample, ...summary } = report;
const reportFile = await writeAudit("archive-classification-report.json", summary);
const sampleFile = await writeAudit("archive-classification-sample.json", { generatedAt: report.generatedAt, sampleSize: sample.length, records: sample });
console.log(JSON.stringify({ ...summary, reportFile, sampleFile }, null, 2));
