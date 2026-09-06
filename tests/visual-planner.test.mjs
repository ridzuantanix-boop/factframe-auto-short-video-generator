import assert from "node:assert/strict";
import test from "node:test";
import { dedupeAssets, validAsset } from "../src/lib/visual/assetQuality.ts";
import { planEvidenceAwareVisuals } from "../src/lib/visual/planner.ts";
import { buildMysteryScript } from "../src/lib/mystery/storyEngine.ts";

const story = { id: "nuri-test", title: "Copter goes missing in Sarawak", country: "Malaysia", region: "Sarawak", locations: ["Ba'Kelalan", "Sarawak"], people: ["Royal Malaysian Air Force"], year: 2004, decade: "2000-an", category: "HISTORICAL_MYSTERY", caseStatus: "SOLVED",
  summary: "Nuri helicopter incident", entityIds: [], sourceHints: ["Archive"], visualSearchTerms: ["Nuri helicopter Sarawak", "Royal Malaysian Air Force Nuri", "Ba'Kelalan Sarawak"], researchScore: 1, visualScore: 0,
  sourceCoveragePotential: "good", sources: [{ id: "s1", title: "Copter goes missing in Sarawak", publisher: "Archive", type: "ARCHIVAL", url: "https://example.test/news", date: "2004-08-16", accessedAt: "2026-09-06", reliabilityLevel: "ARCHIVAL" }],
  claims: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, claim: `claim ${i}`, narration: i === 1 ? "Helikopter ditemukan 15 kilometer dari Ba'Kelalan, Sarawak." : `Fakta Nuri bernombor ${i}.`, type: "VERIFIED", confidence: "HIGH", sourceIds: ["s1"], priority: i === 0 ? "HOOK_WORTHY" : i === 7 ? "PAYOFF" : "ESCALATION_DETAIL", visualIntent: i === 1 ? "LOCATION" : "ARCHIVAL_PHOTO" })) };
const script = (duration = 18) => ({ storyId: story.id, title: story.title, durationTarget: duration, tone: "DOCUMENTARY", hook: "h", openLoop: "", caseStatus: "SOLVED", segments: story.claims.map((claim) => ({ role: "ESCALATION", text: claim.narration, claimIds: [claim.id], sourceIds: claim.sourceIds, claimType: claim.type, visualIntent: claim.visualIntent })), payoff: "p", storytellingScore: 10, structureScore: 1, sourceQualityScore: 1, narrationQualityScore: 1, repetitionScore: 1, sourceCoverage: 1, unsupportedClaims: 0, sources: story.sources, showSourceNote: true });
const asset = (id, relevanceType = "GENERIC_CONTEXT", extra = {}) => ({ id, storyCandidateId: story.id, sourceId: null, providerAssetId: id, assetType: "ENTITY_IMAGE", provider: "WIKIMEDIA_COMMONS", url: `https://example.test/${id}.jpg`, thumbnailUrl: "", originalUrl: `https://commons.wikimedia.org/${id}`, title: id, description: id, creator: "creator", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", attribution: id, publishedAt: null, relevanceScore: .5, relevanceType, representationType: relevanceType === "EXACT_EVENT" ? "EXACT" : "CONTEXTUAL", visualRole: "ARCHIVAL_PHOTO", usageStatus: "REUSABLE", contentHash: id, metadata: { width: 1280, height: 720 }, ...extra });
const provider = (...values) => ({ id: "WIKIMEDIA_COMMONS", async search() { return values.map((value) => structuredClone(value)); } });

test("exact asset outranks generic and contextual remains honestly labeled", async () => {
  const plan = await planEvidenceAwareVisuals(story, script(), { providers: [provider(asset("generic"), asset("exact", "EXACT_EVENT"))] });
  const chosen = plan.assets.find((item) => item.id === plan.segments[0].assetIds[0]); assert.equal(chosen.relevanceType, "EXACT_EVENT");
  assert.equal(plan.assets.find((item) => item.providerAssetId === "generic").representationType, "CONTEXTUAL");
});
test("license is required and copyrighted reference is not reusable", async () => {
  assert.equal(validAsset(asset("unlicensed", "EXACT_ENTITY", { license: "", usageStatus: "REUSABLE" })), false);
  assert.equal(validAsset(asset("noncommercial", "EXACT_ENTITY", { license: "CC BY-NC 4.0", usageStatus: "REUSABLE" })), false);
  const restricted = asset("news", "EXACT_EVENT", { license: "All rights reserved", usageStatus: "RESTRICTED_REFERENCE" });
  const plan = await planEvidenceAwareVisuals(story, script(), { providers: [provider(restricted)] }); assert.ok(plan.fallbackCoverage > 0);
});
test("duplicate Commons ID, canonical URL, and hash are deduped", () => {
  const first = asset("same"), second = asset("same", "EXACT_ENTITY", { id: "other" }); assert.equal(dedupeAssets([first, second]).length, 1);
});
test("real map result works for a location beat", async () => {
  const map = asset("map", "EXACT_PLACE", { assetType: "MAP", provider: "OPENSTREETMAP", license: "ODbL 1.0", metadata: { lat: 3.9, lon: 115.6 } });
  const plan = await planEvidenceAwareVisuals(story, script(), { providers: [provider(map)] });
  const location = plan.segments[1]; assert.equal(plan.assets.find((item) => item.id === location.assetIds[0]).assetType, "MAP");
});
test("script segments retain claim and source linkage", () => {
  const result = buildMysteryScript({ ...story, supportedDurationSeconds: 18 }, 18, "DOCUMENTARY", true);
  assert.deepEqual(result.segments[0].claimIds, ["c0"]); assert.deepEqual(result.segments[0].sourceIds, ["s1"]);
});
test("duration controls scene count without over-cutting", async () => {
  const micro = await planEvidenceAwareVisuals(story, script(10), { providers: [provider(asset("one"))] });
  const long = await planEvidenceAwareVisuals(story, script(50), { providers: [provider(asset("two"))] });
  assert.equal(micro.segments.length, 4); assert.equal(long.segments.length, 8);
});
test("broken asset is rejected", () => { assert.equal(validAsset(asset("broken", "EXACT_EVENT", { metadata: { width: 1280, height: 720, broken: true } })), false); });
