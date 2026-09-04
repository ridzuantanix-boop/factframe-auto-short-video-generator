import { reclassifyStories } from "../src/lib/discovery/reclassifier.ts";
import { writeAudit } from "./audit-lib.mjs";

const delayArg = process.argv.find((value) => value.startsWith("--delay="));
const report = await reclassifyStories({ delayMs: Number(delayArg?.split("=")[1] ?? 300) });
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${await writeAudit("classification-audit.json", report)}.`);
