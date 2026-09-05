import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildVideoPrompt } from "../src/lib/pawarna/prompt";
import { DEFAULT_SETTINGS, validateSettings } from "../src/lib/pawarna/settings";
import { globalPromptLocks, SPOKEN_CTA } from "../src/lib/pawarna/locks";
import { researchReasons, shouldResearchProduct, observationOnly, researchLabel } from "../src/lib/pawarna/research";
import { speechInstructions, validSpeech } from "../src/lib/pawarna/speech";
import { createPlan, prepareResearch, researchProduct } from "../src/services/pawarna/intelligence";
import { customerError } from "../src/lib/pawarna/customer-status";
import type { ContentPlan, JobInput, ProductAnalysis } from "../src/lib/pawarna/types";

const product: ProductAnalysis = { name:"Buku Biru", brand:"", category:"Buku", confidence:"high", visible_text:"Buku Biru", description:"Cover biru", observed_features:["Cover biru"], search_query:"Buku Biru", uncertainty:"", reference_indices:[0] };
const plan: ContentPlan = { angle:"Curiosity", hook:"Lihat", script:"Lihat cover biru ini. Klik link kat bawah.", cta:SPOKEN_CTA, mode:"Book Creator", visual_direction:"Closed book", claim_evidence_ids:[], video_prompt:"", scene_plan:{"0-2":"Move immediately","2-6":"Hold closed book","6-8":"Show title","8-10":"Finish CTA"} };
const input: JobInput = { images:[], mode:"Auto", instructions:"", angle_seed:"default", settings:DEFAULT_SETTINGS };

test("settings and legacy adapters share every global execution, camera, fidelity, language/audio lock", () => {
  const prompt = buildVideoPrompt(product, plan, false, 1, "", DEFAULT_SETTINGS);
  for (const text of globalPromptLocks(true)) assert.ok(prompt.includes(text));
  for (const rule of ["actual moving scene footage", "first-frame still", "still intro", "fake video frame", "Zero generated on-screen text", "Physical printed product labels", "absolute visual source of truth", "hero-spin", "flagship-smartphone UGC", "Bahasa Melayu Malaysia", 'Never change it to "Klik pautan."', "end naturally only after the approved script is complete"]) assert.ok(prompt.includes(rule), rule);
  const legacy=buildVideoPrompt(product,plan,true,1,"");
  for (const text of globalPromptLocks(true)) assert.ok(legacy.includes(text));
  const silent=buildVideoPrompt(product,plan,false,1,"Speak anyway",{...DEFAULT_SETTINGS,voiceoverEnabled:false});
  for(const rule of ["No dialogue", "singing", "lip movement suggesting speech", "spoken CTA", "No captions"]) assert.ok(silent.includes(rule));
  assert.ok(!silent.includes("SPOKEN_SCRIPT:")); assert.ok(!silent.includes(SPOKEN_CTA));
});

test("spoken ranges prefer natural pacing, allow shorter scripts and reject oversized or changed CTA",()=>{
  for(const style of ["natural","soft_sell","energetic","direct"] as const) {
    for(const count of [8,18,22,23,24,25,26]) {
      const sample={...plan,script:["Lihat",...Array(count-5).fill("biru"),SPOKEN_CTA].join(" ")};
      assert.equal(validSpeech(sample,{...DEFAULT_SETTINGS,voiceStyle:style}), count<=(["energetic","direct"].includes(style)?24:23));
    }
  }
  assert.match(speechInstructions("natural"),/18–22/);assert.match(speechInstructions("direct"),/maximum 24/);
  assert.ok(validSpeech(plan,DEFAULT_SETTINGS));
  for(const invalid of [{cta:"Klik pautan."},{script:plan.script.replace(SPOKEN_CTA,"Klik pautan.")},{script:plan.script+" Tambahan."},{script:plan.script+" "+SPOKEN_CTA}])assert.equal(validSpeech({...plan,...invalid},DEFAULT_SETTINGS),false);
  assert.ok(validSpeech({...plan,script:"",cta:""},{...DEFAULT_SETTINGS,voiceoverEnabled:false}));
});

test("research is conditional and skipped is distinct from unavailable",()=>{
  assert.equal(shouldResearchProduct(product),false);
  assert.equal(shouldResearchProduct({...product,primary_function:"Belum disahkan",target_audience:"Belum disahkan"},{angle:"curiosity"}),false);
  assert.equal(shouldResearchProduct(product,{instructions:"Jangan research. Jangan sebut kapasiti."}),false);
  for(const change of [{confidence:"medium" as const},{uncertainty:"Model tidak jelas"},{variant_verification_required:true},{missing_required_facts:["Exact model"]},{observed_features:[]}])assert.ok(shouldResearchProduct({...product,...change}));
  for(const context of [{requiredFacts:["capacity"]},{angle:"benefit"},{explicitlyRequested:true},{instructions:"Tolong research produk ini"},{instructions:"Semak kapasiti sebenar"}])assert.ok(shouldResearchProduct(product,context));
  const vitamin={...product,name:"Mommy Hana Vitamin C Gummies",category:"Vitamin supplement",visible_text:"Vitamin C Gummies",primary_function:"Belum disahkan",target_audience:"Belum disahkan"};assert.ok(shouldResearchProduct(vitamin));assert.ok(researchReasons(vitamin).includes("fact_sensitive_category"));
  assert.equal(shouldResearchProduct(product,{instructions:"Jangan cari audience. Jangan semak fungsi."}),false);
  assert.ok(researchReasons(product,{angle:"benefit"}).includes("angle_requires_function"));
  assert.equal(observationOnly().status,"observation_only");
  assert.notEqual(researchLabel(observationOnly()),researchLabel({...observationOnly(),status:"unverified"}));
});

