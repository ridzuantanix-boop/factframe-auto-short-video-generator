import type { Job, PublicJob } from "../src/lib/pawarna/types";
import { customerError } from "../src/lib/pawarna/customer-status";
export type CloudJob = Omit<Job, "input"> & { input_key: string; image_count: number; has_avatar: boolean; thumbnail_type: string; controlled_test?: { sequence:number; epoch:string; finished_at?:number; evaluation:import("./test-types").Evaluation } };
export function publicJob(job: CloudJob): PublicJob {
  const { id, stage, created_at, updated_at, external_job_id, product, research, plan, retry_count, error, duration_seconds, parent_generation_id, segment_number, has_avatar, image_count } = job;
  return { settings: job.settings, id, stage, created_at, updated_at, external_job_id, product, research, plan: plan ? { ...plan, video_prompt: "" } : undefined, retry_count, error: customerError(error), duration_seconds, parent_generation_id, segment_number, has_avatar, image_count,
    thumbnail_url: `/api/factory/jobs/${id}/media?type=thumbnail`, video_url: job.video_path ? `/api/factory/jobs/${id}/media` : undefined };
}
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function hash(value: string) { return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex"); }
export async function readBody(request: Request, max = 17 * 1024 * 1024): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > max || !request.body) throw new Error("Jumlah gambar maksimum 12 MB untuk versi cloud.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new Error("Jumlah gambar maksimum 12 MB untuk versi cloud."); } chunks.push(value); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Permintaan tidak sah.");
  return body;
}
export function parseRange(value: string | null, size: number): { offset: number; length: number } | null | false {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !size || !match[1] && !match[2]) return false;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) return false; const length = Math.min(size, suffix); return { offset: size - length, length }; }
  const offset = Number(match[1]); const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return false;
  return { offset, length: end - offset + 1 };
}
