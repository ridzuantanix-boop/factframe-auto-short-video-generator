// Runs isolated, local-only Cloudflare storage + alarms against fake providers. No real API keys or credits.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";
const controlled=process.argv.includes("--controlled");
const testToken="integration-owner-token-not-production-000000";
const origin = "http://127.0.0.1:8897";
let lastPrompt = ""; let submissions = 0; let analyses = 0; let searches = 0; let mode = "success"; let dirtyReference=false;
const product = { name: "Buku Biru", brand: "", category: "Buku", confidence: "high", visible_text: "Buku Biru", description: "Buku dengan cover biru", observed_features: ["Cover biru"], search_query: "Buku Biru", uncertainty: "", reference_indices: [0], productStructure:{type:"single",visiblePieceCount:1,majorComponents:["buku"],accessories:[]}, reference_preprocessing:[{index:0,reference_type:"CLEAN_PRODUCT_IMAGE",detected_ui:false,product_region:null,ui_overlap_product:false,sanitization_confidence:"high",reason:"Clean fixture"}] };
const plan = { scene_plan: {"0-2":"Move camera toward closed blue book","2-6":"Hands hold the closed book steadily","6-8":"Show cover title without opening","8-10":"Set book down, voiceover finishes"}, angle: "Cover biru", hook: "Suka tengok buku dengan cover biru macam ini?", script: "Suka tengok buku dengan cover biru macam ini? Warna birunya jelas dan tajuknya ada pada bahagian depan. Klik link kat bawah.", cta: "Klik link kat bawah.", mode: "Book Creator", visual_direction: "Hold the book", claim_evidence_ids: [] };
const video = Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0, ...Buffer.from("isomiso2")]);
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url.includes(":generateContent")) {
    assert.equal(req.headers["x-goog-api-key"], "test-only");
    const content = JSON.stringify(body); let value;
    if (content.includes("Inspect these photographs")) { analyses++; value = dirtyReference?{...product,name:"Dessini cookware set",reference_preprocessing:[{index:0,reference_type:"SCREENSHOT_OR_UI_IMAGE",detected_ui:true,product_region:{left:.05,top:.28,right:.95,bottom:.65},ui_overlap_product:false,sanitization_confidence:"high",reason:"Product region"}]}:product; }
    else if(content.includes("Inspect this non-generatively cropped product reference"))value={postSanitizationClean:false,residualUiDetected:true,sanitizationConfidence:"low",rectangularCropInsufficient:true,reason:"PayLater and installment banner remain"};
    else if (content.includes("Research the photographed product")) {
      searches++;
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Cover buku berwarna biru." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/book", title: "Mock source" } }], groundingSupports: [{ segment: { text: "Cover biru" }, groundingChunkIndices: [0] }], webSearchQueries: ["Buku Biru"] } }] })); return;
    } else if (content.includes("Audit this Malay script")) value = { approved: true, reason: "Supported" };
    else value = content.includes("VOICE IS OFF:") ? {...plan, script:"", cta:"",hook:"Show closed blue cover"} : plan;
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(value) }] } }] })); return;
  }
  assert.equal(req.headers["x-api-key"], "test-only");
  if (req.method === "POST" && req.url === "/api/v1/api") {
    submissions++; assert.equal(body.mode, "i2v"); assert.equal(body.ratio, 2); assert.ok([1,2].includes(body.media.length)); lastPrompt=body.prompt;
    if (mode === "uncertain") { res.statusCode = 503; res.end("{}"); return; }
    res.statusCode = 202; res.end(JSON.stringify({ ok: true, job_id: `mock-${submissions}`, credit_cost: .5 })); return;
  }
  if (req.url.endsWith("/download")) { res.setHeader("Content-Type", "video/mp4"); res.setHeader("Content-Length", video.length); res.end(video); return; }
  res.end(JSON.stringify({ ok: true, job: { status: mode === "failed" ? "failed" : "done" } }));
});
await new Promise((resolve, reject) => { mock.once("error", reject); mock.listen(8898, "127.0.0.1", resolve); });
const persist = mkdtempSync(path.join(tmpdir(), "pawarna-cloud-test-"));
let output = "";
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), "dev", "--local", "--ip", "127.0.0.1", "--port", "8897", "--inspector-port", "9297", "--persist-to", persist,
  "--var", "GEMINI_API_KEY:test-only", "--var", "NEXABOT_API_KEY:test-only", "--var", "GEMINI_API_BASE_URL:http://127.0.0.1:8898", "--var", "NEXABOT_BASE_URL:http://127.0.0.1:8898", "--var", `GENERATION_ENABLED:${controlled?"false":"true"}`, "--var", `PAWARNA_TEST_GENERATION_ENABLED:${controlled?"true":"false"}`, "--var", "PAWARNA_TEST_MAX_GENERATIONS:4", "--var", `PAWARNA_TEST_TOKEN:${testToken}`], { cwd: new URL("..", import.meta.url), env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
child.stdout.on("data", data => { output = (output + data).slice(-15000); }); child.stderr.on("data", data => { output = (output + data).slice(-15000); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function list(cookie) { const response = await fetch(`${origin}/api/factory`, { headers: { cookie } }); assert.equal(response.status, 200); return response.json(); }
async function waitJob(cookie, id) {
  let last;
  for (let i = 0; i < 120; i++) {
    const data = await list(cookie); const job = data.jobs.find(j => j.id === id);
    if (last !== job.stage) { console.log(`Mock pipeline: ${job.stage}`); last = job.stage; }
    if (["completed", "failed"].includes(job.stage)) return job;
    await delay(1000);
  }
  throw new Error("Mock pipeline timeout");
}
try {
  let ready;
  for (let i = 0; i < 90; i++) { if (child.exitCode !== null) throw new Error(`Local runtime exited (${child.exitCode})`); try { ready = await fetch(`${origin}/api/factory`); if (ready.ok) break; } catch {} await delay(1000); }
  assert.ok(ready?.ok, "Local worker did not start");
  let cookie = ready.headers.get("set-cookie").split(";")[0];
  const state = await ready.json(); assert.deepEqual(state.ready, { gemini: true, nexabot: true, worker: !controlled });
  if(controlled){
    assert.equal(state.paused,true);
    const publicImage="data:image/png;base64,"+(await sharp({create:{width:20,height:20,channels:3,background:"blue"}}).png().toBuffer()).toString("base64");
    const blockedAnalysis=await fetch(origin+"/api/products",{method:"POST",headers:{origin,cookie,"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({images:[publicImage]})});assert.equal(blockedAnalysis.status,503);assert.equal(analyses,0);assert.equal(searches,0);
    const rejected=await fetch(origin+"/api/generate?test=true",{method:"POST",headers:{origin,cookie,"content-type":"application/json","x-pawarna-test-login":"forged","x-pawarna-owner":"forged"},body:JSON.stringify({testMode:true})});assert.equal(rejected.status,503);assert.equal(submissions,0);
    const login=(token,requestOrigin=origin)=>fetch(origin+"/api/test/session",{method:"POST",headers:{origin:requestOrigin,cookie,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token}),redirect:"manual"});
    const badLogin=await login("invalid");assert.equal(badLogin.status,403,await badLogin.text());assert.equal((await login(testToken,"https://evil.invalid")).status,403);assert.equal((await fetch(origin+"/api/test/jobs",{headers:{cookie}})).status,403);
    const loggedIn=await login(testToken);assert.equal(loggedIn.status,303);
    assert.equal((await list(cookie)).paused,true,"Public cookie alone cannot borrow the owner grant");
    const testCookie=loggedIn.headers.get("set-cookie");assert.ok(testCookie.includes("HttpOnly")&&testCookie.includes("Secure")&&testCookie.includes("SameSite=Strict"));cookie+="; "+testCookie.split(";")[0];
    assert.equal((await list(cookie)).paused,false);assert.equal((await list(cookie)).testMode.remaining,4);
  }
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString("base64")}`;
  
  const productKey=crypto.randomUUID();
  const productRequest=(body,id=productKey,session=cookie)=>fetch(origin+"/api/products",{method:"POST",headers:{origin,cookie:session,"content-type":"application/json","idempotency-key":id},body:JSON.stringify(body)});
  const productResults=await Promise.all([productRequest({images:[image]}),productRequest({images:[image]})]);
  assert.equal(productResults[0].status,202);assert.equal(productResults[1].status,202);
  const saved=(await productResults[0].json()).product;
  assert.equal((await productResults[1].json()).product.id,saved.id);
  assert.equal((await productRequest({images:[image],instructions:"changed"})).status,409);
  for(let i=0;i<120;i++){const p=(await list(cookie)).products.find(p=>p.id===saved.id);if(p.stage==="ready")break;if(p.stage==="failed")throw Error(p.error);await delay(1000);}
  assert.equal((await list(cookie)).products[0].stage,"ready");
  assert.equal(submissions,0,"Product analysis must never submit a paid video");
  assert.equal(searches,0,"Clear product must skip Search");assert.equal((await list(cookie)).products[0].research.status,"observation_only");assert.equal("usage" in await list(cookie),false);
  const settings={productId:saved.id,videoStyle:"real_life",angle:"curiosity",voiceoverEnabled:true,voiceGender:"female",voiceStyle:"soft_sell",subjectType:"female_creator",shariahCompliance:true,auratLevel:"full",durationSeconds:10};
  const scriptFor=async(productId,scriptSettings,instructions="")=>{const before=submissions,response=await fetch(`${origin}/api/products/${productId}/script`,{method:"POST",headers:{origin,cookie,"content-type":"application/json"},body:JSON.stringify({settings:scriptSettings,instructions})});assert.equal(response.status,200);assert.equal(submissions,before,"Script generation reached video provider");const draft=await response.json();return {approved_script:draft.script,script_settings_hash:draft.settings_hash,instructions};};
  const firstDraft=await scriptFor(saved.id,settings);assert.equal(submissions,0);
  const editedScript="Skrip manual owner, kekal tepat tanpa ditulis semula.";
  const input = {product_id:saved.id, avatar:image, settings,...firstDraft,approved_script:editedScript};

  const key = crypto.randomUUID();
  const send = (body, id = key, reqOrigin = origin) => fetch(`${origin}/api/generate`, { method: "POST", headers: { origin: reqOrigin, cookie, "content-type": "application/json", "idempotency-key": id }, body: JSON.stringify(body) });
  assert.equal((await send({product_id:saved.id,avatar:image,settings},crypto.randomUUID())).status,400);assert.equal(submissions,0,"Missing script reached provider");
  assert.equal((await send({...input,settings:{...settings,angle:"problem"}},crypto.randomUUID())).status,400);assert.equal(submissions,0,"Stale script reached provider");
  assert.equal((await send(input, crypto.randomUUID(), "https://evil.invalid")).status, 403);
  const results = await Promise.all([send(input), send(input)]);
  assert.equal(results[0].status, 202); assert.equal(results[1].status, 202);
  const a = await results[0].json(); const b = await results[1].json(); assert.equal(a.job.id, b.job.id);
  assert.equal((await send({ ...input, instructions: "different" })).status, 409);
  const other = await fetch(`${origin}/api/factory`); const otherCookie = other.headers.get("set-cookie").split(";")[0];
  assert.equal((await list(otherCookie)).jobs.length, 0);
  assert.equal((await list(otherCookie)).products.length,0);
  assert.equal((await fetch(origin+saved.image_urls[0],{headers:{cookie:otherCookie}})).status,404);
  assert.equal((await fetch(origin+"/api/generate",{method:"POST",headers:{origin,cookie:otherCookie,"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify(input)})).status,controlled?503:404);
  assert.equal((await fetch(`${origin}${a.job.thumbnail_url}`, { headers: { cookie: otherCookie } })).status, 404);
  const completed = await waitJob(cookie, a.job.id);
  assert.equal(completed.stage, "completed", completed.error); assert.deepEqual(completed.settings,settings);assert.ok(completed.plan.scene_plan);assert.equal(completed.plan.script,editedScript);assert.equal(completed.plan.script_source,"user_edited");assert.ok(lastPrompt.includes(`SPOKEN_SCRIPT: ${editedScript}`));assert.ok(lastPrompt.includes("SHARIAH_RULES:"));assert.ok(lastPrompt.includes("soft_sell")); assert.equal(submissions, 1); assert.equal(analyses, 1); assert.equal(searches, 0);
  const download = await fetch(`${origin}${completed.video_url}`, { headers: { cookie } }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), video);
  const range = await fetch(`${origin}${completed.video_url}`, { headers: { cookie, range: "bytes=4-7" } }); assert.equal(range.status, 206); assert.equal(await range.text(), "ftyp");
  assert.equal((await fetch(`${origin}${completed.video_url}`, { headers: { cookie, range: "bytes=999-" } })).status, 416);
  assert.equal((await fetch(`${origin}${completed.video_url}`, { headers: { cookie: otherCookie } })).status, 404);
  if(controlled){
    const report=await (await fetch(origin+"/api/test/jobs",{headers:{cookie}})).json();assert.equal(report.jobs[0].test_sequence,1);assert.equal(report.jobs[0].provider_attempt_count,1);assert.equal(report.jobs[0].settings.videoStyle,settings.videoStyle);assert.ok(report.jobs[0].compiled_prompt.includes("PAWARNA_VIDEO_EXECUTION_LOCK"));assert.equal(report.jobs[0].research,"observation_only");assert.ok(report.jobs[0].output_path);assert.ok(!JSON.stringify(report).includes(testToken));
    const rating=await fetch(origin+`/api/test/jobs/${completed.id}/evaluation`,{method:"POST",headers:{origin,cookie,"content-type":"application/json"},body:JSON.stringify({overall:4,notes:"Mock only"})});assert.equal(rating.status,200);
    assert.equal((await fetch(origin+"/api/test/jobs",{headers:{cookie:otherCookie}})).status,403);
  }
  mode = "uncertain";
  const regeneratedDraft=await scriptFor(saved.id,settings);assert.equal(submissions,1);assert.ok(regeneratedDraft.approved_script);
  const regen = await send({product_id:saved.id,avatar:image,settings,...regeneratedDraft}, crypto.randomUUID()); assert.equal(regen.status, 202);
  const failed = await waitJob(cookie, (await regen.json()).job.id);
  assert.equal(failed.stage, "failed"); assert.ok(failed.error.includes("Hubungi sokongan")); assert.equal(submissions, 2);
  await delay(10_000); assert.equal(submissions, 2, "Uncertain paid POST was replayed");
  mode = "failed";
  const rejectedDraft=await scriptFor(saved.id,settings);
  const rejected = await send({product_id:saved.id,avatar:image,settings,...rejectedDraft}, crypto.randomUUID()); assert.equal(rejected.status, 202);
  const rejectedJob = await waitJob(cookie, (await rejected.json()).job.id);
  assert.equal(rejectedJob.stage, "failed"); assert.equal(rejectedJob.retry_count, 0); assert.ok(rejectedJob.error.includes("Hubungi sokongan"));
  await delay(10_000); assert.equal(submissions, 3, "Explicit provider failure created an automatic paid retry");
  
  mode="success";
  const silent={...settings,videoStyle:"product_motion",angle:"discovery",voiceoverEnabled:false,subjectType:"no_hands",shariahCompliance:false,auratLevel:null};
  const silentDraft=await scriptFor(saved.id,silent);const silentResponse=await send({product_id:saved.id,settings:silent,...silentDraft},crypto.randomUUID());assert.equal(silentResponse.status,202);
  const silentJob=await waitJob(cookie,(await silentResponse.json()).job.id);
  assert.equal(silentJob.stage,"completed",silentJob.error);assert.deepEqual(silentJob.settings,silent);
  assert.equal(silentJob.plan.script,"");assert.equal(analyses,1);assert.equal(searches,0);
  assert.ok(lastPrompt.includes("VOICEOVER: OFF"));assert.ok(lastPrompt.includes("No people, hands, faces"));
  assert.ok(!lastPrompt.includes("SPOKEN_SCRIPT:"));assert.ok(!lastPrompt.includes("SHARIAH_RULES:"));assert.ok(!lastPrompt.includes("AURAT_RULES:"));
  assert.equal(submissions,4);
  const invalid=await send({product_id:saved.id,settings:{...silent,subjectType:"female_creator"}},crypto.randomUUID());assert.equal(invalid.status,controlled?429:400);
  if(controlled){
    const capped=await send(input,crypto.randomUUID());assert.equal(capped.status,429);assert.ok((await capped.json()).error.includes("Had ujian"));assert.equal(submissions,4);const report=await (await fetch(origin+"/api/test/jobs",{headers:{cookie}})).json();assert.equal(report.attempts,4);assert.equal(report.jobs.length,4);assert.equal(report.jobs[0].evaluation.overall,4);assert.equal((await list(cookie)).paused,true);
    assert.equal((await send(input,key)).status,202,"Original idempotent result remains retrievable at cap");assert.equal(submissions,4);
    await fetch(origin+"/api/test/logout",{method:"POST",headers:{origin,cookie},redirect:"manual"});assert.equal((await fetch(origin+"/api/test/jobs",{headers:{cookie}})).status,403);assert.equal((await send(input,crypto.randomUUID())).status,503);
    console.log("PASS: owner-only generation, forged/missing/invalid authorization, cap including failures, diagnostic logs, evaluation and logout; zero real provider calls.");
  }
  if(controlled){assert.equal((await productRequest({images:[image]},crypto.randomUUID())).status,503);assert.equal(searches,0);}
  else {
  dirtyReference=true;const beforeBlocked=submissions;
  const dirtyProductResponse=await productRequest({images:[image]},crypto.randomUUID());assert.equal(dirtyProductResponse.status,202);const dirtyId=(await dirtyProductResponse.json()).product.id;
  for(let i=0;i<120;i++){const p=(await list(cookie)).products.find(p=>p.id===dirtyId);if(p.stage==="ready")break;if(p.stage==="failed")throw Error(p.error);await delay(1000);}
  const dirtySettings={...settings,productId:dirtyId,videoStyle:"pov_demo",subjectType:"female_hands"},dirtyDraft=await scriptFor(dirtyId,dirtySettings);const blockedResponse=await send({product_id:dirtyId,settings:dirtySettings,...dirtyDraft},crypto.randomUUID());assert.equal(blockedResponse.status,202);const blockedJob=await waitJob(cookie,(await blockedResponse.json()).job.id);assert.equal(blockedJob.stage,"failed");assert.ok(blockedJob.error.includes("terlalu banyak elemen skrin"));assert.equal(submissions,beforeBlocked,"Unsafe screenshot reached Nexabot mock");dirtyReference=false;
  product.confidence="low";product.uncertainty="Exact model unclear";
  const uncertainProduct=await productRequest({images:[image]},crypto.randomUUID());assert.equal(uncertainProduct.status,202);const uncertainId=(await uncertainProduct.json()).product.id;
  for(let i=0;i<120;i++){const p=(await list(cookie)).products.find(p=>p.id===uncertainId);if(p.stage==="ready"){assert.equal(p.research.status,"grounded");break;}if(p.stage==="failed")throw Error(p.error);await delay(1000);}
  assert.equal(searches,1,"Uncertain identity must trigger one Search");assert.equal(submissions,4);
  console.log("PASS: conditional Search skips clear products, researches uncertain identity, and no customer usage ledger.");
  }
  console.log("PASS: structured settings persisted, product projects before paid generation, reuse without research, voice OFF, Shariah OFF, subject validation.");
  if(process.argv.includes("--ui")){console.log("UI mock server ready at "+origin+"; test-only keys, no paid calls."); await new Promise(()=>{});}
  console.log("PASS: real local Durable Object alarms + R2; mock AI/search/MP4, avatar, duplicate protection, session isolation, ranges, uncertain POST no-replay. Zero paid calls.");
} catch (error) { console.error(output); throw error; }
finally { child.kill(); mock.closeAllConnections(); mock.close(); }
