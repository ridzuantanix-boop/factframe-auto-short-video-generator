// Explicit opt-in: this uses Gemini search/vision and one Nexabot job (one retry on failure).
// Public-domain test book cover from Project Gutenberg; no customer/avatar data.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.PAWARNA_RUN_LIVE !== "1") throw new Error("Set PAWARNA_RUN_LIVE=1 to run a paid live smoke test.");
  const base = "http://localhost:3100";
  const init = await fetch(`${base}/api/factory`);
  let cookie = init.headers.get("set-cookie")?.split(";")[0];
  let retrySource = "";
  if (process.argv.includes("--retry")) {
    const previous = JSON.parse(readFileSync(path.resolve("outputs/smoke-session.json"), "utf8"));
    cookie = previous.cookie; retrySource = previous.job_id;
  }
  const data = await init.json();
  if (!cookie || !data.ready.worker || !data.ready.gemini || !data.ready.nexabot) throw new Error("Factory not ready");
  const coverResponse = await fetch("https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg");
  if (!coverResponse.ok) throw new Error("Test cover unavailable");
  const cover = Buffer.from(await coverResponse.arrayBuffer());
  const headers = { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() };
  const body = JSON.stringify(retrySource ? { source_job: retrySource, action: "regenerate" } : { images: [`data:image/jpeg;base64,${cover.toString("base64")}`], mode: "Auto", instructions: "Promote only the visible book cover. No plot, story or unseen contents." });
  const submitted = await fetch(`${base}/api/generate`, { method: "POST", headers, body });
  const payload = await submitted.json();
  if (!submitted.ok) throw new Error(payload.error || "Submit failed");
  const duplicate = await fetch(`${base}/api/generate`, { method: "POST", headers, body });
  if ((await duplicate.json()).job?.id !== payload.job.id) throw new Error("Idempotency failed");
  console.log(`Live job: ${payload.job.id}; duplicate POST reused the same job.`);
  const output = path.resolve("outputs"); mkdirSync(output, { recursive: true });
  // Private local test artifact; kept out of git along with outputs.
  writeFileSync(path.join(output, "smoke-session.json"), JSON.stringify({ cookie, job_id: payload.job.id }));
  writeFileSync(path.join(output, "smoke-book-cover.jpg"), cover);
  let previous = "";
  for (let i = 0; i < 120; i++) {
    const status = await fetch(`${base}/api/factory`, { headers: { Cookie: cookie } }).then(r => r.json());
    const job = status.jobs.find((j: { id: string }) => j.id === payload.job.id);
    if (!job) throw new Error("Persisted job missing");
    if (job.stage !== previous) { console.log(`Stage: ${job.stage}`); previous = job.stage; }
    if (job.stage === "failed") throw new Error(job.error);
    if (job.stage === "completed") {
      const unauthorized = await fetch(`${base}${job.video_url}`);
      if (unauthorized.status !== 404) throw new Error("Private video ownership check failed");
      const range = await fetch(`${base}${job.video_url}`, { headers: { Cookie: cookie, Range: "bytes=0-31" } });
      if (range.status !== 206 || (await range.arrayBuffer()).byteLength !== 32) throw new Error("Video range support failed");
      const download = await fetch(`${base}${job.video_url}?download=1`, { headers: { Cookie: cookie } });
      const bytes = Buffer.from(await download.arrayBuffer());
      if (bytes.subarray(4, 8).toString() !== "ftyp") throw new Error("Invalid MP4");
      writeFileSync(path.join(output, "pawarna-live-smoke.mp4"), bytes);
      writeFileSync(path.join(output, "pawarna-live-smoke.json"), JSON.stringify(job, null, 2));
      console.log(JSON.stringify({ detected: job.product.name, confidence: job.product.confidence, mode: job.plan.mode, research: job.research.status, sources: job.research.sources.length, script: job.plan.script, bytes: bytes.length, ownership: "passed", range: "passed", file: path.join(output, "pawarna-live-smoke.mp4") }, null, 2));
      return;
    }
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error("Smoke test polling timed out; backend job remains in queue. Do not blindly resubmit.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Smoke failed"); process.exitCode = 1; });
