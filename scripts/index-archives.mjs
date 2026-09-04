import { runArchiveIngestion } from "../src/lib/archive/indexer.ts";
import { writeAudit } from "./audit-lib.mjs";

function option(name, fallback) {
  const prefix = `--${name}=`; return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const report = await runArchiveIngestion({
  provider: option("provider", undefined), region: option("region", undefined), queryGroup: option("query-group", undefined),
  pages: Number(option("pages", "1")), limit: Number(option("limit", "15")), delayMs: Number(option("delay", "250")),
  concurrency: Number(option("concurrency", "2")),
});
const target = await writeAudit("archive-ingestion-report.json", report);
console.log(JSON.stringify({ ...report, auditFile: target }, null, 2));