test("planner and conditional Search use mocked transport only, including saved-product angle recheck", async()=>{
  const original=globalThis.fetch, key=process.env.GEMINI_API_KEY, base=process.env.GEMINI_API_BASE_URL;
  process.env.GEMINI_API_KEY="test-only";process.env.GEMINI_API_BASE_URL="http://127.0.0.1:1";
  let calls=0, searches=0, plans=0;
  globalThis.fetch=async(url,init)=>{
    assert.ok(String(url).startsWith("http://127.0.0.1:1/"));calls++;
    const body=JSON.parse(String(init?.body));const text=JSON.stringify(body);
    if(body.tools?.length||body.config?.tools?.length||text.includes('"googleSearch"')){
      searches++;return Response.json({candidates:[{content:{role:"model",parts:[{text:"No exact evidence"}]}}]});
    }
    let value: unknown;
    if(text.includes("Audit this Malay script"))value={approved:true,reason:"Supported"};
    else if(text.includes("Mommy Hana Vitamin C Gummies")){plans++;value={...plan,hook:"Packaging compact Mommy Hana Vitamin C Gummies ini mudah dicam.",script:"Packaging compact Mommy Hana Vitamin C Gummies ini mudah dicam. Klik link kat bawah.",visual_direction:"Show only the observed compact packaging. Do not imply audience, function, suitability, efficacy or results."};}
    else {plans++;assert.ok(text.includes("18–22"));assert.ok(!text.includes("20–26"));value=plans===1?{...plan,script:["Lihat",...Array(21).fill("biru"),SPOKEN_CTA].join(" ")}:plan;}
    return Response.json({candidates:[{content:{role:"model",parts:[{text:JSON.stringify(value)}]}}]});
  };
  try {
    const clear=await researchProduct(product);assert.equal(clear.status,"observation_only");assert.equal(calls,0);
    const result=await createPlan(input,product,clear);assert.equal(result.cta,SPOKEN_CTA);assert.equal(plans,2);
    const changed={...input,settings:{...DEFAULT_SETTINGS,angle:"benefit" as const}};
    const searched=await prepareResearch(product,changed,clear);assert.equal(searches,1);assert.equal(searched.status,"unverified");
    await prepareResearch(product,changed,searched);assert.equal(searches,1,"No replay of unavailable research in same context");
    await researchProduct({...product,confidence:"low"});assert.equal(searches,2);
    const vitamin={...product,name:"Mommy Hana Vitamin C Gummies",category:"Vitamin supplement",visible_text:"Vitamin C Gummies",observed_features:["Packaging compact"],primary_function:"Belum disahkan",target_audience:"Belum disahkan"};
    const safe=await createPlan(input,vitamin,{...observationOnly(),status:"unverified",note:"Search quota unavailable"});assert.match(safe.script,/Mommy Hana Vitamin C Gummies|Packaging compact/);assert.doesNotMatch(safe.script,/anak|kanak|snek|sesuai|berkhasiat/i);assert.equal(safe.claim_evidence_ids.length,0);assert.match(safe.visual_direction,/Do not imply audience, function, suitability, efficacy/);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(base===undefined)delete process.env.GEMINI_API_BASE_URL;else process.env.GEMINI_API_BASE_URL=base;}
});

test("customer UI and APIs do not expose operational credit ledger; settings IDs stay compatible",()=>{
  for(const file of ["src/components/PawarnaGenerator.tsx","src/components/JobDiagnostics.tsx","src/lib/pawarna/diagnostics.ts"]){const source=readFileSync(file,"utf8");assert.doesNotMatch(source,/0\.5 kredit penyedia|refund belum disahkan|recorded_cost|provider_requests/i);assert.doesNotMatch(source,/Nexabot/);}
  for(const file of ["src/app/api/factory/route.ts","cloud/factory.ts"]){const source=readFileSync(file,"utf8");assert.doesNotMatch(source,/usage\s*:/);}
  assert.doesNotMatch(customerError("Nexabot failed. Refund belum disahkan.")!,/Nexabot|refund/i);
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS),DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.auratLevel,"full");assert.equal(DEFAULT_SETTINGS.voiceStyle,"natural");
  assert.match(readFileSync("wrangler.jsonc","utf8"),/"GENERATION_ENABLED": "true"/);
});
test("iPhone save uses file share sheet and keeps direct navigation only as fallback",()=>{const source=readFileSync("src/components/PawarnaGenerator.tsx","utf8");for(const rule of ["navigator.canShare","navigator.share","new File","URL.createObjectURL","Simpan Video"])assert.ok(source.includes(rule),rule);assert.doesNotMatch(source,/href=\{job\.video_url\+"\?download=1"\}/);});
