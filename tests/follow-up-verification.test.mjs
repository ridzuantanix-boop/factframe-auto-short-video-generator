import assert from "node:assert/strict";
import test from "node:test";
import { evaluateVerification, hasStrongContinuity, requiresFollowUp, runFollowUpVerification } from "../src/lib/research/followUpResearch.ts";
import { rewriteArchiveClaimToMalay } from "../src/lib/research/narrationRewriter.ts";
import { calculateResearchMetrics, decideResearchReadiness } from "../src/lib/research/researchScoring.ts";

const source = (id, publishedAt, extra = {}) => ({ id, storyCandidateId: "story", provider: "ARCHIVE", sourceType: "ARCHIVAL_NEWSPAPER", title: "Aircraft report",
  publisher: "Archive", url: `https://example.test/${id}`, publishedAt, accessedAt: "2026-09-05T00:00:00Z", snippet: "Nuri aircraft with 10 people near Ba Kelalan",
  metadata: {}, reliabilityLevel: "ARCHIVAL_NEWSPAPER", ...extra });
const claim = (id, text, type, sourceId, eventDate) => ({ id, storyCandidateId: "story", claimText: text, spokenText: text, normalizedClaim: text.toLowerCase(), claimType: type,
  confidence: "MEDIUM", sourceIds: [sourceId], eventDate, people: ["Royal Malaysian Air Force"], locations: ["Ba Kelalan"], priority: "ESSENTIAL_CONTEXT",
  visualIntent: "TIMELINE", ocrQuality: .9, rewriteMethod: "DETERMINISTIC", rewriteModel: null, validatedAt: "2026-09-05T00:00:00Z", validationVersion: "test", validationResult: null });

test("unresolved historical report triggers follow-up", () => {
  const initial = claim("initial", "The Nuri helicopter was reported missing.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z");
  assert.equal(requiresFollowUp([initial]), true);
  const result = evaluateVerification([initial], [source("s1", initial.eventDate)]);
  assert.equal(result.verificationType, "HISTORICAL_FOLLOW_UP"); assert.equal(result.verificationStatus, "PENDING");
});

test("later resolution changes final state while preserving the historical claim", () => {
  const initial = claim("initial", "The Nuri helicopter was reported missing.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z");
  const original = structuredClone(initial); const found = claim("found", "The Nuri helicopter was found the next day.", "EXPLAINED_LATER", "s2", "2004-08-17T00:00:00Z");
  const result = evaluateVerification([initial, found], [source("s1", initial.eventDate), source("s2", found.eventDate)]);
  assert.equal(result.latestKnownState, "FOUND"); assert.equal(result.verificationStatus, "VERIFIED"); assert.deepEqual(initial, original);
});

test("unrelated later event is rejected despite the same town and incident type", () => {
  const candidate = { title: "Copter goes missing", summary: "RMAF Nuri with 10 people near Ba Kelalan" };
  const pkg = { people: ["Royal Malaysian Air Force"], locations: ["Ba Kelalan"] };
  const unrelated = { provider: "NEWS", providerId: "other", sourceType: "ARCHIVAL_NEWSPAPER", title: "Tourist found after crash near Ba Kelalan", publisher: "News",
    url: "https://example.test/other", publishedAt: "2004-08-17T00:00:00Z", accessedAt: "2026-09-05T00:00:00Z", snippet: "A different tourist was found after a road crash.",
    originalLocationTerms: ["Ba Kelalan"], people: [], metadata: {}, reliabilityLevel: "REPUTABLE_JOURNALISM" };
  assert.equal(hasStrongContinuity(candidate, pkg, [source("s1", "2004-08-16T00:00:00Z")], unrelated), false);
});

test("no credible follow-up remains PARTIAL and READY is blocked while PENDING", () => {
  const initial = claim("initial", "Pesawat itu dilaporkan hilang dan masih dicari di Ba Kelalan.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z");
  const sources = [source("s1", initial.eventDate)]; const verification = evaluateVerification([initial], sources);
  const metrics = calculateResearchMetrics([initial], sources, "DISAPPEARANCE", true);
  const quality = { malayLanguageRatio: 1, englishLeakageCount: 0, ocrLeakageCount: 0, fragmentCount: 0, unnaturalPhraseCount: 0, headlineLeakageCount: 0, spokenNaturalnessScore: 1, passes: true };
  assert.equal(verification.verificationStatus, "PENDING");
  assert.equal(decideResearchReadiness([initial], sources, metrics, true, true, verification.verificationStatus, "HIGH", quality).status, "PARTIAL");
});

