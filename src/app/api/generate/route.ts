import { getProduct } from "@/lib/pawarna/store";
import { projectInput } from "@/lib/pawarna/projects";
import { validateSettings } from "@/lib/pawarna/settings";
import { createJob, getJob, publicJob, workerReady } from "@/lib/pawarna/store";
import { ownerId, sameOrigin } from "@/lib/pawarna/session";
import { validateInput } from "@/lib/pawarna/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (process.env.GENERATION_ENABLED === "false") return Response.json({ error: "Generation dihentikan sementara untuk semakan caj." }, { status: 503 });
    const owner = await ownerId();
    if (!owner) return Response.json({ error: "Refresh halaman untuk memulakan sesi." }, { status: 401 });
    if (!process.env.GEMINI_API_KEY || !process.env.NEXABOT_API_KEY) return Response.json({ error: "Konfigurasi Gemini atau Nexabot belum lengkap." }, { status: 503 });
    if (!workerReady()) return Response.json({ error: "Enjin video belum aktif. Jalankan worker dahulu." }, { status: 503 });
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) return Response.json({ error: "Permintaan tidak sah. Refresh halaman." }, { status: 400 });
    // Bound request body even when the client omits Content-Length.
    if (!request.body) throw new Error("Permintaan kosong.");
    const reader = request.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 43 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "Jumlah imej terlalu besar." }, { status: 413 }); } parts.push(value); }
    const body = JSON.parse(Buffer.concat(parts).toString());
    if (body.product_id) {
      const saved=getProduct(String(body.product_id));
      if(!saved || saved.project.owner!==owner)return Response.json({error:"Produk tidak ditemui."},{status:404});
      if(saved.project.stage!=="ready")throw new Error("Tunggu analisis produk siap.");
      if(body.avatar_source_job && !body.avatar){const avatarJob=getJob(String(body.avatar_source_job));if(!avatarJob||avatarJob.owner!==owner)return Response.json({error:"Avatar tidak ditemui."},{status:404});body.avatar=avatarJob.input.avatar;}
      const input=projectInput(await validateInput({...saved.input,avatar:body.avatar,instructions:body.instructions || "",settings:validateSettings(body.settings,saved.project.id)}),saved.project);input.angle_seed=key;
      return Response.json({job:publicJob(createJob(owner,key,input,undefined,saved.project))},{status:202});
    }
    if (body.source_job) {
      if (!["another_angle", "regenerate"].includes(body.action)) throw new Error("Permintaan jana semula tidak sah.");
      const source = getJob(String(body.source_job));
      if (!source || source.owner !== owner) return Response.json({ error: "Video tidak ditemui." }, { status: 404 });
      const input = { ...source.input };
      // Seed is derived from the idempotency key so retries are identical.
      if(body.settings){input.settings=validateSettings(body.settings,input.settings?.productId || "");if(!input.settings.subjectType.endsWith("_creator"))input.avatar=undefined;}
      input.angle_seed=key; input.previous_hook=source.plan?.hook;
      const created = createJob(owner, key, input, source.id);
      return Response.json({ job: publicJob(created) }, { status: 202 });
    }
    const input = await validateInput(body);
    input.angle_seed = "default";
    const job = createJob(owner, key, input);
    return Response.json({ job: publicJob(job) }, { status: 202 });
  } catch (e) {
    const safe = e instanceof Error && /^(Upload|Hanya|Setiap|Fail|Gaya|Arahan|Imej|Permintaan|Tunggu)/.test(e.message) ? e.message : "Permintaan tidak sah. Semak gambar dan cuba lagi.";
    return Response.json({ error: safe }, { status: 400 });
  }
}
