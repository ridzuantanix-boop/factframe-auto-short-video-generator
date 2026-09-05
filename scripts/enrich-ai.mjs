import { readFile } from "node:fs/promises";
import { enrichAiBatch } from "../src/lib/research/aiBatch.ts";
import { writeAudit } from "./audit-lib.mjs";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => argument.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
let candidateIds; if (values["candidate-ids-file"]) { const input = JSON.parse(await readFile(values["candidate-ids-file"], "utf8")); candidateIds = input.candidateIds ?? input.resultCandidateIds; }
const report = await enrichAiBatch({ limit: Number(values.limit ?? 20), status: (values.status ?? "PARTIAL").toUpperCase(), region: values.region,
  category: values.category, minSources: Number(values["min-sources"] ?? 1), minClaims: Number(values["min-claims"] ?? 1), concurrency: Number(values.concurrency ?? 1),
  delayMs: Number(values.delay ?? 3500), candidateIds, newSourceClaimsOnly: values["new-source-claims-only"] === "true" });
const reportFile = await writeAudit("ai-enrichment-report.json", report); console.log(JSON.stringify({ ...report, details: undefined, reportFile }, null, 2));
