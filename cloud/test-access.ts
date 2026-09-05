import { hash, json, readBody, type CloudJob } from "./utils";
import type { Env } from "./worker";
import type { Evaluation } from "./test-types";

export const SCORE_FIELDS = ["product_fidelity", "product_scale", "first_frame", "ugc_realism", "brightness_sharpness", "hands_anatomy", "voice_naturalness", "script_completion", "cta_completion", "shariah_aurat", "style_accuracy", "angle_accuracy", "overall"] as const;
export function evaluation(value: Record<string, unknown>): Evaluation {
  const result = { ...Object.fromEntries(SCORE_FIELDS.map(key => [key, null])), notes:"" } as Evaluation;
  for (const key of SCORE_FIELDS) {
    const score = value[key];
    if (score !== undefined && score !== null && (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5)) throw new Error("Skor mesti 1–5 atau null.");
    result[key] = score as number | null ?? null;
  }
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 4000)) throw new Error("Nota maksimum 4,000 aksara.");
  result.notes = String(value.notes || ""); return result;
}
export const testLimit = (env: Pick<Env, "PAWARNA_TEST_MAX_GENERATIONS">) => /^([1-9]|10)$/.test(env.PAWARNA_TEST_MAX_GENERATIONS || "") ? Number(env.PAWARNA_TEST_MAX_GENERATIONS) : 0;
export const testEnabled = (env: Env) => env.PAWARNA_TEST_GENERATION_ENABLED === "true" && (env.PAWARNA_TEST_TOKEN?.length || 0) >= 32 && testLimit(env) > 0;
export const LIMIT_MESSAGE = "Had ujian sebenar telah dicapai. Tiada generation baru dibenarkan.";
export class TestAccess {
  constructor(private ctx: DurableObjectState, private env: Env) {
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS test_sessions(owner TEXT PRIMARY KEY, epoch TEXT NOT NULL, expires INTEGER NOT NULL, proof TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS test_counters(key TEXT PRIMARY KEY, value INTEGER NOT NULL);`);
  }
  count(key: string) { return this.ctx.storage.sql.exec<{value:number}>("SELECT value FROM test_counters WHERE key=?", key).toArray()[0]?.value || 0; }
  private increment(key: string) { this.ctx.storage.sql.exec("INSERT INTO test_counters VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1", key); return this.count(key); }
  async epoch() { return (this.env.PAWARNA_TEST_TOKEN?.length || 0) >= 32 ? hash(this.env.PAWARNA_TEST_TOKEN!) : ""; }
  async authorized(owner: string, expectedEpoch?: string, proof?: string) {
    const epoch = await this.epoch();
    return !!epoch && (!expectedEpoch || expectedEpoch === epoch) && this.granted(owner, epoch, proof);
  }
  granted(owner: string, epoch: string, proof?: string) {
    const row = this.ctx.storage.sql.exec<{epoch:string;expires:number;proof:string}>("SELECT epoch,expires,proof FROM test_sessions WHERE owner=?", owner).toArray()[0];
    return !!row && row.epoch === epoch && row.expires > Date.now() && (proof === undefined || !!proof && row.proof === proof);
  }
  // Includes pending reservations; a burst cannot queue more paid work than the remaining cap.
  available() {
    const pending = this.ctx.storage.sql.exec<{n:number}>("SELECT COUNT(*) AS n FROM jobs WHERE json_extract(data,'$.controlled_test') IS NOT NULL AND stage NOT IN ('completed','failed') AND json_array_length(json_extract(data,'$.provider_requests'))=0").one().n;
    return Math.max(0, testLimit(this.env) - this.count("attempts") - pending);
  }
  reserve(epoch: string) {
    if (!testEnabled(this.env) || this.available() < 1) throw new Error(LIMIT_MESSAGE);
    return { sequence: this.increment("sequence"), epoch, evaluation: evaluation({}) };
  }
  // Called in the same SQLite transaction as persisting the submitting job checkpoint.
  claim(job: CloudJob, epoch: string) {
    if (!testEnabled(this.env) || !job.controlled_test || job.controlled_test.epoch !== epoch || !this.granted(job.owner, epoch)) throw new Error("Akses ujian telah tamat atau dibatalkan.");
    const row = this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM jobs WHERE id=?", job.id).one();
    const current: CloudJob = JSON.parse(row.data);
    if (current.provider_requests.length || current.stage === "submitting" || ["failed","completed"].includes(current.stage)) throw new Error("Permintaan ujian ini sudah diproses.");
    if (this.count("attempts") >= testLimit(this.env)) throw new Error(LIMIT_MESSAGE);
    this.increment("attempts");
  }
  report(job: CloudJob) {
    return { job_id:job.id, test_sequence:job.controlled_test!.sequence, timestamp:job.created_at, updated_at:job.updated_at,
      product_id:job.settings?.productId || null, product_name:job.product?.name, category:job.product?.category,
      settings:job.settings, research:job.research?.status, spoken_script:job.plan?.script, scene_plan:job.plan?.scene_plan,
      compiled_prompt:job.plan?.video_prompt, provider:"Nexabot", provider_job_id:job.external_job_id || null,
      status:job.stage, failure_reason:job.error || null, provider_attempt_count:job.provider_requests.length,
      attempts:job.provider_requests.map(({at,status,external_job_id})=>({at,status,provider_job_id:external_job_id || null})),
      output_url:job.video_path?`/api/factory/jobs/${job.id}/media`:null, output_path:job.video_path || null,
      requested_duration_seconds:job.duration_seconds, actual_duration_seconds:null,
      reference_preprocessing:job.reference_audit?.map((item,index)=>({...item,sanitized_preview_url:item.sanitization_applied?`/api/test/jobs/${job.id}/sanitized-reference/${index}`:null})),
      elapsed_seconds:job.controlled_test!.finished_at?Math.round((job.controlled_test!.finished_at-job.created_at)/1000):null,
      evaluation:job.controlled_test!.evaluation };
  }
  async route(request: Request, owner: string, save: (job: CloudJob)=>void) {
    const path = new URL(request.url).pathname;
    if (path === "/api/test/session" && request.method === "POST") {
      // The Worker strips all caller-provided authorization markers.
      if (request.headers.get("x-pawarna-test-login") === await this.epoch() && await this.epoch()) {
        const proof=request.headers.get("x-pawarna-test-proof") || "";if(!/^[a-f0-9]{64}$/.test(proof))return json({},403);
        this.ctx.storage.sql.exec("INSERT INTO test_sessions VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET epoch=excluded.epoch,expires=excluded.expires,proof=excluded.proof", owner, await this.epoch(), Date.now()+12*60*60*1000, proof);
        return new Response(null,{status:303,headers:{Location:"/#home"}});
      }
      return json({error:"Akses ujian tidak sah."},403);
    }
    if (path === "/api/test/logout" && request.method === "POST") {
      if(!await this.authorized(owner,undefined,request.headers.get("x-pawarna-test-proof") || ""))return json({},403);
      this.ctx.storage.sql.exec("DELETE FROM test_sessions WHERE owner=?",owner);
      return new Response(null,{status:303,headers:{Location:"/#home"}});
    }
    if (!await this.authorized(owner,undefined,request.headers.get("x-pawarna-test-proof") || "")) return json({error:"Akses pemilik diperlukan."},403);
    if (path === "/api/test/jobs" && request.method === "GET") {
      const jobs=this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM jobs WHERE owner=? AND json_extract(data,'$.controlled_test') IS NOT NULL ORDER BY created_at",owner).toArray().map(row=>this.report(JSON.parse(row.data)));
      return json({limit:testLimit(this.env),attempts:this.count("attempts"),remaining:this.available(),jobs});
    }
    const preview=/^\/api\/test\/jobs\/([a-f0-9-]{36})\/sanitized-reference\/(\d+)$/.exec(path);
    if(preview&&request.method==="GET"){
      const row=this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM jobs WHERE id=? AND owner=?",preview[1],owner).toArray()[0];if(!row)return json({},404);
      const job:CloudJob=JSON.parse(row.data),index=Number(preview[2]);if(!job.controlled_test||!job.reference_audit?.[index]?.sanitization_applied)return json({},404);
      const object=await this.env.MEDIA.get(`jobs/${job.id}/sanitized-reference-${index}`);return object?new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"image/webp","Cache-Control":"no-store"}}):json({},404);
    }
    const match=/^\/api\/test\/jobs\/([a-f0-9-]{36})\/evaluation$/.exec(path);
    if(match && request.method==="POST") {
      const row=this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM jobs WHERE id=? AND owner=?",match[1],owner).toArray()[0];
      if(!row)return json({},404);const job:CloudJob=JSON.parse(row.data);
      if(!job.controlled_test||job.stage!=="completed")return json({error:"Penilaian hanya untuk ujian siap."},409);
      try{job.controlled_test.evaluation=evaluation(await readBody(request,8192));save(job);return json({evaluation:job.controlled_test.evaluation});}catch{return json({error:"Skor 1–5 atau null; nota maksimum 4,000 aksara."},400);}
    }
    return json({},404);
  }
}