test("verified closed historical case has no recurring TTL", () => {
  const initial = claim("initial", "Pesawat dilaporkan hilang.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z");
  const found = claim("found", "Pesawat ditemukan sehari kemudian.", "EXPLAINED_LATER", "s2", "2004-08-17T00:00:00Z");
  const result = evaluateVerification([initial, found], [source("s1", initial.eventDate), source("s2", found.eventDate)]);
  assert.equal(result.verificationStatus, "VERIFIED"); assert.equal(result.verificationTTL, null); assert.equal(result.nextVerificationDue, null);
});

test("current mutable fact becomes stale after its TTL", () => {
  const current = claim("current", "Individu itu masih memegang jawatan semasa.", "VERIFIED", "s1", "2026-08-01T00:00:00Z");
  const result = evaluateVerification([current], [source("s1", current.eventDate)], { mutableCurrent: true, now: "2026-09-05T00:00:00Z",
    prior: { verificationType: "CURRENT_VERIFICATION", verificationStatus: "VERIFIED", verifiedAt: "2026-08-20T00:00:00Z" } });
  assert.equal(result.verificationStatus, "STALE"); assert.equal(result.requiresCurrentVerification, true);
});

test("living office-holder, active-company and ongoing-investigation shapes use generic freshness gates", () => {
  for (const text of ["Pemegang jawatan itu masih mengetuai kerajaan semasa.", "Syarikat aktif itu masih diketuai pengarah semasa."]) {
    const mutable = claim("mutable", text, "VERIFIED", "s1", "2026-09-01T00:00:00Z");
    assert.equal(evaluateVerification([mutable], [source("s1", mutable.eventDate)], { mutableCurrent: true }).verificationStatus, "PENDING");
  }
  const investigation = claim("ongoing", "Polis masih menjalankan siasatan terhadap kejadian itu.", "REPORTED", "s1", "2026-09-01T00:00:00Z");
  assert.equal(requiresFollowUp([investigation]), true);
});

test("verified closed historical case does not call providers again", async () => {
  let calls = 0; const pkg = { claims: [claim("initial", "Pesawat dilaporkan hilang.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z")],
    verificationType: "HISTORICAL_FOLLOW_UP", verificationStatus: "VERIFIED" };
  const result = await runFollowUpVerification({ title: "Historical aircraft", summary: "", region: "" }, pkg, [source("s1", "2004-08-16T00:00:00Z")], {},
    [{ id: "SHOULD_NOT_RUN", async search() { calls += 1; return []; } }]);
  assert.equal(calls, 0); assert.equal(result.searches, 0);
});

test("Nuri Ba Kelalan follow-up produces sourced Malay resolution claims", () => {
  const found = rewriteArchiveClaimToMalay("The Nuri helicopter was found in a forested area about 1,500m above sea level, 15km from Ba'Kelalan.", "DISAPPEARANCE");
  const deaths = rewriteArchiveClaimToMalay("Three Royal Malaysian Air Force personnel were killed in the crash.", "DISAPPEARANCE");
  const survivors = rewriteArchiveClaimToMalay("Seven people survived the crash.", "DISAPPEARANCE");
  assert.match(found, /Helikopter Nuri ditemukan.*Ba'Kelalan/i); assert.match(deaths, /Tiga anggota Tentera Udara Diraja Malaysia maut/i); assert.match(survivors, /Tujuh orang terselamat/i);
  const initial = claim("initial", "Helikopter Nuri dilaporkan hilang berhampiran Ba Kelalan.", "UNRESOLVED", "s1", "2004-08-16T00:00:00Z");
  const outcomeClaims = [found, deaths, survivors].map((text, index) => claim(`outcome-${index}`, text, "EXPLAINED_LATER", "s2", "2004-08-17T00:00:00Z"));
  const result = evaluateVerification([initial, ...outcomeClaims], [source("s1", initial.eventDate), source("s2", outcomeClaims[0].eventDate)]);
  assert.equal(result.latestKnownState, "RESOLVED"); assert.equal(result.resolutionClaimIds.length, 3); assert.deepEqual(result.resolutionSourceIds, ["s2"]);
});
