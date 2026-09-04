import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateInput } from "../cloud/validation";
import { parseRange, publicJob, readBody, type CloudJob } from "../cloud/utils";
test("cloud image validation preserves bytes and checks MIME, counts and dimensions", async () => {
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString("base64")}`;
  const result = validateInput({ images: Array(5).fill(image), avatar: image });
  assert.equal(result.images[0], image); assert.equal(result.images.length, 5); assert.equal(result.avatar, image);
  assert.throws(() => validateInput({ images: [image.replace("image/png", "image/jpeg")] }));
  assert.throws(() => validateInput({ images: Array(6).fill(image) }));
  assert.throws(() => validateInput({ images: [image], instructions: "x".repeat(1001) }));
});
test("media supports byte ranges, suffixes and rejects invalid ranges", () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { offset: 0, length: 100 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { offset: 900, length: 100 });
  assert.deepEqual(parseRange("bytes=-50", 1000), { offset: 950, length: 50 });
  assert.deepEqual(parseRange("bytes=-2000", 1000), { offset: 0, length: 1000 });
  for (const value of ["bytes=-0", "bytes=1000-", "bytes=99-1", "bytes=0-9,20-29", "bytes=-"]) assert.equal(parseRange(value, 1000), false);
  assert.equal(parseRange(null, 1000), null);
});
test("cloud public jobs omit private storage paths, owner, prompt and provider records", () => {
  const job = { id: "test", owner: "secret-owner", input_key: "private-input", video_path: "private-video", has_avatar: true, image_count: 2, provider_requests: [{ secret: "private" }], plan: { video_prompt: "private-prompt" } } as unknown as CloudJob;
  const publicData = JSON.stringify(publicJob(job));
  for (const secret of ["secret-owner", "private-input", "private-video", "private-prompt", "provider_requests"]) assert.equal(publicData.includes(secret), false);
  assert.ok(publicData.includes("/api/factory/jobs/test/media"));
});
test("request body is bounded independently of Content-Length", async () => {
  await assert.rejects(readBody(new Request("http://local", { method: "POST", body: "123456" }), 3));
  await assert.rejects(readBody(new Request("http://local", { method: "POST", body: "[]" })));
});
