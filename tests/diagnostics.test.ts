import { test } from "node:test";
import assert from "node:assert/strict";
import { jobDiagnostics } from "../src/lib/pawarna/diagnostics";
import type { PublicJob } from "../src/lib/pawarna/types";
test("copy report contains status and provider ID but no private job payload", () => {
  const job = { id: "job-123", external_job_id: "provider-456", stage: "processing", created_at: 0, updated_at: 1000, retry_count: 0, owner: "secret-owner", input: { images: ["private-photo"] }, plan: { video_prompt: "private-prompt" }, research: { status: "unverified" } } as unknown as PublicJob;
  const report = jobDiagnostics(job, "cloud");
  for (const expected of ["job-123", "provider-456", "processing", "1970-01-01T00:00:01.000Z", "unverified"]) assert.ok(report.includes(expected));
  for (const secret of ["secret-owner", "private-photo", "private-prompt"]) assert.equal(report.includes(secret), false);
  assert.ok(jobDiagnostics({ ...job, external_job_id: undefined }, "local").includes("Belum dihantar"));
});
