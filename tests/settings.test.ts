import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, VIDEO_STYLES, ANGLES, validateSettings, supportsCreator } from "../src/lib/pawarna/settings";
import { buildVideoPrompt } from "../src/lib/pawarna/prompt";
import { publicProduct, correction, applyCorrections, type ProductProject } from "../src/lib/pawarna/projects";
import type { ProductAnalysis, ContentPlan } from "../src/lib/pawarna/types";
const product:ProductAnalysis={name:"Buku",brand:"",category:"Buku",confidence:"high",visible_text:"Buku",description:"Cover biru",observed_features:["Biru"],search_query:"Buku",uncertainty:"",reference_indices:[0]};
const plan:ContentPlan={angle:"curiosity",hook:"Lihat cover ini",script:"Lihat cover ini. Klik link kat bawah.",cta:"Klik link kat bawah.",mode:"Book Creator",visual_direction:"Closed book",claim_evidence_ids:[],video_prompt:"",scene_plan:{"0-2":"Hook with closed cover","2-6":"Hold closed book","6-8":"Show visible detail","8-10":"Set down"}};
test("default controls and strict enum/boolean/duration/owner binding validation",()=>{
 assert.deepEqual(validateSettings(DEFAULT_SETTINGS),DEFAULT_SETTINGS);
 for(const invalid of [{voiceoverEnabled:"false"},{durationSeconds:20},{videoStyle:"invalid"},{angle:"invalid"},{voiceGender:"robot"},{subjectType:"child"},{auratLevel:null},{shariahCompliance:false},{productId:12}])assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,...invalid}));
 assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,productId:"someone-else"},"owned"));
 assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,subjectType:"female_creator"}));
 assert.equal(validateSettings({...DEFAULT_SETTINGS,videoStyle:"real_life",subjectType:"female_creator"}).subjectType,"female_creator");
});
test("all eight styles and eleven angles compile their distinct direction",()=>{
 const prompts=VIDEO_STYLES.map(style=>buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,videoStyle:style.id}));assert.equal(new Set(prompts).size,8);
 const angles=ANGLES.map(a=>buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,angle:a[0]}));assert.equal(new Set(angles).size,11);
 assert.equal(supportsCreator("pov_demo"),false);assert.equal(supportsCreator("doodle_ugc"),true);
});
test("voice OFF cannot inherit any spoken script or audio-on module",()=>{
 const prompt=buildVideoPrompt(product,plan,false,1,"Speak loudly",{...DEFAULT_SETTINGS,voiceoverEnabled:false});
 assert.match(prompt,/VOICEOVER: OFF/);assert.doesNotMatch(prompt,/SPOKEN_SCRIPT:|Generate audible|Speak only/);assert.match(prompt,/No captions/);
});
test("Shariah OFF removes both compliance and aurat modules",()=>{
 const off=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,shariahCompliance:false,auratLevel:null});assert.doesNotMatch(off,/SHARIAH_RULES:|AURAT_RULES:|hijab/);
 const full=buildVideoPrompt(product,plan,true,1,"",{...DEFAULT_SETTINGS,videoStyle:"real_life",subjectType:"female_creator"});assert.match(full,/SHARIAH_RULES:/);assert.match(full,/AURAT_RULES:/);assert.match(full,/overriding avatar clothing/);assert.match(full,/facial identity/);
});
test("visual master, scene beats, product fidelity and correct hand anatomy are locked",()=>{
 const prompt=buildVideoPrompt(product,plan,false,1,"",DEFAULT_SETTINGS);
 for(const part of ["PAWARNA_VISUAL_MASTER_LOCK","PRODUCT_LOCK","REAL-WORLD PRODUCT SCALE LOCK","believable palm or hand proportions","oversized","hero-sized","stretched","elongated","large in frame does not mean physically oversized","SCENE_PLAN",'"0-2"','"2-6"','"6-8"','"8-10"',"five fingers","natural grip","realistic product scale","grey wash","fake HDR"])assert.ok(prompt.includes(part),part);
 const noHands=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,subjectType:"no_hands",shariahCompliance:false,auratLevel:null});assert.match(noHands,/No people, hands, faces/);assert.doesNotMatch(noHands,/Hands-only POV/);
});
test("reference sanitization is global and preserves only physical product identity",()=>{
 const prompt=buildVideoPrompt(product,plan,false,1,"",DEFAULT_SETTINGS);
 for(const rule of ["PRODUCT IDENTITY REFERENCES ONLY","Never display the source reference image","TikTok UI","social-media controls","very first rendered frame","genuine physical product-label text"])assert.ok(prompt.includes(rule),rule);
 const ordered=["PAWARNA_VIDEO_EXECUTION_LOCK:","REFERENCE_SANITIZATION_LOCK:","PAWARNA_VISUAL_MASTER_LOCK:","PRODUCT_LOCK:","CAMERA_LOCK:","VIDEO_STYLE:","SALES_ANGLE:","SCENE_PLAN:","PRODUCT_INTELLIGENCE:","SPOKEN_SCRIPT:","USER_INSTRUCTIONS:"];
 for(let i=1;i<ordered.length;i++)assert.ok(prompt.indexOf(ordered[i-1])<prompt.indexOf(ordered[i]),`${ordered[i-1]} before ${ordered[i]}`);
});
test("strict POV camera rules are isolated and no-hands fallback remains hand-free",()=>{
 const pov=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,subjectType:"female_hands"});
 for(const rule of ["DIRECT-EYESIGHT POV","camera IS the viewer's direct eyesight","smartphone used for filming","camera body","viewfinder","recording interface","screen-within-screen","The video itself IS the POV","TRUE FIRST-PERSON POV","originate naturally from below the camera","third person","commercial hero shot","commercial montage"])assert.ok(pov.includes(rule),rule);
 for(const style of ["product_motion","closeup_detail","mini_commercial_ugc"] as const){const other=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,videoStyle:style});assert.doesNotMatch(other,/DIRECT-EYESIGHT POV|TRUE FIRST-PERSON POV|camera IS the viewer's direct eyesight|originate naturally from below the camera/);}
 const noHands=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,subjectType:"no_hands"});assert.match(noHands,/POV camera view/);assert.doesNotMatch(noHands,/Hands and forearms originate|hands originate naturally/);
});
test("decorative overlays are prohibited while Doodle UGC keeps its intentional non-text exception",()=>{
 for(const style of ["problem_solution","pov_demo","real_life","product_motion","satisfying_demo","closeup_detail","mini_commercial_ugc"] as const){const normal=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,videoStyle:style});for(const rule of ["ZERO DECORATIVE OVERLAY LOCK","white sparkles","shine stars","floating icons","decorative particles","animated graphics","generated visual callouts","fake UI","text overlays","Natural real-world light reflections"])assert.ok(normal.includes(rule),`${style}: ${rule}`);}
 const doodle=buildVideoPrompt(product,plan,false,1,"",{...DEFAULT_SETTINGS,videoStyle:"doodle_ugc"});for(const rule of ["DOODLE UGC EXCEPTION","intentional, minimal non-text doodle","no random text","fake UI","alien lettering"])assert.ok(doodle.includes(rule),rule);
});
test("multi-piece set remains the product identity without forcing every piece into every frame",()=>{
 const set={...product,productStructure:{type:"set" as const,visiblePieceCount:5,majorComponents:["five cookware vessels"],accessories:["two oven mitts"]}};
 const prompt=buildVideoPrompt(set,plan,false,1,"",DEFAULT_SETTINGS);for(const rule of ["PRODUCT SET IDENTITY LOCK","complete set as the product identity","Individual pieces may be used or demonstrated","do not force every piece into every frame","never silently reduce it to fewer pieces","invent additional pieces","duplicate pieces to fake quantity"])assert.ok(prompt.includes(rule),rule);
});
test("public product allowlist hides owner and storage; correction remains unverified note",()=>{
 const p=publicProduct({id:"example",owner:"PRIVATE",input_key:"PRIVATE/R2",created_at:1,updated_at:1,stage:"ready",image_count:2,product,corrections:"User label"});
 assert.doesNotMatch(JSON.stringify(p),/PRIVATE/);assert.equal(p.image_urls.length,2);assert.equal(correction("  Label  "),"Label");assert.throws(()=>correction("x".repeat(1001)));
});
test("identity correction invalidates old web claims and does not change original product object",()=>{
 const p:ProductProject={id:"p",owner:"o",input_key:"private",created_at:1,updated_at:1,stage:"ready",image_count:1,product,research:{status:"grounded",sources:[{id:"s",url:"https://example.com",title:"source"}],evidence:[{id:"e",text:"old",source_ids:["s"]}],queries:["old"],search_html:"",note:"old"}};
 applyCorrections(p,{name:"Buku baru",category:"Buku",corrections:"Label baru"});assert.equal(p.product?.name,"Buku baru");assert.equal(product.name,"Buku");assert.equal(p.product?.confidence,"low");assert.equal(p.research?.status,"unverified");assert.equal(p.research?.evidence.length,0);
});
