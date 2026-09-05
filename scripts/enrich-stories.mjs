import { enrichStoryBatch } from "../src/lib/research/batchResearch.ts";
import { writeAudit } from "./audit-lib.mjs";
import { readFile } from "node:fs/promises";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => argument.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
let candidateIds;
if (values["candidate-ids-file"]) { const parsed = JSON.parse(await readFile(values["candidate-ids-file"], "utf8")); candidateIds = parsed.resultCandidateIds ?? parsed.candidateIds; }
const report = await enrichStoryBatch({ status: (values.status ?? "PARTIAL").toUpperCase(), limit: Number(values.limit ?? candidateIds?.length ?? 25), candidateIds,
  category: values.category, region: values.region, minSources: Number(values["min-sources"] ?? 1), concurrency: Number(values.concurrency ?? 2), delayMs: Number(values.delay ?? 100) });
const reportFile = await writeAudit("research-enrichment-report.json", report);
console.log(JSON.stringify({ ...report, reportFile }, null, 2));
