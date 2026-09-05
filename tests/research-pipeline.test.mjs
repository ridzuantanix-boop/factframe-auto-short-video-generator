import assert from "node:assert/strict";
import test from "node:test";
import { extractClaimsFromSource, calculateOcrQuality } from "../src/lib/research/claimExtractor.ts";
import { mergeDuplicateClaims } from "../src/lib/research/claimMerger.ts";
import { calculateResearchMetrics, decideResearchReadiness } from "../src/lib/research/researchScoring.ts";
import { researchPackageToStoryRecord } from "../src/lib/research/storyResearch.ts";
import { buildMysteryScript } from "../src/lib/mystery/storyEngine.ts";
import { assessNarrationQuality, rewriteArchiveClaimToMalay } from "../src/lib/research/narrationRewriter.ts";
import { validateSourceCluster } from "../src/lib/archive/clusterIntegrity.ts";

const candidate = (storyType = "DISAPPEARANCE") => ({ id: "candidate-1", canonicalEntityId: null, canonicalUrl: "https://example.test/story", title: "Girl, 10, reported missing",
  normalizedTitle: "girl 10 reported missing", slug: "girl-10", summary: "A documented archive report.", country: "Malaysia", region: "Johor", category: "archive", storyType,
  status: "PARTIAL", sourceCount: 2, claimCount: 1, researchScore: null, visualScore: null, narrativePotentialScore: null, sourceHints: [], searchTerms: [], aliases: [],
  metadata: { archiveDerived: true, historicalContext: "FEDERATION_OF_MALAYA" }, discoveredAt: "2026-01-01T00:00:00.000Z", lastResearchedAt: null,
  lastVerifiedAt: null, updatedAt: "2026-01-01T00:00:00.000Z", originProvider: "TEST", originQuery: "test" });
const source = (id = "source-1", publisher = "Malaya Tribune") => ({ id, storyCandidateId: "candidate-1", provider: `PROVIDER_${id}`,
  sourceType: "ARCHIVAL_NEWSPAPER", title: "Girl, 10, reported missing", publisher, url: `https://example.test/${id}`,
  publishedAt: "1955-03-01T00:00:00.000Z", accessedAt: "2026-01-01T00:00:00.000Z",
  snippet: "Girl, 10, reported missing. Police reported that a 10-year-old girl was missing in Johor. Officers searched the nearby district after her family raised the alarm.",
  metadata: { extractedLocations: ["Johor"], extractedPeople: ["Inspector Ahmad"] }, reliabilityLevel: "ARCHIVAL_NEWSPAPER" });

test("archive source extracts atomic claims linked to the persisted source", () => {
  const claims = extractClaimsFromSource(candidate(), source());
  assert.ok(claims.length >= 2); assert.ok(claims.every((claim) => claim.sourceIds[0] === "source-1"));
  assert.ok(claims.every((claim) => claim.claimText !== source().title));
});

test("near-duplicate claims merge and retain all independent source IDs", () => {
  const left = extractClaimsFromSource(candidate(), source("source-1", "Malaya Tribune"))[0];
  const right = { ...left, id: "raw-2", sourceIds: ["source-2"], sourcePublisher: "Straits Times", sourceProvider: "PROVIDER_2" };
  const result = mergeDuplicateClaims([left, right]); assert.equal(result.claims.length, 1); assert.equal(result.mergedClaimCount, 1);
  assert.deepEqual(new Set(result.claims[0].sourceIds), new Set(["source-1", "source-2"])); assert.equal(result.claims[0].confidence, "HIGH");
});

test("garbled OCR is excluded or lowered instead of becoming a confident fact", () => {
  assert.ok(calculateOcrQuality("x 1l| � Ã qz 7FWO @@") < .42);
  const noisy = { ...source(), snippet: "x 1l| � Ã qz 7FWO @@" };
  assert.deepEqual(extractClaimsFromSource(candidate(), noisy), []);
});

test("folklore remains FOLKLORE and paranormal archive reporting remains REPORTED", () => {
  const folklore = extractClaimsFromSource(candidate("FOLKLORE"), { ...source(), snippet: "Local residents recorded a legend about the old Johor hill." });
  const paranormal = extractClaimsFromSource(candidate("PARANORMAL_REPORT"), { ...source(), snippet: "Residents reported that a ghost appeared near the old Johor house." });
  assert.ok(folklore.length); assert.ok(folklore.every((claim) => claim.claimType === "FOLKLORE"));
  assert.ok(paranormal.length); assert.ok(paranormal.every((claim) => claim.claimType === "REPORTED"));
});

test("READY requires grounded depth while insufficient evidence stays PARTIAL", () => {
  const sources = [source("s1", "Publisher One"), source("s2", "Publisher Two")];
  const base = extractClaimsFromSource(candidate(), sources[0])[0];
  const texts = ["Police reported that a young girl disappeared after leaving her Johor home on a March morning",
    "Her family contacted officers when she did not return at the expected time that evening",
    "Search parties checked roads and settlements across the district during the following day",
    "A second newspaper recorded that the police investigation remained active after the first search",
    "Later reports said the available records still did not state where the missing child had gone"];
  const claims = texts.map((claimText, index) => ({ ...base, id: `c${index}`, claimText, spokenText: `Laporan polis merekodkan perkembangan berbeza nombor ${index + 1} dalam usaha mencari kanak-kanak yang hilang di Johor.`, normalizedClaim: claimText.toLowerCase(), sourceIds: [sources[index % 2].id],
    sourcePublisher: sources[index % 2].publisher, sourceProvider: sources[index % 2].provider, priority: index ? "ESCALATION_DETAIL" : "HOOK_WORTHY" }));
  const metrics = calculateResearchMetrics(claims, sources, "DISAPPEARANCE");
  const quality = { malayLanguageRatio: 1, englishLeakageCount: 0, ocrLeakageCount: 0, fragmentCount: 0, headlineLeakageCount: 0, spokenNaturalnessScore: .95, passes: true };
  assert.equal(decideResearchReadiness(claims, sources, metrics, true, true, false, "HIGH", quality).status, "READY");
  const weakMetrics = calculateResearchMetrics(claims.slice(0, 1), sources.slice(0, 1), "DISAPPEARANCE");
  assert.equal(decideResearchReadiness(claims.slice(0, 1), sources.slice(0, 1), weakMetrics, true, true, false, "MEDIUM", quality).status, "PARTIAL");
});

