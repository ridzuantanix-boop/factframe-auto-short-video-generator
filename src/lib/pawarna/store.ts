import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { Job, JobInput, PublicJob } from "./types";
import type { ProductProject } from "./projects";

// Runtime data is provisioned locally; never bundle the user's images, DB or videos.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.PAWARNA_DATA_DIR || ".pawarna");
let db: DatabaseSync;
function database() {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "factory.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, stage TEXT NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(owner,request_key));
    CREATE TABLE IF NOT EXISTS generation_logs (id INTEGER PRIMARY KEY, generation_id TEXT, stage TEXT, timestamp INTEGER);
    CREATE TABLE IF NOT EXISTS worker_health (id INTEGER PRIMARY KEY CHECK(id=1), heartbeat INTEGER);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, data TEXT NOT NULL, input TEXT NOT NULL, UNIQUE(owner,request_key));
    CREATE INDEX IF NOT EXISTS generations_owner ON generations(owner,created_at);`);
  return db;
}
export function heartbeat() { database().prepare("INSERT OR REPLACE INTO worker_health VALUES(1,?)").run(Date.now()); }
export function workerReady() { const r = database().prepare("SELECT heartbeat FROM worker_health WHERE id=1").get() as { heartbeat: number } | undefined; return !!r && Date.now() - r.heartbeat < 30_000; }
export function createJob(owner: string, requestKey: string, input: JobInput, parent?: string, project?: ProductProject) {
  const d = database(); const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  d.exec("BEGIN IMMEDIATE");
  try {
    const existing = d.prepare("SELECT id, request_hash FROM generations WHERE owner=? AND request_key=?").get(owner, requestKey) as { id: string; request_hash: string } | undefined;
    if (existing) { if (existing.request_hash !== hash) throw new Error("Permintaan berulang mempunyai input berbeza."); d.exec("COMMIT"); return getJob(existing.id)!; }
    const count = d.prepare("SELECT COUNT(*) AS n FROM generations WHERE owner=? AND stage NOT IN ('completed','failed')").get(owner) as { n: number };
    if (count.n >= 3) throw new Error("Tunggu video sedia ada siap dahulu (maksimum 3 job aktif).");
    const job: Job = { settings: input.settings, product: project?.product, research: project?.research, id: randomUUID(), owner, input, stage: "queued", created_at: Date.now(), updated_at: Date.now(), retry_count: 0, provider_requests: [], lease_until: 0, duration_seconds: 10, segment_number: 1, parent_generation_id: parent };
    d.prepare("INSERT INTO generations VALUES(?,?,?,?,?,?,?,?)").run(job.id, owner, requestKey, hash, job.stage, 0, job.created_at, JSON.stringify(job));
    d.exec("COMMIT"); return job;
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
export function getJob(id: string): Job | undefined {
  const r = database().prepare("SELECT data FROM generations WHERE id=?").get(id) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : undefined;
}
export function saveJob(job: Job) {
  job.updated_at = Date.now();
  database().prepare("UPDATE generations SET stage=?,lease_until=?,data=? WHERE id=?").run(job.stage, job.lease_until, JSON.stringify(job), job.id);
  database().prepare("INSERT INTO generation_logs(generation_id,stage,timestamp) VALUES(?,?,?)").run(job.id, job.stage, job.updated_at);
}
export function listJobs(owner: string): Job[] {
  return (database().prepare("SELECT data FROM generations WHERE owner=? ORDER BY created_at DESC LIMIT 30").all(owner) as { data: string }[]).map(r => JSON.parse(r.data));
}
export function claimJob(): Job | undefined {
  const d = database(); d.exec("BEGIN IMMEDIATE");
  try {
    const row = d.prepare("SELECT data FROM generations WHERE stage NOT IN ('completed','failed') AND lease_until<? ORDER BY created_at LIMIT 1").get(Date.now()) as { data: string } | undefined;
    if (!row) { d.exec("COMMIT"); return; }
    const job: Job = JSON.parse(row.data); job.lease_until = Date.now() + 300_000;
    d.prepare("UPDATE generations SET lease_until=?,data=? WHERE id=?").run(job.lease_until, JSON.stringify(job), job.id);
    d.exec("COMMIT"); return job;
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
export function publicJob(job: Job): PublicJob {
  const { input } = job;
  const publicData = { settings: job.settings || input.settings, id: job.id, stage: job.stage, created_at: job.created_at, updated_at: job.updated_at,
    external_job_id: job.external_job_id, product: job.product, research: job.research, plan: job.plan,
    retry_count: job.retry_count, error: job.error, duration_seconds: job.duration_seconds,
    parent_generation_id: job.parent_generation_id, segment_number: job.segment_number };
  // Prompt remains server-side; the result presents script and sources, not machinery.
  if (publicData.plan) publicData.plan = { ...publicData.plan, video_prompt: "" };
  return { ...publicData, has_avatar: !!input.avatar, image_count: input.images.length,
    thumbnail_url: `/api/factory/jobs/${job.id}/media?type=thumbnail`,
    video_url: job.video_path ? `/api/factory/jobs/${job.id}/media` : undefined };
}
export function saveVideo(job: Job, bytes: Buffer) {
  const filename = `${job.id}.mp4`;
  writeFileSync(path.join(DATA_DIR, filename), bytes);
  job.video_path = filename;
}
export function readVideo(job: Job) { return readFileSync(path.join(DATA_DIR, `${job.id}.mp4`)); }

export function getProduct(id: string): { project: ProductProject; input: JobInput } | undefined {
  const row = database().prepare("SELECT data,input FROM products WHERE id=?").get(id) as {data:string;input:string}|undefined;
  return row ? {project:JSON.parse(row.data),input:JSON.parse(row.input)} : undefined;
}
export function saveProduct(p: ProductProject) { p.updated_at=Date.now();database().prepare("UPDATE products SET data=? WHERE id=?").run(JSON.stringify(p),p.id); }
export function listProducts(owner: string): ProductProject[] {
  return (database().prepare("SELECT data FROM products WHERE owner=? ORDER BY rowid DESC LIMIT 50").all(owner) as {data:string}[]).map(r=>{
    const p: ProductProject=JSON.parse(r.data);
    if(!["ready","failed"].includes(p.stage)&&Date.now()-p.updated_at>600000){p.stage="failed";p.error="Analisis terganggu. Tiada video berbayar dihantar.";saveProduct(p);}return p;
  });
}
export function reserveProduct(owner: string, key: string, fingerprint: string, input: JobInput, source?: Job) {
  const d=database();d.exec("BEGIN IMMEDIATE");
  try {
    const existing=d.prepare("SELECT id,request_hash FROM products WHERE owner=? AND request_key=?").get(owner,key) as {id:string;request_hash:string}|undefined;
    if(existing){if(existing.request_hash!==fingerprint)throw new Error("Permintaan berulang berbeza.");d.exec("COMMIT");return {...getProduct(existing.id)!,fresh:false};}
    const n=(d.prepare("SELECT COUNT(*) AS n FROM products WHERE json_extract(data,'$.created_at')>?").get(Date.now()-86400000) as {n:number}).n;
    if(n>=20)throw new Error("Had analisis harian dicapai.");
    const p:ProductProject={id:randomUUID(),owner,created_at:Date.now(),updated_at:Date.now(),stage:source?.product&&source.research?"ready":"queued",product:source?.product,research:source?.research,image_count:input.images.length,input_key:"local"};
    p.source_job=source?.id;
    d.prepare("INSERT INTO products VALUES(?,?,?,?,?,?)").run(p.id,owner,key,fingerprint,JSON.stringify(p),JSON.stringify({...input,avatar:undefined}));d.exec("COMMIT");return {project:p,input,fresh:true};
  }catch(e){d.exec("ROLLBACK");throw e;}
}
