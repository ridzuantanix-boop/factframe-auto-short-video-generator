import { Products } from "./products";
import { validateSettings } from "../src/lib/pawarna/settings";
import { projectInput, type ProductProject } from "../src/lib/pawarna/projects";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./worker";
import { hash, json, parseRange, publicJob, readBody, type CloudJob } from "./utils";
import { validateInput } from "./validation";
import { decodeImage } from "../src/lib/pawarna/image";
import type { JobInput, Stage } from "../src/lib/pawarna/types";
import { analyseProduct, researchProduct, createPlan } from "../src/services/pawarna/intelligence";
import { buildVideoPrompt } from "../src/lib/pawarna/prompt";
import { NexabotProvider, ProviderError } from "../src/services/nexabot/provider";

const terminal = (job: CloudJob) => ["completed", "failed"].includes(job.stage);
type Row = { id: string; data: string; request_hash: string };
export class PawarnaFactory extends DurableObject<Env> {
  private products: Products;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.products = new Products(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, stage TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(owner,request_key));
      CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(owner,created_at);
      CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage,updated_at);
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  }
  private get(id: string): CloudJob | undefined {
    const row = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs WHERE id=?", id).toArray()[0];
    return row ? JSON.parse(row.data) : undefined;
  }
  private save(job: CloudJob, stage: Stage = job.stage) {
    job.stage = stage; job.updated_at = Date.now();
    this.ctx.storage.sql.exec("UPDATE jobs SET stage=?,updated_at=?,data=? WHERE id=?", job.stage, job.updated_at, JSON.stringify(job), job.id);
  }
  private consume(key: string, maximum: number, expires: number) {
    const row = this.ctx.storage.sql.exec<{ count: number }>("SELECT count FROM limits WHERE key=?", key).toArray()[0];
    if ((row?.count || 0) >= maximum) return false;
    this.ctx.storage.sql.exec("INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1", key, expires);
    return true;
  }
  private async schedule(delay = 1000) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > Date.now() + delay) await this.ctx.storage.setAlarm(Date.now() + delay);
  }
  async fetch(request: Request): Promise<Response> {
    // Only reachable through the private binding; the public worker authenticates the admin token.
    if (new URL(request.url).pathname === "/admin/audit" && request.method === "GET") {
      const rows = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs ORDER BY created_at DESC LIMIT 100").toArray();
      return json({ jobs: rows.map(row => { const job = JSON.parse(row.data) as CloudJob; return { id: job.id, product: job.product?.name, stage: job.stage, created_at: job.created_at, updated_at: job.updated_at, retry_count: job.retry_count, external_job_id: job.external_job_id, error: job.error, provider_requests: job.provider_requests }; }) });
    }
    const url = new URL(request.url); const owner = request.headers.get("x-pawarna-owner");
    if (!owner || !/^[a-f0-9]{64}$/.test(owner)) return json({ error: "Sesi tidak sah." }, 401);
    if (url.pathname === "/api/factory" && request.method === "GET") {
      const rows = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs WHERE owner=? ORDER BY created_at DESC LIMIT 30", owner).toArray();
      if (rows.some(row => !terminal(JSON.parse(row.data)))) await this.schedule(1000);
      return json({ products: this.products.list(owner), usage: rows.map(row => { const j: CloudJob = JSON.parse(row.data); return { id:j.id, name:j.product?.name || "Produk", attempts:j.provider_requests.length, recorded_cost:j.provider_requests.reduce((sum,r)=>sum+r.cost,0), stage:j.stage }; }), jobs: rows.map(row => publicJob(JSON.parse(row.data))), paused: this.env.GENERATION_ENABLED !== "true", ready: { gemini: !!this.env.GEMINI_API_KEY, nexabot: !!this.env.NEXABOT_API_KEY, worker: this.env.GENERATION_ENABLED === "true" }, deployment: "cloudflare", model: this.env.GEMINI_TEXT_MODEL });
    }
    if (url.pathname.startsWith("/api/products")) {
      try { return await this.products.route(request, owner, id => this.get(id)); } catch (e) { return json({error:e instanceof Error && /^(Upload|Gaya|Arahan|Imej|Had|Jumlah|Fail|Setiap)/.test(e.message) ? e.message : "Permintaan produk tidak sah."},400); }
    }
    const media = /^\/api\/factory\/jobs\/([a-f0-9-]{36})\/media$/.exec(url.pathname);
    if (media && ["GET", "HEAD"].includes(request.method)) return this.media(request, owner, media[1]);
    if (url.pathname !== "/api/generate" || request.method !== "POST") return json({ error: "Tidak ditemui." }, 404);
    if (this.env.GENERATION_ENABLED !== "true" || !this.env.GEMINI_API_KEY || !this.env.NEXABOT_API_KEY) return json({ error: "Generation dihentikan sementara untuk semakan caj. Tiada job baru dihantar." }, 503);
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) return json({ error: "Permintaan tidak sah. Refresh halaman." }, 400);
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM limits WHERE expires<?", now);
    if (!this.consume(`ip:${request.headers.get("x-pawarna-ip")}:${Math.floor(now / 60_000)}`, 10, now + 120_000)) return json({ error: "Terlalu banyak permintaan. Tunggu satu minit." }, 429);
    try {
      const body = await readBody(request);
      const fingerprint = await hash(JSON.stringify(body));
      const existing = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs WHERE owner=? AND request_key=?", owner, key).toArray()[0];
      if (existing) return existing.request_hash === fingerprint ? json({ job: publicJob(JSON.parse(existing.data)) }, 202) : json({ error: "Permintaan berulang mempunyai input berbeza." }, 409);
      let input: JobInput; let parent: CloudJob | undefined; let project: ProductProject | undefined;
      if (body.product_id) {
        project = this.products.get(String(body.product_id));
        if (!project || project.owner !== owner) return json({error:"Produk tidak ditemui."},404);
        if (project.stage !== "ready" || !project.product || !project.research) throw new Error("Tunggu analisis produk siap dahulu.");
        const saved = await this.products.input(project);
        if (body.avatar_source_job && !body.avatar) {
          const avatarJob=this.get(String(body.avatar_source_job));
          if(!avatarJob || avatarJob.owner!==owner)return json({error:"Avatar tidak ditemui."},404);
          const avatarObject=await this.env.MEDIA.get(avatarJob.input_key);
          if(!avatarObject)return json({error:"Avatar tidak ditemui."},404);
          body.avatar=(await avatarObject.json<JobInput>()).avatar;
        }
        input = validateInput({...saved, instructions:body.instructions || "", avatar:body.avatar, settings:validateSettings(body.settings,project.id)});
        input = projectInput(input,project); input.angle_seed = key;
      } else if (body.source_job) {
        if (!["another_angle", "regenerate"].includes(String(body.action))) throw new Error("Permintaan jana semula tidak sah.");
        parent = this.get(String(body.source_job));
        if (!parent || parent.owner !== owner) return json({ error: "Video tidak ditemui." }, 404);
        if (!terminal(parent)) throw new Error("Tunggu video asal siap dahulu.");
        const object = await this.env.MEDIA.get(parent.input_key);
        if (!object) throw new Error("Imej asal tidak ditemui.");
        input = await object.json<JobInput>();
        if (body.settings) {
          input.settings = validateSettings(body.settings, input.settings?.productId || "");
          if (!input.settings.subjectType.endsWith("_creator")) input.avatar = undefined;
          input = validateInput(input as unknown as Record<string, unknown>);
        }
        input.angle_seed = key; input.previous_hook = parent.plan?.hook;
      } else input = validateInput(body);
      const thumbnail = decodeImage(input.images[0]);
      const job: CloudJob = { settings: input.settings, id: crypto.randomUUID(), owner, input_key: "", image_count: input.images.length, has_avatar: !!input.avatar, thumbnail_type: thumbnail.mimeType, stage: "queued", created_at: now, updated_at: now, retry_count: 0, provider_requests: [], lease_until: now + 120_000, duration_seconds: 10, segment_number: 1, parent_generation_id: parent?.id,
        product: project?.product || parent?.product, research: project?.research || parent?.research, plan: undefined };
      job.input_key = `jobs/${job.id}/input.json`;
      // Reserve atomically before remote storage I/O. New sessions cannot bypass the global limits.
      const reserved = this.ctx.storage.transactionSync(() => {
        const duplicate = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs WHERE owner=? AND request_key=?", owner, key).toArray()[0];
        if (duplicate) return duplicate;
        const active = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE stage NOT IN ('completed','failed')").one().n;
        if (active >= Number(this.env.PAWARNA_MAX_ACTIVE || 3)) throw new Error("Tunggu video sedia ada siap dahulu (maksimum 3 job aktif).");
        const day = new Date(now).toISOString().slice(0, 10);
        if (!this.consume(`jobs:${day}`, Number(this.env.PAWARNA_DAILY_LIMIT || 20), now + 172_800_000)) throw new Error("Had harian studio dicapai. Cuba lagi esok.");
        this.ctx.storage.sql.exec("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)", job.id, owner, key, fingerprint, job.stage, now, now, JSON.stringify(job));
        return undefined;
      });
      if (reserved) return reserved.request_hash === fingerprint ? json({ job: publicJob(JSON.parse(reserved.data)) }, 202) : json({ error: "Permintaan berulang mempunyai input berbeza." }, 409);
      await this.schedule(120_000); // Recovers an interrupted upload without submitting an incomplete job.
      try {
        await this.env.MEDIA.put(job.input_key, JSON.stringify(input), { httpMetadata: { contentType: "application/json" } });
        await this.env.MEDIA.put(`jobs/${job.id}/thumbnail`, thumbnail.bytes, { httpMetadata: { contentType: thumbnail.mimeType } });
        job.lease_until = 0; this.save(job); await this.schedule();
      } catch { job.error = "Gambar belum berjaya disimpan di cloud. Cuba job baru."; this.save(job, "failed"); return json({ error: job.error }, 503); }
      return json({ job: publicJob(job) }, 202);
    } catch (error) {
      const message = error instanceof Error && /^(Upload|Hanya|Setiap|Fail|Gaya|Arahan|Imej|Permintaan|Tunggu|Jumlah|Had)/.test(error.message) ? error.message : "Permintaan tidak sah. Semak gambar dan cuba lagi.";
      return json({ error: message }, message.startsWith("Had") || message.startsWith("Tunggu") ? 429 : 400);
    }
  }
  private async media(request: Request, owner: string, id: string): Promise<Response> {
    const job = this.get(id); if (!job || job.owner !== owner) return json({ error: "Video tidak ditemui." }, 404);
    const url = new URL(request.url); const thumb = url.searchParams.get("type") === "thumbnail";
    const key = thumb ? `jobs/${id}/thumbnail` : job.video_path;
    if (!key) return json({ error: "Video belum siap." }, 404);
    const head = await this.env.MEDIA.head(key); if (!head) return json({ error: "Fail tidak ditemui." }, 404);
    const range = parseRange(request.headers.get("range"), head.size);
    const headers = new Headers({ "Content-Type": thumb ? job.thumbnail_type : "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store", "ETag": head.httpEtag });
    if (range === false) { headers.set("Content-Range", `bytes */${head.size}`); return new Response(null, { status: 416, headers }); }
    headers.set("Content-Length", String(range ? range.length : head.size));
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    if (!thumb && url.searchParams.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="pawarna-${id}.mp4"`);
    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
    const object = await this.env.MEDIA.get(key, range ? { range } : undefined);
    if (!object) return json({ error: "Fail tidak ditemui." }, 404);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  }
  async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 300_000);
    const rows = this.ctx.storage.sql.exec<Row>("SELECT id,data,request_hash FROM jobs WHERE stage NOT IN ('completed','failed') ORDER BY updated_at LIMIT 3").toArray();
    if (!rows.length) {
      if (await this.products.tick()) await this.ctx.storage.setAlarm(Date.now()+1000);
      else await this.ctx.storage.deleteAlarm();
      return;
    }
    const job = rows.map(row => JSON.parse(row.data) as CloudJob).find(item => item.lease_until <= Date.now());
    if (!job) { await this.ctx.storage.setAlarm(Date.now() + 10_000); return; }
    // The alarm is durable; each phase checkpoints before progressing. A crashed POST is never replayed.
    await this.ctx.storage.setAlarm(Date.now() + 180_000);
    try { await this.advance(job); }
    catch (error) {
      if (error instanceof ProviderError && error.kind === "unavailable") { /* Retry only status/download, not paid submission. */ }
      else {
        const uncertain = error instanceof ProviderError && error.kind === "uncertain";
        job.error = uncertain ? "Status penghantaran belum dapat disahkan. Semak job Nexabot sebelum menjana semula untuk elak caj berganda."
          : job.stage === "analysing" ? "Gambar belum dapat dianalisis. Semak key/model Gemini dan cuba lagi."
          : job.stage === "researching" ? "Carian sumber tidak berjaya. Cuba lagi sebentar lagi."
          : job.stage === "planning" ? "Skrip belum lulus semakan fakta. Cuba gambar yang lebih jelas."
          : "Generation tidak dapat diteruskan. Semak baki penyedia atau had harian studio.";
        this.save(job, "failed");
        console.error(JSON.stringify({ event: "job_failed", id: job.id, uncertain, status: error && typeof error === "object" && "status" in error ? error.status : undefined }));
      }
    } finally { this.save(job); await this.ctx.storage.setAlarm(Date.now() + 8_000); }
  }
  private async advance(job: CloudJob) {
    if (job.stage === "submitting" && !job.external_job_id) throw new ProviderError("uncertain", "Interrupted submission");
    if (!job.external_job_id && this.env.GENERATION_ENABLED !== "true") {
      job.error = "Penghantaran dihentikan untuk semakan caj. Job ini tidak dihantar semula.";
      this.save(job, "failed"); return;
    }
    const object = await this.env.MEDIA.get(job.input_key);
    if (!object) throw new Error("Missing input");
    const input = await object.json<JobInput>();
    if (!job.product) { this.save(job, "analysing"); job.product = await analyseProduct(input); this.save(job, "researching"); return; }
    if (!job.research) { this.save(job, "researching"); job.research = await researchProduct(job.product); this.save(job, "planning"); return; }
    if (!job.plan) { this.save(job, "planning"); job.plan = await createPlan(input, job.product, job.research); this.save(job, "queued"); return; }
    const provider = new NexabotProvider();
    if (!job.external_job_id) {
      const day = new Date().toISOString().slice(0, 10);
      if (!this.consume(`submissions:${day}`, Number(this.env.PAWARNA_DAILY_LIMIT || 20), Date.now() + 172_800_000)) throw new ProviderError("rejected", "Daily limit");
      const selected = job.product.reference_indices.slice(0, input.avatar ? 2 : 3).map(index => input.images[index]);
      job.plan.video_prompt = buildVideoPrompt(job.product, job.plan, !!input.avatar, selected.length, input.instructions, input.settings);
      job.provider_requests.push({ at: Date.now(), status: "submitting", cost: .5 });
      this.save(job, "submitting");
      await this.ctx.storage.sync();
      const result = await provider.createJob({ prompt: job.plan.video_prompt, media: input.avatar ? [...selected, input.avatar] : selected, duration_seconds: 10 });
      job.external_job_id = result.id;
      Object.assign(job.provider_requests.at(-1)!, { external_job_id: result.id, cost: result.cost, status: "accepted" });
      this.save(job, "processing"); return;
    }
    if (Date.now() - job.provider_requests.at(-1)!.at > 25 * 60_000) throw new ProviderError("uncertain", "Provider timeout");
    const status = await provider.getJob(job.external_job_id);
    if (status === "done") {
      this.save(job, "saving");
      await this.saveResult(job);
      job.error = undefined; job.provider_requests.at(-1)!.status = "done"; this.save(job, "completed");
    } else if (status === "failed") {
      Object.assign(job.provider_requests.at(-1)!, { status: "failed", refund_expected: true });
      job.error = "Nexabot melaporkan generation gagal. Retry automatik dimatikan; tiada penghantaran baru dibuat. Refund belum disahkan.";
      this.save(job, "failed");
    } else this.save(job, "processing");
  }
  private async saveResult(job: CloudJob) {
    const response = await fetch(`${this.env.NEXABOT_BASE_URL}/api/v1/jobs/${encodeURIComponent(job.external_job_id!)}/download`, { headers: { "x-api-key": this.env.NEXABOT_API_KEY! }, signal: AbortSignal.timeout(120_000) }).catch(() => { throw new ProviderError("unavailable", "Download interrupted"); });
    if (!response.ok || !response.body) throw new ProviderError("unavailable", "Download unavailable");
    // Bound memory when a provider omits Content-Length. Ten-second 720p clips fit well below this limit.
    const max = 32 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > max) { await response.body.cancel(); throw new ProviderError("unavailable", "Video too large"); }
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = response.body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new ProviderError("unavailable", "Video too large"); } chunks.push(value); }
    const bytes = Buffer.concat(chunks);
    if (bytes.subarray(4, 8).toString() !== "ftyp") throw new ProviderError("unavailable", "Invalid MP4");
    const key = `jobs/${job.id}/video.mp4`;
    await this.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "video/mp4" } });
    job.video_path = key;
  }
}
