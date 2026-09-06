import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canGenerateStory, isPublicReadyPackage, supportedDurationLabel, userReadinessLabel } from "../src/lib/product/readiness.ts";
import { isApprovedAssetUrl } from "../src/lib/security/assetPolicy.ts";
import { consumeRateLimit, enforceRateLimit, resetRateLimitsForTests } from "../src/lib/server/rateLimit.ts";
import { ttsUnavailableResponse } from "../src/lib/server/ttsAvailability.ts";
import { renderCacheKey, selectRecorderMime } from "../src/lib/render/timeline.ts";

test("generation is disabled for PARTIAL and DISCOVERED stories", () => {
  assert.equal(canGenerateStory({ status: "PARTIAL" }), false);
  assert.equal(canGenerateStory({ status: "DISCOVERED" }), false);
  assert.equal(canGenerateStory({ status: "READY" }), true);
  assert.equal(userReadinessLabel("PARTIAL"), "Bahan belum cukup");
});

test("supported duration is presented as a recommendation", () => assert.equal(supportedDurationLabel(18), "Cadangan: 18 saat"));

test("public READY requires current integrity fields, not a stale status alone", () => {
  assert.equal(isPublicReadyPackage({ readyDecision: { status: "READY", reasons: [] } }), false);
  assert.equal(isPublicReadyPackage({ readyDecision: { status: "READY", reasons: [] }, supportedDurationSeconds: 18, verificationStatus: "VERIFIED" }), true);
});

test("download extension follows the actual recorder format", () => {
  assert.equal(selectRecorderMime((mime) => mime.startsWith("video/mp4")).extension, ".mp4");
  assert.equal(selectRecorderMime((mime) => mime.includes("vp8")).extension, ".webm");
});

test("sources panel presents attribution without exposing audit metadata", async () => {
  const source = await readFile(new URL("../src/components/Generator.tsx", import.meta.url), "utf8");
  assert.match(source, /Sumber &amp; kredit/); assert.match(source, /visual\.creator/); assert.match(source, /visual\.license/);
  assert.doesNotMatch(source, /Metadata eksport/);
});

test("all downstream cache inputs invalidate a render", () => {
  const base = renderCacheKey("research", "visual", "narration", "voice-a");
  assert.notEqual(base, renderCacheKey("research-follow-up", "visual", "narration", "voice-a"));
  assert.notEqual(base, renderCacheKey("research", "visual-new", "narration", "voice-a"));
  assert.notEqual(base, renderCacheKey("research", "visual", "narration-new", "voice-a"));
  assert.notEqual(base, renderCacheKey("research", "visual", "narration", "voice-b"));
});

test("expensive endpoint limiter rejects requests over policy", () => {
  resetRateLimitsForTests(); const policy = { name: "test", limit: 2, windowMs: 60_000 };
  assert.equal(consumeRateLimit("session", policy, 1).allowed, true);
  assert.equal(consumeRateLimit("session", policy, 2).allowed, true);
  assert.equal(consumeRateLimit("session", policy, 3).allowed, false);
});

test("changing the client session does not bypass the IP limit", () => {
  resetRateLimitsForTests(); const policy = { name: "route-test", limit: 1, windowMs: 60_000 };
  const first = new Request("https://factframe.test/api", { headers: { "x-real-ip": "203.0.113.9", "x-factframe-session": "a" } });
  const second = new Request("https://factframe.test/api", { headers: { "x-real-ip": "203.0.113.9", "x-factframe-session": "b" } });
  assert.equal(enforceRateLimit(first, policy), null);
  assert.equal(enforceRateLimit(second, policy)?.status, 429);
});

test("asset fetch allowlist blocks arbitrary and private-network URLs", () => {
  assert.equal(isApprovedAssetUrl("https://upload.wikimedia.org/example.jpg"), true);
  assert.equal(isApprovedAssetUrl("https://tile.openstreetmap.org/8/1/1.png"), true);
  assert.equal(isApprovedAssetUrl("http://127.0.0.1/admin"), false);
  assert.equal(isApprovedAssetUrl("https://evil.example/image.jpg"), false);
  assert.equal(isApprovedAssetUrl("https://user:pass@upload.wikimedia.org/x"), false);
});

test("missing online TTS configuration returns a graceful safe response", async () => {
  const response = ttsUnavailableResponse(); assert.equal(response.status, 503);
  assert.match((await response.json()).error, /suara tempatan/i);
});
