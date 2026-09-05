import assert from "node:assert/strict";
import test from "node:test";
import { validateClaimRewrite, validateRewriteSet, CLAIM_VALIDATION_VERSION } from "../src/lib/research/aiClaimValidator.ts";
import { enrichCandidateWithAi } from "../src/lib/research/aiEnrichment.ts";
import { buildMysteryScript } from "../src/lib/mystery/storyEngine.ts";
import { deepenLinkedSources } from "../src/lib/research/sourceDeepening.ts";

const claim = (overrides = {}) => ({ id: "claim-1", storyCandidateId: "candidate-1", claimText: "Police reported that 7 people were missing in Sarawak",
  spokenText: "", normalizedClaim: "police reported 7 people missing sarawak", claimType: "REPORTED", confidence: "MEDIUM", sourceIds: ["source-1"],
  eventDate: "1950-01-01T00:00:00.000Z", people: [], locations: ["Sarawak"], priority: "ESSENTIAL_CONTEXT", visualIntent: "DOCUMENT", ocrQuality: .9,
  rewriteMethod: "NONE", rewriteModel: null, validatedAt: null, validationVersion: null, validationResult: null, ...overrides });
const output = (overrides = {}) => ({ claimId: "claim-1", spokenText: "Menurut laporan polis, 7 orang masih hilang di Sarawak.", preservedClaimType: "REPORTED", preservedSourceIds: ["source-1"], ...overrides });

test("AI claim validation keeps source IDs immutable and rejects unknown claim IDs", () => {
  assert.equal(validateClaimRewrite(claim(), output({ preservedSourceIds: ["invented"] })).valid, false);
  const result = validateRewriteSet([claim()], [output({ claimId: "unknown" })]); assert.equal(result.accepted.length, 0); assert.match(result.rejected[0].result.reasons.join(" "), /unknown claim ID/);
});

test("AI claim validation rejects added dates and changed numbers", () => {
  assert.match(validateClaimRewrite(claim(), output({ spokenText: "Menurut laporan polis pada 1963, 7 orang masih hilang di Sarawak." })).reasons.join(" "), /date/);
  assert.match(validateClaimRewrite(claim(), output({ spokenText: "Menurut laporan polis, 8 orang masih hilang di Sarawak." })).reasons.join(" "), /numbers/);
});

test("uncertainty and folklore cannot become factual assertions", () => {
  const unresolved = claim({ claimType: "UNRESOLVED", claimText: "The location of the missing man was not known" });
  assert.equal(validateClaimRewrite(unresolved, output({ spokenText: "Lelaki itu berada di bandar.", preservedClaimType: "UNRESOLVED" })).valid, false);
  const folklore = claim({ claimType: "FOLKLORE", claimText: "Residents reported a legend about a white figure", sourceIds: ["s"] });
  const result = validateClaimRewrite(folklore, output({ preservedClaimType: "FOLKLORE", preservedSourceIds: ["s"], spokenText: "Susuk putih itu muncul di situ." }));
  assert.match(result.reasons.join(" "), /folklore/);
});

test("natural Malaysian Malay rewrite passes strict validation", () => {
  assert.equal(validateClaimRewrite(claim(), output()).valid, true);
});

function fixtureStore(fixtureClaim) {
  const candidate = { id: "candidate-1", canonicalEntityId: null, canonicalUrl: null, title: "Laporan orang hilang", normalizedTitle: "laporan orang hilang", slug: "laporan-orang-hilang",
    summary: "Laporan arkib", country: "Malaysia", region: "Sarawak", category: "archive", storyType: "DISAPPEARANCE", status: "PARTIAL", sourceCount: 1, claimCount: 1,
    researchScore: .5, visualScore: null, narrativePotentialScore: .5, sourceHints: [], searchTerms: [], aliases: [], metadata: { archiveDerived: true, historicalContext: "SARAWAK" },
    discoveredAt: "2026-01-01T00:00:00.000Z", lastResearchedAt: null, lastVerifiedAt: null, updatedAt: "2026-01-01T00:00:00.000Z", originProvider: "TEST", originQuery: "test" };
  const source = { id: "source-1", storyCandidateId: candidate.id, provider: "TEST", sourceType: "ARCHIVAL_NEWSPAPER", title: "Missing report", publisher: "Archive",
    url: "https://example.test/source", publishedAt: "1950-01-01T00:00:00.000Z", accessedAt: "2026-01-01T00:00:00.000Z", snippet: fixtureClaim.claimText,
    metadata: { expandedSnippet: fixtureClaim.claimText, extractedLocations: ["Sarawak"] }, reliabilityLevel: "ARCHIVAL_NEWSPAPER" };
  let saved; const pkg = { storyCandidateId: candidate.id, title: candidate.title, summary: candidate.summary, storyType: candidate.storyType, historicalContext: "SARAWAK",
    sources: [], claims: [fixtureClaim], timeline: [], people: [], locations: ["Sarawak"], hookCandidates: [], keyTurningPoints: [], unresolvedQuestions: [], payoff: { text: "", claimIds: [], sourceIds: [] },
    clusterConfidence: "MEDIUM", narrationQuality: { malayLanguageRatio: 0, englishLeakageCount: 0, ocrLeakageCount: 0, fragmentCount: 0, headlineLeakageCount: 0, spokenNaturalnessScore: 0, passes: false },
    sourceCoverage: 1, unsupportedClaimCount: 0, sourceDiversityScore: .3, claimDiversityScore: .3, ocrQualityScore: .9, researchScore: .5, narrativePotentialScore: .4,
    estimatedNarrationSeconds: 8, readyDecision: { status: "PARTIAL", reasons: [] }, requiresCurrentVerification: false, lastResearchedAt: "2026-01-01T00:00:00.000Z", lastVerifiedAt: "2026-01-01T00:00:00.000Z" };
  return { findById: async () => candidate, getResearchPackage: async () => pkg, listSourcesForCandidate: async () => [source], updateSourceEnrichment: async () => {},
    persistResearchPackage: async (_candidate, _claims, value) => { saved = value; }, get saved() { return saved; } };
}

