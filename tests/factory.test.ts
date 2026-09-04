import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NexabotProvider, ProviderError } from "../src/services/nexabot/provider";
import { buildVideoPrompt } from "../src/lib/pawarna/prompt";
import { decodeImage, validateInput } from "../src/lib/pawarna/validation";
import type { JobInput, ProductAnalysis, ContentPlan } from "../src/lib/pawarna/types";
import sharp from "sharp";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
test("i2v maps product and avatar without undocumented fields; uncertain POST is never silently retried", async () => {
  process.env.NEXABOT_API_KEY = "test-only";
  let calls = 0;
  globalThis.fetch = (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body).sort(), ["media", "mode", "prompt", "ratio"]);
    assert.deepEqual(body, { mode: "i2v", media: ["product", "avatar"], ratio: 2, prompt: "test" });
    return Response.json({ ok: true, job_id: "abc123", credit_cost: .5 }, { status: 202 });
  }) as typeof fetch;
  const provider = new NexabotProvider();
  assert.deepEqual(await provider.createJob({ media: ["product", "avatar"], prompt: "test", duration_seconds: 10 }), { id: "abc123", cost: .5 });
  assert.equal(calls, 1);
  globalThis.fetch = (async () => { calls++; throw new Error("network"); }) as typeof fetch;
  await assert.rejects(provider.createJob({ media: ["x"], prompt: "x", duration_seconds: 10 }), (e: unknown) => e instanceof ProviderError && e.kind === "uncertain");
  assert.equal(calls, 2);
  await assert.rejects(provider.getJob("abc123"), (e: unknown) => e instanceof ProviderError && e.kind === "unavailable");
  globalThis.fetch = originalFetch;
});
test("persistent idempotency and owner isolation", async () => {
  process.env.PAWARNA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pawarna-test-"));
  const store = await import("../src/lib/pawarna/store");
  const input: JobInput = { images: ["fixture"], mode: "Auto", instructions: "", angle_seed: "default" };
  const a = store.createJob("owner-a", "same-action", input);
  const b = store.createJob("owner-a", "same-action", input);
  assert.equal(a.id, b.id);
  assert.equal(store.listJobs("owner-a").length, 1);
  assert.equal(store.listJobs("owner-b").length, 0);
  assert.throws(() => store.createJob("owner-a", "same-action", { ...input, instructions: "changed" }));
  assert.equal(store.getJob(a.id)?.stage, "queued");
  const publicData = store.publicJob(a);
  assert.equal("input" in publicData, false); assert.equal("owner" in publicData, false);
  assert.equal("provider_requests" in publicData, false);
  const claimed = store.claimJob()!;
  assert.equal(claimed.id, a.id); assert.equal(store.claimJob(), undefined);
});
test("validate actual image bytes and all 5 photos plus avatar without altering them", async () => {
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString("base64")}`;
  const result = await validateInput({ images: [image, image, image, image, image], avatar: image });
  assert.equal(result.images.length, 5); assert.equal(result.images[0], image); assert.equal(result.avatar, image);
  await assert.rejects(validateInput({ images: [image.replace("image/png", "image/jpeg")] }));
  await assert.rejects(validateInput({ images: Array(6).fill(image) }));
  assert.throws(() => decodeImage("data:image/png;base64,aaaa"));
});
test("prompt locks packaging, avatar role, book and Malaysian audio", () => {
  const product = { name: "Buku", description: "Buku biru" } as ProductAnalysis;
  const plan = { mode: "Book Creator", script: "Tengok buku ini. Klik link kat bawah.", angle: "curiosity", visual_direction: "hold book" } as ContentPlan;
  const prompt = buildVideoPrompt(product, plan, true, 2, "Jangan sebut harga.");
  for (const rule of ["image 3", "CREATOR AVATAR", "SPOKEN SCRIPT", "Zero generated on-screen text", "unseen pages", "Bahasa Melayu Malaysia", "cap, bottle, label layout", "actual moving scene footage"]) assert.ok(prompt.includes(rule), rule);
  assert.equal(prompt.includes("sfv"), false);
});
