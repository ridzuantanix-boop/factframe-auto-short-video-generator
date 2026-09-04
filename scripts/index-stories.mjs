import { runDiscoveryIngestion } from "../src/lib/discovery/indexer.ts";

function option(name, fallback) {
  const prefix = `--${name}=`; const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  return value ?? fallback;
}

const report = await runDiscoveryIngestion({
  category: option("category", undefined), pagesPerQuery: Number(option("pages", "1")),
  limit: Number(option("limit", "15")), concurrency: Number(option("concurrency", "2")),
  delayMs: Number(option("delay", "350")),
});
console.log(JSON.stringify(report, null, 2));
