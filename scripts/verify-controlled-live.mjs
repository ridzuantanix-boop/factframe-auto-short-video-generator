// Live UI/auth verification only. No owner generation POST, uploads, Gemini or provider call.
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
const root=new URL("..",import.meta.url),base="https://pawarna-video-factory.ridzuantanix.workers.dev";
const output=new URL("outputs/controlled-live/",root);await mkdir(output,{recursive:true});
const access=JSON.parse(await readFile(new URL(".pawarna/owner-test-access.json",root),"utf8"));
const sha=value=>createHash("sha256").update(value).digest("hex");
const html=Buffer.from(await (await fetch(base)).arrayBuffer());
assert.equal(sha(html),sha(await readFile(new URL("dist-cloud/index.html",root))));
const assets=[];
for(const match of html.toString().matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)){
  const bytes=Buffer.from(await(await fetch(base+match[1])).arrayBuffer());
  assert.equal(sha(bytes),sha(await readFile(new URL("dist-cloud"+match[1],root))));assert.ok(!bytes.includes(Buffer.from(access.token)));
  assets.push({path:match[1],sha256:sha(bytes)});
}
for(const file of await readdir(new URL("dist-cloud/assets/",root)))assert.ok(!(await readFile(new URL("dist-cloud/assets/"+file,root))).includes(Buffer.from(access.token)));
assert.ok(!html.includes(Buffer.from(access.token)));
const {chromium}=await import(pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.AUDIT_CHROMIUM});
const results={assets,publicGeneration:"disabled",ownerAttempts:null,ownerLimit:null,paidGenerationRequests:0,screens:[]};
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto(base+"/#home");await page.getByText("Generation dijeda · draf masih boleh dibuat",{exact:true}).waitFor();
  const state=await(await context.request.get(base+"/api/factory")).json();assert.equal(state.paused,true);assert.equal(state.ready.worker,false);assert.ok(!state.testMode);
  const denied=await context.request.post(base+"/api/generate?test=true",{headers:{origin:base,"x-pawarna-test-login":"forged"},data:{}});assert.equal(denied.status(),503);
  assert.equal((await context.request.get(base+"/api/test/jobs")).status(),403);
  async function capture(name){await page.waitForTimeout(400);await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:fileURLToPath(new URL(name+".png",output)),animations:"disabled"});results.screens.push(name);}
  await capture("home");assert.ok((await page.textContent("body")).includes("Upload produk. Pawarna susun idea"));
  await page.getByRole("button",{name:"Buat Video Baru",exact:true}).first().click();await page.getByRole("heading",{name:"Produk",exact:true}).waitFor();await capture("create");
  const nav=page.getByRole("navigation",{name:"Navigasi utama"});
  await nav.getByRole("button",{name:"Produk",exact:true}).click();await page.getByRole("heading",{name:"Produk",exact:true}).waitFor();await capture("products");
  await nav.getByRole("button",{name:"Kredit",exact:true}).click();await page.getByRole("heading",{name:"Kredit Pawarna",exact:true}).waitFor();await capture("credits");
  await nav.getByRole("button",{name:"Saya",exact:true}).click();await page.getByRole("heading",{name:"Saya",exact:true}).waitFor();await capture("profile");
  const manifest=await(await context.request.get(base+"/manifest.webmanifest")).json();assert.equal(manifest.display,"standalone");
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await context.setOffline(true);await page.reload();await page.getByRole("button",{name:"Cuba sambung semula",exact:true}).waitFor();await capture("offline");await context.setOffline(false);
  await page.goto(base+"/owner-test");await page.getByRole("heading",{name:"Akses Ujian Pemilik"}).waitFor();
  const login=await context.request.post(base+"/api/test/session",{headers:{origin:base},form:{token:access.token},maxRedirects:0});assert.equal(login.status(),303);
  await page.goto(base+"/#home");await page.getByText("TEST MODE",{exact:true}).waitFor();await capture("owner-test");
  const owner=await(await context.request.get(base+"/api/factory")).json();assert.equal(owner.paused,false);assert.equal(owner.testMode.enabled,true);assert.equal(owner.testMode.limit,10);
  const report=await(await context.request.get(base+"/api/test/jobs")).json();assert.equal(report.attempts,0);assert.equal(report.jobs.length,0);results.ownerAttempts=report.attempts;results.ownerLimit=report.limit;
  const logout=await context.request.post(base+"/api/test/logout",{headers:{origin:base},maxRedirects:0});assert.equal(logout.status(),303);assert.equal((await context.request.get(base+"/api/test/jobs")).status(),403);
  await context.close();
}finally{await browser.close();}
await writeFile(new URL("verification.json",output),JSON.stringify(results,null,2)+"\n");console.log(JSON.stringify(results));
