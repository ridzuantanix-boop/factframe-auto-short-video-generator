import { claimJob, getJob, heartbeat, saveJob, saveVideo } from "../src/lib/pawarna/store";
import type { Job, Stage } from "../src/lib/pawarna/types";
import { buildVideoPrompt } from "../src/lib/pawarna/prompt";
import { analyseProduct, researchProduct, createPlan } from "../src/services/pawarna/intelligence";
import { NexabotProvider, ProviderError } from "../src/services/nexabot/provider";

const provider = new NexabotProvider();
function stage(job: Job, next: Stage) { job.stage = next; saveJob(job); console.log(`[factory] ${job.id} ${next}`); }
async function runJob(job: Job) {
  const renew = setInterval(() => { job.lease_until = Date.now() + 300_000; saveJob(job); }, 60_000);
  try {
    // A crash during POST may have consumed credit. Never repeat an ambiguous submission.
    if (job.stage === "submitting" && !job.external_job_id) throw new ProviderError("uncertain", "Interrupted submission");
    if (!job.external_job_id && process.env.GENERATION_ENABLED === "false") { job.error = "Penghantaran dihentikan untuk semakan caj. Job ini tidak dihantar semula."; stage(job, "failed"); return; }
    if (job.parent_generation_id && !job.product) {
      const previous = getJob(job.parent_generation_id);
      if (previous?.owner === job.owner) {
        job.product = previous.product;
        job.research = previous.research;
        // A user-requested variation always receives a fresh director plan.
        saveJob(job);
      }
    }
    if (!job.product) { stage(job, "analysing"); job.product = await analyseProduct(job.input); saveJob(job); }
    if (!job.research) { stage(job, "researching"); job.research = await researchProduct(job.product); saveJob(job); }
    if (!job.plan) { stage(job, "planning"); job.plan = await createPlan(job.input, job.product, job.research); saveJob(job); }
    if (!job.external_job_id) {
      const selected = job.product.reference_indices.slice(0, job.input.avatar ? 2 : 3).map(i => job.input.images[i]);
      job.plan.video_prompt = buildVideoPrompt(job.product, job.plan, !!job.input.avatar, selected.length, job.input.instructions, job.input.settings);
      const media = job.input.avatar ? [...selected, job.input.avatar] : selected;
      job.provider_requests.push({ at: Date.now(), status: "submitting", cost: Number(process.env.NEXABOT_CREDIT_COST_PER_GENERATION || .5) });
      stage(job, "submitting");
      const result = await provider.createJob({ prompt: job.plan.video_prompt, media, duration_seconds: job.duration_seconds });
      job.external_job_id = result.id;
      Object.assign(job.provider_requests.at(-1)!, { external_job_id: result.id, cost: result.cost, status: "accepted" });
      stage(job, "processing");
    }
    if (Date.now() - job.provider_requests.at(-1)!.at > 25 * 60_000) throw new ProviderError("uncertain", "Provider job timeout");
    const externalId = job.external_job_id;
    if (!externalId) throw new ProviderError("uncertain", "Missing external mapping");
    const status = await provider.getJob(externalId);
    if (status === "done") {
      stage(job, "saving");
      saveVideo(job, await provider.getResult(externalId));
      job.provider_requests.at(-1)!.status = "done";
      job.error = undefined;
      stage(job, "completed");
    } else if (status === "failed") {
      Object.assign(job.provider_requests.at(-1)!, { status: "failed", refund_expected: true });
      job.error = "Nexabot melaporkan generation gagal. Retry automatik dimatikan; tiada penghantaran baru dibuat. Refund belum disahkan."; stage(job, "failed");
    } else stage(job, "processing");
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "unavailable") {
      // Preserve accepted job and retry status/download later, never re-submit.
      console.log(`[factory] ${job.id} provider temporarily unavailable`);
    } else {
      job.error = e instanceof ProviderError && e.kind === "uncertain"
        ? "Status penghantaran belum dapat disahkan. Semak job Nexabot sebelum menjana semula untuk elak caj berganda."
        : job.stage === "researching" ? "Carian sumber tidak berjaya. Cuba lagi sebentar lagi."
        : job.stage === "planning" ? "Skrip belum lulus semakan fakta. Cuba lagi atau gunakan gambar label lebih jelas."
        : job.stage === "analysing" ? "Gambar belum dapat dianalisis. Semak konfigurasi Gemini dan cuba lagi."
        : "Generation tidak dapat diteruskan. Semak konfigurasi dan baki penyedia.";
      // Do not log provider bodies, secrets, uploaded photos or personal data.
      const code = e && typeof e === "object" && "status" in e && typeof e.status === "number" ? e.status : "n/a";
      console.error(`[factory] ${job.id} failed stage=${job.stage} type=${e instanceof Error ? e.name : "unknown"} status=${code}`);
      if (e instanceof ProviderError && job.provider_requests.length) job.provider_requests.at(-1)!.status = e.kind;
      stage(job, "failed");
    }
  } finally { clearInterval(renew); job.lease_until = Date.now() + 8_000; saveJob(job); }
}
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
const pulse = setInterval(heartbeat, 5000);
async function main() {
  heartbeat(); console.log("[factory] Worker ready. Automatic paid retries disabled.");
  while (!stopping) { const job = claimJob(); if (job) await runJob(job); else await new Promise(r => setTimeout(r, 2000)); }
  clearInterval(pulse);
}
main().catch(() => { console.error("[factory] Worker stopped unexpectedly"); clearInterval(pulse); process.exitCode = 1; });