test("Gemini failure falls back without promoting READY", async () => {
  const store = fixtureStore(claim()); const gateway = { model: "test", rewrite: async () => { throw new Error("quota"); }, writeStory: async () => { throw new Error("unused"); } };
  const result = await enrichCandidateWithAi("candidate-1", gateway, store); assert.equal(result.rewritten, 0); assert.equal(result.package.readyDecision.status, "PARTIAL"); assert.match(result.failures[0].reasons[0], /quota/);
});

test("validated cached Gemini rewrite is reused without a new request", async () => {
  const resultValue = { valid: true, reasons: [], checkedAt: "2026-01-01T00:00:00.000Z", version: CLAIM_VALIDATION_VERSION };
  const cached = claim({ spokenText: output().spokenText, rewriteMethod: "GEMINI", rewriteModel: "test", validatedAt: resultValue.checkedAt, validationVersion: CLAIM_VALIDATION_VERSION, validationResult: resultValue });
  const store = fixtureStore(cached); const gateway = { model: "test", rewrite: async () => { throw new Error("must not run"); }, writeStory: async () => { throw new Error("unused"); } };
  const result = await enrichCandidateWithAi("candidate-1", gateway, store); assert.equal(result.cacheHits, 1); assert.equal(result.usage.requests, 0); assert.equal(result.package.claims[0].spokenText, cached.spokenText);
});

test("invalid AI output cannot promote a PARTIAL story", async () => {
  const claims = [1, 2, 3, 4].map((number) => claim({ id: `claim-${number}`, claimText: `Police reported that ${number} people were missing in Sarawak`, normalizedClaim: `report ${number}` }));
  const store = fixtureStore(claims[0]); store.getResearchPackage = async () => ({ ...(await fixtureStore(claims[0]).getResearchPackage()), claims });
  const gateway = { model: "test", rewrite: async () => ({ outputs: [{ ...output(), claimId: "unknown" }], usage: { requests: 1, inputTokens: 10, outputTokens: 5 } }), writeStory: async () => { throw new Error("unused"); } };
  const result = await enrichCandidateWithAi("candidate-1", gateway, store); assert.equal(result.package.readyDecision.status, "PARTIAL"); assert.equal(result.rewritten, 0);
});

test("validated AI narration is used by the video script path without a forced open loop", () => {
  const claims = ["HOOK_WORTHY", "ESSENTIAL_CONTEXT", "ESCALATION_DETAIL", "PAYOFF"].map((priority, index) => ({ id: `claim-${index + 1}`,
    claim: `Fakta ${index + 1}`, narration: `Fakta sah ${index + 1}.`, type: "VERIFIED", confidence: "HIGH", sourceIds: ["source-1"], priority, visualIntent: "DOCUMENT" }));
  const segments = ["HOOK", "CONTEXT", "DEVELOPMENT", "TURN_PAYOFF"].map((role, index) => ({ role, text: `Ayat naratif yang sah nombor ${index + 1}.`, claimIds: [`claim-${index + 1}`], sourceIds: ["source-1"] }));
  const story = { id: "story-1", title: "Cerita ujian", country: "Malaysia", region: "Johor", year: 1950, decade: "1950-an",
    category: "HISTORICAL_MYSTERY", caseStatus: "PARTIALLY_EXPLAINED", summary: "Ujian", entityIds: [], sourceHints: [], visualSearchTerms: [],
    researchScore: 1, visualScore: 0, sourceCoveragePotential: "good", sources: [{ id: "source-1", title: "Arkib", publisher: "Arkib",
      type: "ARCHIVAL", url: "https://example.test", accessedAt: "2026-01-01T00:00:00.000Z", reliabilityLevel: "ARCHIVAL" }], claims,
    aiNarration: { segments, model: "test", generatedAt: "2026-01-01T00:00:00.000Z", validationVersion: CLAIM_VALIDATION_VERSION } };
  const script = buildMysteryScript(story, 30, "DOCUMENTARY", true);
  assert.equal(script.hook, segments[0].text); assert.equal(script.openLoop, ""); assert.deepEqual(script.segments.map((segment) => segment.role), ["HOOK", "CONTEXT", "ESCALATION", "PAYOFF"]);
});

test("source deepening stores only a short public excerpt and caches the check", async () => {
  const source = { id: "source-1", snippet: "Short snippet", url: "https://example.test/public", metadata: {}, sourceType: "ARCHIVAL_NEWSPAPER" };
  let saved; const store = { updateSourceEnrichment: async (_id, metadata) => { saved = metadata; } };
  const html = `<meta name="description" content="${"This public description contains additional factual context for audit and grounded extraction. ".repeat(4)}">`;
  const result = await deepenLinkedSources([source], store, async () => new Response(html, { headers: { "content-type": "text/html" } }));
  assert.equal(result.enriched, 1); assert.ok(saved.expandedSnippet.length <= 1200); assert.equal(saved.expandedSnippetSource, source.url); assert.ok(saved.sourceDeepeningCheckedAt);
});
