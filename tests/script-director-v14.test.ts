import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hardSafetyProblems, scriptQualityProblems } from "../src/lib/pawarna/claim-guard";
import { productTruth, SALES_ROUTES, selectSalesRoute, type SalesRouteId } from "../src/lib/pawarna/script-director";
import { DEFAULT_SETTINGS } from "../src/lib/pawarna/settings";
import { createPlan, outputTrace } from "../src/services/pawarna/intelligence";
import { observationOnly } from "../src/lib/pawarna/research";
import type { ContentPlan, JobInput, ProductAnalysis } from "../src/lib/pawarna/types";

const drLan:ProductAnalysis={name:"Dr.Lan Black Sesame Black Rice & Rosemary Water Spray For Hair",brand:"Dr.Lan",category:"hair care",confidence:"high",visible_text:"FOR THINNING HAIR AND HAIR LOSS",description:"Hair water spray",observed_features:["Packaging states FOR THINNING HAIR AND HAIR LOSS"],physical_product_text:["FOR THINNING HAIR AND HAIR LOSS"],search_query:"",uncertainty:"",reference_indices:[0],primary_function:"penjagaan rambut menipis dan rambut gugur"};
const input:JobInput={images:["x"],mode:"Auto",instructions:"",angle_seed:"default",settings:{...DEFAULT_SETTINGS,productId:"p",videoStyle:"problem_solution",angle:"problem"}};
const base:ContentPlan={route_id:"RELATABLE_PAIN",angle:"Problem → Solution",hook:"Rambut makin gugur bila sikat?",script:"Rambut makin gugur bila sikat? Jangan buat tak tahu. Cuba tengok Dr.Lan ni. Klik link kat bawah.",cta:"Klik link kat bawah.",mode:"Product Demo",visual_direction:"Show product",claim_evidence_ids:[],video_prompt:"",scene_plan:{"0-2":"a","2-6":"b","6-8":"c","8-10":"d"}};

test("route is selected before writing and avoids recent routes",()=>{
  const history:SalesRouteId[]=[];
  for(let i=0;i<5;i++){const route=selectSalesRoute({...input,previous_routes:history});assert.ok(SALES_ROUTES.includes(route));history.push(route);}
  assert.equal(new Set(history).size,5);
  assert.notEqual(history[0],history[1]);
});

test("all routes exhaust before least-recent route is reused",()=>{
  const history=[...SALES_ROUTES];
  assert.equal(selectSalesRoute({...input,previous_routes:history}),history[0]);
});

test("product truth locks Dr. Lan positioning and Gummies forbidden outcome",()=>{
  const truth=productTruth(drLan);assert.match(truth.grounded_solution,/penjagaan rambut menipis/);assert.ok(truth.forbidden_outcomes.includes("rambut lebih lebat"));
  const gummy=productTruth({...drLan,name:"Vitamin C Gummies",category:"vitamin gummy",visible_text:"Vitamin C Gummies",physical_product_text:["Vitamin C Gummies"],primary_function:"suplemen vitamin C dalam bentuk gummy"});
  assert.ok(gummy.forbidden_outcomes.includes("lebih kuat imun"));
});

test("written-ad language and empty filler are soft-rejected",()=>{
  for(const script of ["Dr.Lan ni bantu jaga rambut anda. Klik link kat bawah.","Ramai dah mula beralih kepada Dr.Lan ni. Klik link kat bawah.","Dr.Lan ni dirumus khas untuk masalah rambut gugur. Klik link kat bawah.","Rambut makin gugur? Bagus untuk penjagaan. Klik link kat bawah."]){
    assert.ok(scriptQualityProblems({...base,hook:script.split(".")[0],script},input).length,script);
  }
});

