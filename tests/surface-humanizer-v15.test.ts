import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hardSafetyProblems, scriptQualityProblems } from "../src/lib/pawarna/claim-guard";
import { DEFAULT_SETTINGS } from "../src/lib/pawarna/settings";
import type { ContentPlan, JobInput } from "../src/lib/pawarna/types";

const input:JobInput={images:["x"],mode:"Auto",instructions:"",angle_seed:"default",settings:{...DEFAULT_SETTINGS,productId:"p",videoStyle:"problem_solution",angle:"problem"}};
const plan=(route_id:ContentPlan["route_id"],script:string):ContentPlan=>({route_id,angle:"Problem → Solution",hook:script.split(/[?.!]/)[0]+"?",script,cta:"Klik link kat bawah.",mode:"Product Demo",visual_direction:"Product",claim_evidence_ids:[],video_prompt:"",scene_plan:{"0-2":"a","2-6":"b","6-8":"c","8-10":"d"}});

test("actual weak production phrases are detected as written surface language",()=>{
  for(const script of ["Ramai tengah cari Dr.Lan spray ni sekarang. Klik link kat bawah.","Ramai tengah beralih ke Dr.Lan spray ni. Klik link kat bawah.","Memang jadi pilihan untuk penjagaan rambut yang menipis. Klik link kat bawah.","Ramai dah mula guna Dr.Lan ni. Klik link kat bawah."])
    assert.ok(scriptQualityProblems(plan("RELATABLE_PAIN",script),input).some(reason=>/written|popularity/.test(reason)),script);
});

test("FOMO is optional outside FOMO_DISCOVERY and required only for its route",()=>{
  const natural="Rambut penuh dekat sikat tiap kali? Jangan buat tak tahu. Cuba tengok Dr.Lan ni. Klik link kat bawah.";
  assert.doesNotMatch(scriptQualityProblems(plan("RELATABLE_PAIN",natural),input).join(" "),/FOMO_DISCOVERY|missing general FOMO/);
  assert.match(scriptQualityProblems(plan("FOMO_DISCOVERY",natural),input).join(" "),/FOMO_DISCOVERY/);
  const discovery="Kalau tengah survey produk untuk rambut nipis, yang ni memang patut tengok. Klik link kat bawah.";
  assert.doesNotMatch(scriptQualityProblems(plan("FOMO_DISCOVERY",discovery),input).join(" "),/FOMO_DISCOVERY/);
});

test("humanizer contract preserves route, truth, CTA and forbids new claims",()=>{
  const source=readFileSync("src/services/pawarna/intelligence.ts","utf8");
  for(const token of ["SURFACE HUMANIZER V1.5","Preserve EXACTLY: route","grounded problem","grounded solution","Introduce NO new product fact","return {...plan,route_id:route","shorten naturally"])
    assert.ok(source.includes(token),token);
});

test("natural shortened product references remain safe but outcome drift does not",()=>{
  const spoken=plan("DIRECT_RECOMMENDATION","Kalau rambut dah makin nipis, cuba tengok Dr.Lan ni. Spray ni untuk penjagaan rambut menipis. Klik link kat bawah.");
  assert.deepEqual(hardSafetyProblems(spoken),[]);
  assert.match(hardSafetyProblems({...spoken,script:"Kalau rambut nipis, Dr.Lan ni buat rambut lebih lebat. Klik link kat bawah."}).join(" "),/outcome drift/);
});

test("Gummies surface stays conversational without immunity or catalogue claims",()=>{
  const spoken=plan("CURIOSITY","Gummy vitamin C bentuk macam ni senang tarik perhatian? Cuba tengok yang ni dekat link bawah. Klik link kat bawah.");
  assert.deepEqual(hardSafetyProblems(spoken),[]);assert.doesNotMatch(scriptQualityProblems(spoken,{...input,settings:{...input.settings!,angle:"curiosity"}}).join(" "),/catalogue/);
  assert.match(hardSafetyProblems({...spoken,script:"Gummy ni buat anak lebih kuat imun. Klik link kat bawah."}).join(" "),/outcome drift/);
});
