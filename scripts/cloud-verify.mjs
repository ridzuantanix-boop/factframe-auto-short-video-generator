// Read-only live deployment checks plus rejected invalid-input requests. Never creates a video job.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = process.argv[2] || "https://pawarna-video-factory.ridzuantanix.workers.dev";
const env = parseEnv(readFileSync(new URL("../.env.local", import.meta.url), "utf8"));
function scan(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) scan(target);
    else { const content = readFileSync(target); for (const key of [env.GEMINI_API_KEY, env.NEXABOT_API_KEY]) if (key && content.includes(Buffer.from(key))) throw new Error("Private credential found in public assets"); }
  }
}
scan(fileURLToPath(new URL("../dist-cloud", import.meta.url)));
for (const route of ["/", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]) {
  const res = await fetch(base + route); assert.equal(res.status, 200, route);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  if (route === "/manifest.webmanifest") { const data = await res.json(); assert.equal(data.display, "standalone"); assert.ok(data.icons.some(i => i.purpose === "maskable")); }
  if (route === "/sw.js") { assert.ok(res.headers.get("cache-control").includes("no-store")); assert.equal(res.headers.get("service-worker-allowed"), "/"); }
}
const health = await (await fetch(base + "/api/health")).json(); assert.equal(health.model, "gemini-3.1-flash-lite");
const initial = await fetch(base + "/api/factory"); assert.equal(initial.status, 200);
const setCookie = initial.headers.get("set-cookie"); assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("Secure") && setCookie.includes("SameSite=Strict"));
const cookie = setCookie.split(";")[0]; const data = await initial.json();
assert.deepEqual(data.ready, { gemini: true, nexabot: true, worker: false }); assert.equal(data.paused,true); assert.equal(data.jobs.length, 0);assert.equal(data.products.length,0);
const invalid = await fetch(base + "/api/generate", { method: "POST", headers: { cookie, origin: base, "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ images: [] }) }); assert.equal(invalid.status, 503);
const badProduct=await fetch(base+"/api/products",{method:"POST",headers:{cookie,origin:base,"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({images:[]})});assert.equal(badProduct.status,400);
const crossSite = await fetch(base + "/api/generate", { method: "POST", headers: { cookie, origin: "https://evil.invalid", "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: "{}" }); assert.equal(crossSite.status, 403);
const final = await (await fetch(base + "/api/factory", { headers: { cookie } })).json(); assert.equal(final.jobs.length, 0);
console.log(JSON.stringify({ verified: base, model: health.model, ready: final.ready, pwa_assets: "pass", secure_session: "pass", invalid_inputs_rejected: true, public_assets_secret_scan: "pass", paid_jobs_created: 0 }));