test("outcome drift is hard-rejected unless exact evidence supports it",()=>{
  const drift={...base,script:"Rambut makin gugur? Dr.Lan ni untuk rambut lebih lebat. Klik link kat bawah."};
  assert.match(hardSafetyProblems(drift).join(" "),/outcome drift/);
  assert.doesNotMatch(hardSafetyProblems(drift,"Kajian produk menyokong rambut lebih lebat").join(" "),/outcome drift/);
  assert.match(hardSafetyProblems({...base,script:"Vitamin C Gummies buat anak lebih kuat imun. Klik link kat bawah."}).join(" "),/outcome drift/);
});

test("generic FOMO remains safe while personal experience and exact proof remain hard failures",()=>{
  assert.deepEqual(hardSafetyProblems({...base,script:"Yang ni memang ramai tengah tengok. Klik link kat bawah."}),[]);
  for(const script of ["Aku dah guna Dr.Lan. Klik link kat bawah.","Dah 10 ribu terjual. Klik link kat bawah.","Rating 4.9. Klik link kat bawah."])assert.ok(hardSafetyProblems({...base,script}).length,script);
});

test("route history is persisted by both local and cloud script endpoints",()=>{
  for(const file of ["cloud/products.ts","src/app/api/products/[id]/script/route.ts"]){const source=readFileSync(file,"utf8");for(const token of ["routeHistory","previous_routes","route_history"])assert.ok(source.includes(token),`${file}: ${token}`);}
});

test("weak written ad-copy receives rewrite feedback and becomes spoken Malay",async()=>{
  const original=globalThis.fetch,key=process.env.GEMINI_API_KEY,baseUrl=process.env.GEMINI_API_BASE_URL;let drafts=0,humanized=false;
  process.env.GEMINI_API_KEY="test-only";process.env.GEMINI_API_BASE_URL="http://127.0.0.1:1";
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body)),text=JSON.stringify(body);let value:unknown;
    if(text.includes("SURFACE HUMANIZER V1.5")){humanized=true;value={hook:"Rambut makin gugur bila sikat?",script:"Rambut makin gugur bila sikat? Jangan buat tak tahu. Cuba tengok Dr.Lan ni. Klik link kat bawah.",cta:"Klik link kat bawah."};}
    else if(text.includes("FINAL SPOKEN-MALAY QA V1.7"))value={natural:true,reason:"Natural",hook:"Rambut makin gugur bila sikat?",script:"Rambut makin gugur bila sikat? Jangan buat tak tahu. Cuba tengok Dr.Lan ni. Klik link kat bawah sekarang.",cta:"Klik link kat bawah sekarang."};
    else if(text.includes("Audit this Malay script"))value={safety_safe:true,quality_approved:drafts>1,reason:drafts>1?"Spoken":"Written advertising language"};
    else {drafts++;value=drafts===1
      ? {...base,script:"Rambut makin gugur? Dr.Lan ni dirumus khas untuk masalah rambut gugur. Klik link kat bawah.",hook:"Rambut makin gugur?"}
      : {...base,script:"Rambut makin gugur bila sikat? Jangan buat tak tahu. Cuba tengok Dr.Lan ni, ramai tengah cari yang macam ni. Klik link kat bawah.",hook:"Rambut makin gugur bila sikat?"};}
    return Response.json({candidates:[{content:{role:"model",parts:[{text:JSON.stringify(value)}]}}]});
  };
  try{const result=await createPlan(input,drLan,observationOnly());assert.equal(drafts,2);assert.equal(humanized,true);assert.doesNotMatch(result.script,/anda|dirumus khas|beralih kepada/i);assert.equal(result.route_id,"RELATABLE_PAIN");const trace=outputTrace(result)!;assert.equal(trace.displayed_final,result.script);assert.equal(trace.final_normalized_candidate,result.script);assert.notEqual(trace.route_draft,trace.displayed_final);}
  finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(baseUrl===undefined)delete process.env.GEMINI_API_BASE_URL;else process.env.GEMINI_API_BASE_URL=baseUrl;}
});
