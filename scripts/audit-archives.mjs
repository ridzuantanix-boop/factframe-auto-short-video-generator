import { createStoryStore } from "../src/lib/discovery/store.ts";
import { readJson, writeAudit } from "./audit-lib.mjs";

const store = createStoryStore();
try {
  await store.migrate();
  const [archive, catalog, examples] = await Promise.all([store.archiveStats(), store.stats(), store.listArchiveExamples(10)]);
  let ingestion = null; try { ingestion = await readJson("audit/archive-ingestion-report.json"); } catch {}
  let baselineCatalogCount = null; try { baselineCatalogCount = Number((await readJson("audit/classification-audit.json")).totalCandidates); } catch {}
  const report = { generatedAt: new Date().toISOString(), providersAttempted: ingestion?.providersAttempted ?? [],
    queriesRun: ingestion?.queriesRun ?? 0, rawDocuments: ingestion?.rawDocuments ?? 0, normalizedDocuments: ingestion?.normalizedDocuments ?? 0,
    clusters: ingestion?.clusters ?? 0, newCandidates: ingestion?.newCandidates ?? 0, updatedCandidates: ingestion?.updatedCandidates ?? 0,
    archiveCandidates: archive.archiveCandidates, hiddenArchiveCandidates: archive.hiddenArchiveCandidates, baselineCatalogCount,
    newArchiveCandidates: baselineCatalogCount === null ? null : catalog.total - catalog.hidden - baselineCatalogCount,
    malaysiaMalayaCandidates: archive.malaysiaArchiveCandidates, sourceCountDistribution: archive.sourceCountDistribution,
    candidatesWithTwoPlusSources: archive.twoPlusSources, candidatesWithThreePlusSources: archive.threePlusSources,
    archiveStatuses: { discovered: archive.discovered, partial: archive.partial, ready: archive.ready },
    catalogStatuses: { discovered: catalog.discovered, partial: catalog.partial, ready: catalog.ready, hidden: catalog.hidden }, providers: archive.providers,
    providerFailures: ingestion?.providerFailures ?? {}, duplicateMerges: ingestion?.duplicateMerges ?? 0,
    examples: examples.map((item) => ({ title: item.title, region: item.region, storyType: item.storyType, sourceCount: item.sourceCount,
      historicalContext: item.metadata.historicalContext, originProviders: item.metadata.originProviders })) , totalCatalog: catalog.total };
  const target = await writeAudit("archive-audit.json", report); console.log(JSON.stringify({ ...report, auditFile: target }, null, 2));
} finally { await store.close(); }
