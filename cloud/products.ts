import type { Env } from "./worker";
import type { JobInput } from "../src/lib/pawarna/types";
import { publicProduct, applyCorrections, type ProductProject } from "../src/lib/pawarna/projects";
import { researchContext, shouldResearchProduct } from "../src/lib/pawarna/research";
import { analyseProduct, researchProduct } from "../src/services/pawarna/intelligence";
import { decodeImage } from "../src/lib/pawarna/image";
import { validateInput } from "./validation";
import { hash, json, readBody, type CloudJob } from "./utils";
import { cloudflareCrop, providerReferences } from "./reference-preprocessing";
export class Products {
  constructor(private ctx: DurableObjectState, private env: Env) {
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner,request_key))");
  }
  get(id: string): ProductProject | undefined { const row = this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM products WHERE id=?", id).toArray()[0]; return row ? JSON.parse(row.data) : undefined; }
  list(owner: string) { return this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM products WHERE owner=? ORDER BY rowid DESC LIMIT 50", owner).toArray().map(r => publicProduct(JSON.parse(r.data))); }
  save(p: ProductProject) { p.updated_at = Date.now(); this.ctx.storage.sql.exec("UPDATE products SET data=? WHERE id=?", JSON.stringify(p), p.id); }
  async input(p: ProductProject) { const object = await this.env.MEDIA.get(p.input_key); if (!object) throw new Error("Imej asal tidak ditemui."); return object.json<JobInput>(); }
  async route(request: Request, owner: string, source: (id: string) => CloudJob | undefined, allowAnalysis: boolean): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/products\/([a-f0-9-]{36})\/(media|corrections)$/.exec(url.pathname);
    if (match) {
      const p = this.get(match[1]); if (!p || p.owner !== owner) return json({error:"Produk tidak ditemui."},404);
      if (match[2] === "media" && ["GET","HEAD"].includes(request.method)) {
        const index = Number(url.searchParams.get("index") || 0); if (!Number.isInteger(index) || index < 0 || index >= p.image_count) return json({},404);
        const input = await this.input(p); const source=url.searchParams.get("sanitized")==="1"?input.sanitized_video_references?.[String(index)]:input.images[index];if(!source)return json({},404);const image = decodeImage(source);
        return new Response(request.method === "HEAD" ? null : image.bytes, { headers:{"Content-Type":image.mimeType,"Cache-Control":"no-store"} });
      }
      if (match[2] === "corrections" && request.method === "POST") {
        if (p.stage !== "ready") return json({error:"Tunggu analisis siap dahulu."},409);
        applyCorrections(p,await readBody(request,8192)); this.save(p); return json({product:publicProduct(p)});
      }
      return json({},405);
    }
    if (url.pathname !== "/api/products" || request.method !== "POST") return json({},404);
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) return json({error:"Permintaan tidak sah."},400);
    const body = await readBody(request); const fingerprint = await hash(JSON.stringify(body));
    const existing = this.ctx.storage.sql.exec<{data:string;request_hash:string}>("SELECT data,request_hash FROM products WHERE owner=? AND request_key=?",owner,key).toArray()[0];
    if (existing) return existing.request_hash === fingerprint ? json({product:publicProduct(JSON.parse(existing.data))},202) : json({error:"Permintaan berulang berbeza."},409);
    let input: JobInput; let parent: CloudJob | undefined;
    if (body.source_job) {
      parent = source(String(body.source_job)); if (!parent || parent.owner !== owner) return json({error:"Video tidak ditemui."},404);
      const object = await this.env.MEDIA.get(parent.input_key); if (!object) return json({},404); input = await object.json<JobInput>();
    } else input = validateInput(body);
    if (!allowAnalysis && !(parent?.product && parent.research)) return json({error:"Analisis AI hanya tersedia untuk sesi ujian pemilik buat masa ini."},503);
    if (!parent && !this.env.GEMINI_API_KEY) return json({error:"Analisis belum tersedia."},503);
    const now = Date.now();
    const p: ProductProject = {id:crypto.randomUUID(),owner,created_at:now,updated_at:now,stage:parent?.product && parent.research ? "ready" : "queued",input_key:"",image_count:input.images.length,product:parent?.product,research:parent?.research};
    p.input_key = `products/${p.id}/input.json`; p.source_job=parent?.id;
    const duplicate = this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<{data:string;request_hash:string}>("SELECT data,request_hash FROM products WHERE owner=? AND request_key=?",owner,key).toArray()[0]; if(row) return row;
      const today = this.ctx.storage.sql.exec<{n:number}>("SELECT COUNT(*) AS n FROM products WHERE json_extract(data,'$.created_at')>?",now-86400000).one().n;
      if(today >= 20) throw new Error("Had analisis harian dicapai.");
      this.ctx.storage.sql.exec("INSERT INTO products VALUES(?,?,?,?,?)",p.id,owner,key,fingerprint,JSON.stringify(p)); return undefined;
    });
    if(duplicate) return duplicate.request_hash === fingerprint ? json({product:publicProduct(JSON.parse(duplicate.data))},202) : json({},409);
    try { await this.env.MEDIA.put(p.input_key,JSON.stringify({...input,avatar:undefined}),{httpMetadata:{contentType:"application/json"}}); }
    catch { p.stage="failed";p.error="Gambar belum berjaya disimpan.";this.save(p);return json({error:p.error},503); }
    await this.ctx.storage.setAlarm(Date.now()+1000);
    return json({product:publicProduct(p)},202);
  }
  async tick(allowAnalysis: (owner:string)=>Promise<boolean>): Promise<boolean> {
    const row = this.ctx.storage.sql.exec<{data:string}>("SELECT data FROM products WHERE json_extract(data,'$.stage') NOT IN ('ready','failed') ORDER BY rowid LIMIT 1").toArray()[0];
    if (!row) return false;
    const p: ProductProject = JSON.parse(row.data);
    try {
      if(!await allowAnalysis(p.owner))throw new Error("Analysis authorization expired");
      // An interrupted AI request is not replayed automatically.
      if (p.stage === "analysing" || p.stage === "researching") throw new Error("Interrupted analysis");
      const input = await this.input(p); p.stage="analysing"; this.save(p); await this.ctx.storage.sync();
      p.product ||= await analyseProduct(input);
      if(!input.sanitized_video_references){const indices=input.images.map((_,index)=>index),prepared=await providerReferences(input,p.product,indices,(source,bounds)=>cloudflareCrop(this.env.IMAGES,source,bounds));input.sanitized_video_references={};for(let i=0;i<indices.length;i++)if(prepared.audit[i].sanitization_applied)input.sanitized_video_references[String(indices[i])]=prepared.media[i];p.reference_audit=prepared.audit;await this.env.MEDIA.put(p.input_key,JSON.stringify(input),{httpMetadata:{contentType:"application/json"}});this.save(p);}
      p.stage=shouldResearchProduct(p.product,researchContext(input))?"researching":"analysing";this.save(p);
      if(!await allowAnalysis(p.owner))throw new Error("Research authorization expired");
      p.research ||= await researchProduct(p.product,researchContext(input)); p.stage="ready";this.save(p);
    } catch { p.stage="failed";p.error="Analisis belum dapat disiapkan. Semak gambar atau akses analisis. Tiada video berbayar dihantar.";this.save(p); }
    return true;
  }
}
