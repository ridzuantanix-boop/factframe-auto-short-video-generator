import type { ContentPlan, JobInput, ProductAnalysis } from "./types";

const rules:[string,RegExp][]=[
  ["unsupported creator experience",/\b(?:saya|aku)\s+(?:dah|sudah|memang|selalu|pernah)\s+(?:guna|pakai|cuba|test|makan)|\banak (?:saya|aku) (?:guna|suka)\b|\b(?:saya|aku) (?:suka sebab|suka|repeat|beli lagi)\b/i],
  ["unsupported testimonial or social proof",/\b(?:ramai (?:ibu|parents?|orang|yang)?\s*(?:dah )?(?:guna|beli|repeat|puas hati)|semua (?:dah guna|puas hati)|feedback (?:memang )?best|customer (?:dah guna|puas hati)|viral|trending|best\s?seller|popular|famous|recommended by many|\d+[km]?\s+(?:satisfied|puas hati))\b/i],
  ["unsupported price or promotion",/\b(?:harga (?:tengah )?(?:promo|jatuh|berbaloi|murah|special)|sekarang murah|murah sekarang|diskaun besar|tengah sale|special price|offer hari ini|offer hari ni|promo)\b/i],
  ["unsupported scarcity or urgency",/\b(?:stok tinggal sikit|tinggal beberapa unit|cepat sebelum habis|ramai tengah grab|promo nak habis|last chance|harga akan naik)\b/i],
  ["unsupported medical efficacy",/\b(?:confirm|terbukti|dijamin|guaranteed?)\s+(?:sangat\s+)?(?:berkesan|hentikan|tumbuhkan|merawat)|(?:kuatkan|tingkatkan|boosts?)\s+(?:imuniti|immune)|mencegah penyakit|merawat|treats?|improves? appetite|lebih sihat\b/i],
];

export function claimGuardReasons(text:string){return rules.filter(([,pattern])=>pattern.test(text)).map(([reason])=>reason);}
export function planClaimGuard(plan:ContentPlan){
  return [...new Set(claimGuardReasons([plan.hook,plan.script,plan.visual_direction,...Object.values(plan.scene_plan||{})].join(" ")))];
}

export function hardSafetyProblems(plan:ContentPlan,evidenceText=""){
  const text=[plan.hook,plan.script,plan.visual_direction,...Object.values(plan.scene_plan||{})].join(" "),problems=planClaimGuard(plan);
  const number=text.match(/\d+[\d,.]*/)?.[0];
  if(/\b(?:\d+[\d,.]*\s*(?:k|ribu|juta)?\s*(?:terjual|sold|review|ulasan)|rating\s*\d|\d+%|nombor\s*1|top seller)\b/i.test(text)&&(!number||!evidenceText.toLowerCase().includes(number.toLowerCase())))problems.push("numeric social proof lacks cited evidence");
  return [...new Set(problems)];
}

const genericHook=/^(?:tengah cari produk|tengah cari .+ yang sesuai|nak cari produk|ini produk|produk ni|kalau korang tengah cari|jom tengok produk|nak tahu produk apa)/i;
const formalCopy=/\b(?:produk ini sesuai untuk|produk ini mengandungi|produk ini direka untuk|produk ini merupakan|berdasarkan maklumat|bagi mereka yang|sekiranya anda)\b/i;
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g," ").trim();
export function scriptSimilarity(a:string,b:string){const aa=new Set(normalize(a).split(" ").filter(Boolean)),bb=new Set(normalize(b).split(" ").filter(Boolean));if(!aa.size||!bb.size)return 0;const common=[...aa].filter(word=>bb.has(word)).length;return common/(aa.size+bb.size-common);}
export function scriptQualityProblems(plan:ContentPlan,input:JobInput){
  if(input.settings?.voiceoverEnabled===false)return [];
  const problems:string[]=[];const hook=plan.hook.trim(),script=plan.script.trim();
  if(genericHook.test(hook))problems.push("generic non-hook");
  if(formalCopy.test(script))problems.push("written or formal catalogue language");
  if(/^ini\s+[^.?!]+[.?!]?\s*(?:klik link kat bawah\.)?$/i.test(script)||script.split(/[.!?]+/).filter(Boolean).length<2)problems.push("catalogue description without consumer relevance");
  const problemSelected=input.settings?.videoStyle==="problem_solution"||input.settings?.angle==="problem";
  if(problemSelected&&!/(?:susah|tak suka|tak mahu|penat|risau|masalah|makin|selalu|bila|sampai|rimas|leceh|gugur|nipis|kering|berminyak|kotor|panas)/i.test(hook))problems.push("Problem → Solution lacks recognizable friction");
  if(problemSelected&&!/(?:jangan|risau|ketara|buat tak tahu|ambil perhatian|makin teruk|sebelum jadi|dah mula)/i.test(script.slice(hook.length)))problems.push("Problem → Solution lacks tension or consequence");
  if(input.previous_hook&&hook.toLowerCase()===input.previous_hook.trim().toLowerCase())problems.push("regeneration repeated the previous hook");
  for(const previous of input.previous_scripts||[])if(normalize(script)===normalize(previous)||scriptSimilarity(script,previous)>=.72){problems.push("regeneration substantially duplicates a recent script");break;}
  return problems;
}

export function semanticFallbackPlan(plan:ContentPlan,product:ProductAnalysis,input:JobInput,voice:boolean):ContentPlan{
  const profile=product.product_profile,name=(profile?.productIdentity||product.name).trim(),purpose=(profile?.primaryFunction||product.primary_function||"").trim();
  const knownPurpose=purpose&&!/belum disahkan|unknown/i.test(purpose)?purpose:"";
  const problem=input.settings?.videoStyle==="problem_solution"||input.settings?.angle==="problem";
  const hook=problem?`Susah nak cari ${product.category.toLowerCase()} yang mudah digunakan?`:`Kenalkan ${name}.`;
  const fact=knownPurpose?`${name}, ${purpose.replace(/^digunakan untuk /i,"untuk ")}.`:`Ini ${name}${product.variant?`, varian ${product.variant}`:""}.`;
  const script=voice?`${hook} ${fact} Klik link kat bawah.`:"";
  return {...plan,angle:problem?"Problem → Solution":plan.angle,hook:voice?hook:"Show a supported product fact",script,cta:voice?"Klik link kat bawah.":"",claim_evidence_ids:[],visual_direction:"Create the selected creative structure using sales-intelligence facts. Keep generic container appearance only for visual fidelity, never as the sales message. Do not imply audience, function, suitability, efficacy, ingredients or specifications beyond the supplied supported sales intelligence.",scene_plan:{"0-2":problem?"Show a relatable everyday friction without claiming a medical outcome":"Open on the identified product in a new moving scene","2-6":"Introduce the exact product identity and supported category function","6-8":"Demonstrate only the supported format or use context","8-10":"End on the product while the exact CTA finishes"},video_prompt:""};
}