test("narration built from a research package preserves source traceability", () => {
  const sources = [source("s1", "Publisher One"), source("s2", "Publisher Two")]; const base = extractClaimsFromSource(candidate(), sources[0])[0];
  const claims = Array.from({ length: 5 }, (_, index) => ({ ...base, id: `claim-${index}`, claimText: `Police report number ${index + 1} recorded a distinct search event involving the missing girl in Johor`,
    spokenText: `Laporan polis nombor ${index + 1} merekodkan perkembangan berbeza dalam usaha mencari kanak-kanak yang hilang di Johor.`,
    normalizedClaim: `police report ${index + 1} distinct search event missing girl johor`, sourceIds: [sources[index % 2].id], priority: index === 0 ? "HOOK_WORTHY" : index === 4 ? "PAYOFF" : "ESCALATION_DETAIL" }));
  const value = { storyCandidateId: "candidate-1", title: "Archive disappearance", summary: "Sourced archive story", storyType: "DISAPPEARANCE", historicalContext: "FEDERATION_OF_MALAYA",
    sources: sources.map((item) => ({ id: item.id, title: item.title, publisher: item.publisher, type: "ARCHIVAL", url: item.url, date: item.publishedAt,
      accessedAt: item.accessedAt, reliabilityLevel: "ARCHIVAL", sourceRole: "ARCHIVAL_NEWSPAPER" })), claims, timeline: [], people: [], locations: ["Johor"],
    hookCandidates: [{ text: claims[0].claimText, claimIds: [claims[0].id], sourceIds: claims[0].sourceIds }], keyTurningPoints: [],
    unresolvedQuestions: [{ text: "Apakah yang berlaku selepas laporan itu?", claimIds: [], sourceIds: [] }], payoff: { text: claims[4].claimText, claimIds: [claims[4].id], sourceIds: claims[4].sourceIds },
    clusterConfidence: "HIGH", narrationQuality: { malayLanguageRatio: 1, englishLeakageCount: 0, ocrLeakageCount: 0, fragmentCount: 0, headlineLeakageCount: 0, spokenNaturalnessScore: .95, passes: true },
    sourceCoverage: 1, unsupportedClaimCount: 0, sourceDiversityScore: .67, claimDiversityScore: .8, ocrQualityScore: .9, researchScore: .85,
    narrativePotentialScore: .8, estimatedNarrationSeconds: 30, readyDecision: { status: "READY", reasons: [] }, requiresCurrentVerification: false,
    lastResearchedAt: "2026-01-01T00:00:00.000Z", lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
  const story = researchPackageToStoryRecord(value); const script = buildMysteryScript(story, 30, "DOCUMENTARY", true);
  const valid = new Set(story.sources.map((item) => item.id));
  assert.ok(script.segments.filter((segment) => segment.role !== "OPEN_LOOP").every((segment) => segment.sourceIds.length && segment.sourceIds.every((id) => valid.has(id))));
});

test("archive English remains claimText while Sarawak narration is natural Malay", () => {
  const spoken = rewriteArchiveClaimToMalay("1 missing, 7 saved after ship sinks off Sarawak", "DISAPPEARANCE");
  assert.match(spoken, /Tujuh orang berjaya diselamatkan/); assert.doesNotMatch(spoken, /\b(?:missing|saved|ship|sinks|KUCHING)\b/i);
  const claim = { ...extractClaimsFromSource(candidate(), source())[0], spokenText: spoken };
  const quality = assessNarrationQuality([claim]); assert.equal(quality.englishLeakageCount, 0); assert.equal(quality.ocrLeakageCount, 0);
});

test("cluster integrity splits similar generic headlines from distant years", () => {
  const first = source("a"); const distant = { ...source("b"), publishedAt: "1968-03-01T00:00:00.000Z", metadata: { extractedLocations: ["Johor"], extractedPeople: [] } };
  const result = validateSourceCluster([first, distant]); assert.equal(result.coherent, false); assert.equal(result.clusters.length, 2); assert.equal(result.confidence, "LOW");
});

test("READY rejects raw English narration even when evidence is sourced", () => {
  const sources = [source("s1", "Publisher One"), source("s2", "Publisher Two")]; const base = extractClaimsFromSource(candidate(), sources[0])[0];
  const claims = Array.from({ length: 4 }, (_, index) => ({ ...base, id: `bad-${index}`, spokenText: "Search still on for the missing person after the report.", sourceIds: [sources[index % 2].id] }));
  const metrics = calculateResearchMetrics(claims, sources, "DISAPPEARANCE"); const quality = assessNarrationQuality(claims);
  assert.equal(quality.passes, false); assert.equal(decideResearchReadiness(claims, sources, metrics, true, true, false, "HIGH", quality).status, "PARTIAL");
});
