// Audit-only harness. Serves the unchanged production build with deterministic local API fixtures.
// No provider SDK, API key, live POST, database, or generation worker is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { spawn } from "node:child_process";

const root=fileURLToPath(new URL("..",import.meta.url));
const p0=process.argv.includes("--p0");
const output=path.join(root,p0?"docs/audit/p0":"docs/audit"),dist=path.join(root,"dist-cloud");
const live="https://pawarna-video-factory.ridzuantanix.workers.dev";
const viewport={width:390,height:844};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
await mkdir(output,{recursive:true});
const {chromium}=process.env.AUDIT_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href)
  : await import("playwright");
const browser=await chromium.launch({headless:true,args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"],...(process.env.AUDIT_CHROMIUM?{executablePath:process.env.AUDIT_CHROMIUM}:{})});
const captures=[],failures=[],blocked=[],assetChecks=[];
let server;
const timestamp=Date.now();
const productId="00000000-0000-4000-8000-000000000001",jobId="00000000-0000-4000-8000-000000000002";
const fixtureSVG=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eeeede"/><ellipse cx="300" cy="674" rx="172" ry="22" fill="#d7d8ca"/><rect x="146" y="120" width="330" height="530" rx="9" fill="#d4d6c8"/><rect x="130" y="110" width="330" height="530" rx="9" fill="#244b69"/><rect x="144" y="126" width="302" height="498" rx="3" fill="none" stroke="#7b9cb0" stroke-width="2"/><path d="M175 415 Q295 310 415 415 M175 442 Q295 337 415 442" fill="none" stroke="#c4d4c1" stroke-width="3"/><text x="295" y="223" text-anchor="middle" font-family="Arial" font-size="19" letter-spacing="5" fill="#cad4c5">AUDIT FIXTURE</text><text x="295" y="300" text-anchor="middle" font-family="Arial" font-size="43" fill="#f5f2df">BUKU BIRU</text><text x="295" y="556" text-anchor="middle" font-family="Arial" font-size="16" fill="#cad4c5">Data contoh · bukan produk pelanggan</text></svg>`;
const png=await sharp(Buffer.from(fixtureSVG)).png().toBuffer();
await writeFile(path.join(output,"fixture-product.png"),png);
const analysis={name:"Buku Biru — Fixture Audit",brand:"",category:"Buku",confidence:"high",visible_text:"BUKU BIRU",description:"Buku dengan cover biru dan corak garisan ringkas.",observed_features:["Cover berwarna biru","Tajuk pada bahagian depan"],primary_function:"Bahan bacaan (contoh fixture)",target_audience:"Pembaca buku (contoh fixture)",search_query:"",uncertainty:"",reference_indices:[0]};
const research={status:p0?"observation_only":"unverified",sources:[],evidence:[],queries:[],search_html:"",note:"Fixture audit tempatan. Tiada research web atau generation berbayar dijalankan."};
const plan={angle:"Curiosity tentang cover",hook:"Suka buku dengan cover biru macam ini?",script:"Suka buku dengan cover biru macam ini? Tajuknya jelas dan ada corak garisan ringkas di bahagian depan. Klik link kat bawah.",cta:"Klik link kat bawah.",mode:"Book Creator",visual_direction:"Fixture only",claim_evidence_ids:[],video_prompt:"",scene_plan:{"0-2":"Cover hook","2-6":"Hold closed book","6-8":"Visible title detail","8-10":"Product ending"}};
const initialSettings={productId,videoStyle:"real_life",angle:"curiosity",voiceoverEnabled:true,voiceGender:"female",voiceStyle:"natural",subjectType:"female_creator",shariahCompliance:true,auratLevel:"full",durationSeconds:10};
const project={id:productId,stage:"ready",created_at:timestamp,updated_at:timestamp,image_count:1,image_urls:["/audit-fixture/product.png"],product:analysis,research};
let productExists=false,jobExists=false,completed=false,settings=initialSettings;
const state=()=>({paused:p0,ready:{gemini:true,nexabot:true,worker:true},products:productExists?[project]:[],jobs:jobExists?[{id:jobId,stage:completed?"completed":"processing",created_at:timestamp,updated_at:timestamp,product:analysis,research,plan,settings,retry_count:0,duration_seconds:10,segment_number:1,has_avatar:false,image_count:1,thumbnail_url:"/audit-fixture/product.png",...(completed?{video_url:"/audit-fixture/result.webm"}:{})}]:[],usage:jobExists?[{id:jobId,name:analysis.name,attempts:1,recorded_cost:.5,stage:completed?"completed":"processing"}]:[]});
async function capture(page,name,origin,{full=true,scroll=0}={}){
    await page.evaluate(y=>window.scrollTo({top:y,behavior:"instant"}),scroll);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);
    await page.evaluate(y=>window.scrollTo({top:y,behavior:"instant"}),scroll);await page.waitForTimeout(100);
    const filename=name+".png";await page.screenshot({path:path.join(output,filename),fullPage:false,animations:"disabled"});
    captures.push({file:filename,source:origin,viewport,scrollY:await page.evaluate(()=>window.scrollY),url:page.url()});
    if(full){const all=name+"-full.png";await page.screenshot({path:path.join(output,all),fullPage:true,animations:"disabled"});captures.push({file:all,source:origin,viewport,fullPage:true,url:page.url()});}
    console.log("Captured "+filename+" ["+origin+"]");
}
try{
  if(!p0){
  // Verify screenshot build is byte-identical to the live UI assets, not a redesign.
  const localHTML=await readFile(path.join(dist,"index.html")),liveResponse=await fetch(live+"/"),liveHTML=Buffer.from(await liveResponse.arrayBuffer());
  assert.equal(liveResponse.status,200);assert.equal(sha(localHTML),sha(liveHTML),"Local UI differs from production; do not capture a different version");
  for(const item of [...liveHTML.toString().matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1])){
    const response=await fetch(live+item),remote=Buffer.from(await response.arrayBuffer()),local=await readFile(path.join(dist,item.slice(1)));
    assert.equal(response.status,200);assert.equal(sha(local),sha(remote));assetChecks.push({path:item,sha256:sha(local)});
  }
  const health=await (await fetch(live+"/api/factory")).json();assert.equal(health.paused,true);assert.equal(health.ready.worker,false);
  const liveContext=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:"block"});
  await liveContext.route("**/*",async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===live&&req.method()==="GET")return route.continue();blocked.push({origin:u.origin,method:req.method()});await route.abort();});
  const livePage=await liveContext.newPage();
  await livePage.goto(live+"/#home");await livePage.getByText("Generation dijeda · draf masih boleh dibuat",{exact:true}).waitFor();
  await capture(livePage,"01-home-live","live");
  await livePage.getByRole("button",{name:"Buat Video Baru",exact:true}).first().click();
  await livePage.getByRole("heading",{name:"Produk",exact:true}).waitFor();await capture(livePage,"02-create-upload-live","live");await liveContext.close();
  }

  // Encode an explicitly labelled, silent local video fixture; no generation API.
  console.log("Creating synthetic video fixture");
  const jpeg=await sharp(png).resize(390,694,{fit:"contain",background:"#eeeede"}).jpeg().toBuffer();
  await new Promise((resolve,reject)=>{
    const encoder=spawn(process.env.AUDIT_FFMPEG||"ffmpeg",["-y","-f","image2pipe","-c:v","mjpeg","-framerate","8","-i","pipe:0","-c:v","libvpx",path.join(output,"fixture-result.webm")],{windowsHide:true,timeout:30000});
    let error="";encoder.stderr.on("data",chunk=>error+=chunk);encoder.on("error",reject);encoder.on("close",code=>code===0?resolve():reject(new Error(error)));encoder.stdin.on("error",reject);encoder.stdin.end(Buffer.concat(Array(80).fill(jpeg)));
  });
  const video=await readFile(path.join(output,"fixture-result.webm"));
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,"http://127.0.0.1");res.setHeader("Cache-Control","no-store");
      if(url.pathname==="/api/factory"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(state()));return;}
      if(req.method==="POST"&&["/api/products","/api/generate"].includes(url.pathname)){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
        res.setHeader("Content-Type","application/json");res.statusCode=202;
        if(url.pathname==="/api/products"){productExists=true;res.end(JSON.stringify({product:project}));}
        else{jobExists=true;completed=false;settings=body.settings;res.end(JSON.stringify({job:state().jobs[0]}));}return;
      }
      if(url.pathname.startsWith("/api/")){res.statusCode=404;res.end("Fixture route unavailable");return;}
      if(url.pathname==="/audit-fixture/product.png"){res.setHeader("Content-Type","image/png");res.end(png);return;}
      if(url.pathname==="/audit-fixture/result.webm"){
        const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||"");res.setHeader("Content-Type","video/webm");res.setHeader("Accept-Ranges","bytes");
        if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),video.length-1):video.length-1;res.statusCode=206;res.setHeader("Content-Range",`bytes ${start}-${end}/${video.length}`);res.setHeader("Content-Length",end-start+1);res.end(video.subarray(start,end+1));}else{res.setHeader("Content-Length",video.length);res.end(video);}return;
      }
      const file=path.resolve(dist,"."+(url.pathname==="/"?"/index.html":url.pathname));
      if(!file.startsWith(dist+path.sep)){res.statusCode=403;res.end();return;}
      res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".webmanifest":"application/manifest+json"})[path.extname(file)]||"application/octet-stream");res.end(await readFile(file));
    }catch{res.statusCode=500;res.end("Local audit fixture error");}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin="http://127.0.0.1:"+server.address().port;
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:"block"});
  await context.route("**/*",async route=>{const u=new URL(route.request().url());if(u.origin===origin||["data:","blob:"].includes(u.protocol))return route.continue();blocked.push({origin:u.origin,method:route.request().method()});await route.abort();});
  const page=await context.newPage();page.on("pageerror",e=>failures.push({screen:"browser",error:e.message}));
  if(p0){await page.goto(origin+"/#home");await page.getByText("Generation dijeda · draf masih boleh dibuat",{exact:true}).waitFor();await capture(page,"01-home-fixture","fixture");}
  await page.goto(origin+"/#create");if(p0){await page.getByRole("heading",{name:"Produk",exact:true}).waitFor();await capture(page,"02-create-upload-fixture","fixture");}await page.getByLabel("Upload gambar produk",{exact:true}).setInputFiles(path.join(output,"fixture-product.png"));
  await page.getByRole("button",{name:"Kenal Pasti Produk",exact:true}).click();await page.getByRole("heading",{name:analysis.name,exact:true}).waitFor();
  await capture(page,"03-product-analysis-fixture","fixture");
  await page.getByRole("button",{name:"Teruskan",exact:true}).click();await page.getByRole("heading",{name:p0?"Gaya Video":"Style",exact:true}).waitFor();await capture(page,"04-video-style-fixture","fixture");
  await page.getByRole("button",{name:"Real-Life Use Produk dalam rutin sebenar.",exact:true}).click();await page.getByRole("button",{name:"Teruskan",exact:true}).click();await page.getByRole("heading",{name:"Angle",exact:true}).waitFor();await capture(page,"05-angle-fixture","fixture");
  await page.getByRole("button",{name:"Curiosity",exact:true}).click();await page.getByRole("button",{name:"Teruskan",exact:true}).click();await page.getByRole("heading",{name:p0?"Creator & Suara":"Creator & Voice",exact:true}).waitFor();
  await page.getByRole("button",{name:"Perempuan Melayu",exact:true}).click();await page.getByRole("button",{name:"Creator perempuan",exact:true}).click();await capture(page,"06-creator-voice-fixture","fixture");
  const subjects=await page.getByRole("group",{name:"Subjek visual",exact:true}).evaluate(el=>el.getBoundingClientRect().top+window.scrollY-30);await capture(page,"06b-subject-shariah-aurat-fixture","fixture",{full:false,scroll:subjects});
  const aurat=await page.getByRole("group",{name:p0?"Penutupan aurat":"Liputan aurat",exact:true}).evaluate(el=>el.getBoundingClientRect().top+window.scrollY-170);await capture(page,"06c-aurat-fixture","fixture",{full:false,scroll:aurat});
  await page.getByRole("button",{name:"Teruskan",exact:true}).click();await page.getByRole("heading",{name:p0?"Semak":"Review",exact:true}).waitFor();await capture(page,"07-review-fixture","fixture");
  if(p0){await capture(page,"07b-review-details-fixture","fixture",{full:false,scroll:400});jobExists=true;completed=true;}
  else {
  await page.getByRole("button",{name:"Generate Video",exact:true}).click();
  await page.getByText("Video sedang dijana…",{exact:true}).first().waitFor();await capture(page,"08-processing-fixture","fixture");
  const progress=await page.locator(".pn-progress").evaluate(el=>el.getBoundingClientRect().top+window.scrollY-100);await capture(page,"08b-processing-stages-fixture","fixture",{full:false,scroll:progress});
  completed=true;await page.getByRole("link",{name:"Download Video",exact:true}).waitFor({timeout:20000});await page.locator("video").evaluate(async video=>{await video.play();});await page.waitForTimeout(1200);await page.locator("video").evaluate(video=>video.pause());
  await capture(page,"09-result-fixture","fixture");const actions=await page.getByRole("link",{name:"Download Video",exact:true}).evaluate(el=>el.getBoundingClientRect().top+window.scrollY-260);await capture(page,"09b-result-actions-fixture","fixture",{full:false,scroll:actions});
  await page.getByRole("button",{name:"Generate Lagi",exact:true}).click();await page.getByRole("dialog",{name:"Idea seterusnya?",exact:true}).waitFor();await capture(page,"09c-generate-again-fixture","fixture",{full:false,scroll:actions});await page.getByRole("button",{name:"Tutup",exact:true}).click();
  }
  await page.getByRole("navigation",{name:"Navigasi utama"}).getByRole("button",{name:p0?"Produk":"Projects",exact:true}).click();await page.getByRole("heading",{name:p0?"Produk":"Projects",exact:true}).waitFor();await capture(page,"10-projects-fixture","fixture");
  await page.getByRole("button",{name:analysis.name+" 1 video · Sedia untuk idea baru",exact:true}).click();await page.getByRole("button",{name:"Video Baru",exact:true}).waitFor();await capture(page,"11-product-project-fixture","fixture");
  await page.getByRole("navigation",{name:"Navigasi utama"}).getByRole("button",{name:"Home",exact:true}).click();await capture(page,"01b-home-populated-fixture","fixture");
  await page.getByRole("navigation",{name:"Navigasi utama"}).getByRole("button",{name:p0?"Kredit":"Credits",exact:true}).click();await capture(page,"12-credits-fixture","fixture");
  await page.getByRole("navigation",{name:"Navigasi utama"}).getByRole("button",{name:p0?"Saya":"Profile",exact:true}).click();await capture(page,"13-profile-fixture","fixture");
  assert.equal(failures.length,0,JSON.stringify(failures));await context.close();
}catch(e){failures.push({screen:"capture run",error:e.message});console.error(e.message);process.exitCode=1;}
finally{
  await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  const runtime={};for(const folder of ["src","cloud","public"]){async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else runtime[path.relative(root,file).replaceAll("\\","/")]=sha(await readFile(file));}}await walk(path.join(root,folder));}
  for(const file of ["package.json","package-lock.json","wrangler.jsonc","next.config.ts","tsconfig.json"])runtime[file]=sha(await readFile(path.join(root,file)));
  await writeFile(path.join(output,"capture-index.json"),JSON.stringify({captured_at:new Date().toISOString(),live,viewport,production_version:p0?null:"f6a4747b-e16c-4460-b3c1-cf8b37e41a98",capture_scope:p0?"Local P0 build, not deployed":"Production snapshot",production_paused:true,production_assets_verified:assetChecks,paid_api_requests:0,fixture_notice:"Fixture images, analysis, scripts, jobs and video are synthetic UI audit data. No provider execution. "+(p0?"P0 implementation preview, not production.":"No app source/copy/CSS changes.")+"",captures,failures,blocked_requests:blocked,runtime_sha256:runtime},null,2)+"\n");
  console.log(JSON.stringify({screenshots:captures.length,failures:failures.length,paid_api_requests:0}));
}
