import { readFile } from "node:fs/promises";
import { repairCandidateClusters } from "../src/lib/archive/clusterRepair.ts";
import { createStoryStore } from "../src/lib/discovery/store.ts";
import { writeAudit } from "./audit-lib.mjs";

const values = Object.fromEntries(process.argv.slice(2).map((argument) => argument.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const input = values.input ?? "audit/research-enrichment-report.json";
const parsed = JSON.parse(await readFile(input, "utf8")); const candidateIds = parsed.originalCandidateIds ?? parsed.candidateIds;
if (!Array.isArray(candidateIds) || !candidateIds.length) throw new Error(`No candidate IDs found in ${input}`);
const store = createStoryStore();
try {
  const report = await repairCandidateClusters(candidateIds, store); const reportFile = await writeAudit("cluster-repair-report.json", report);
  console.log(JSON.stringify({ ...report, reportFile }, null, 2));
} finally { await store.close(); }
