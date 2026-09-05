import { enrichStoryBatch } from "../src/lib/research/batchResearch.ts";
import { writeAudit } from "./audit-lib.mjs";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => argument.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const report = await enrichStoryBatch({ status: (values.status ?? "PARTIAL").toUpperCase(), limit: Number(values.limit ?? 25),
  category: values.category, region: values.region, minSources: Number(values["min-sources"] ?? 1), concurrency: Number(values.concurrency ?? 2), delayMs: Number(values.delay ?? 100) });
const reportFile = await writeAudit("research-enrichment-report.json", report);
console.log(JSON.stringify({ ...report, reportFile }, null, 2));
