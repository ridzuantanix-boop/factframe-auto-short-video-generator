import { STAGES, type PublicJob } from "./types";

// Explicit allowlist: no session cookie, API key, photo, prompt or private storage path.
export function jobDiagnostics(job: PublicJob, deployment: "local" | "cloud") {
  const time = (value: number) => Number.isFinite(value) ? new Date(value).toISOString() : "Tidak tersedia";
  return [
    "PAWARNA — Info job",
    `Persekitaran: ${deployment}`,
    `Job ID: ${job.id}`,
    `Nexabot ID: ${job.external_job_id || "Belum dihantar"}`,
    `Status: ${job.stage} — ${STAGES[job.stage]}`,
    `Dicipta (UTC): ${time(job.created_at)}`,
    `Kemas kini terakhir (UTC): ${time(job.updated_at)}`,
    `Cubaan semula: ${job.retry_count}`,
    `Research: ${job.research?.status || "Belum tersedia"}`,
    `Ralat: ${job.error || "Tiada"}`,
  ].join("\n");
}
