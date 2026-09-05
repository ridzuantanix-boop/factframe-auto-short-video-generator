import type { ContentPlan, JobInput, ProductAnalysis } from "./types";

const rules:[string,RegExp][]=[
  ["unsupported creator experience",/\b(?:saya|aku)\s+(?:dah|sudah|memang|selalu|pernah)\s+(?:guna|pakai|cuba|test|makan)|\banak saya suka\b|\bsaya (?:suka|repeat|beli lagi)\b/i],
  ["unsupported testimonial or social proof",/\b(?:review (?:kata )?(?:bagus|best|positif)|ramai (?:ibu|parents?|orang|yang)?\s*(?:dah )?(?:guna|beli|repeat|puas hati|suka)|semua suka|feedback (?:memang )?best|customer suka|viral|trending|best\s?seller|popular|famous|recommended by many|\d+[km]?\s+(?:satisfied|puas hati))\b/i],
  ["unsupported price or promotion",/\b(?:harga (?:tengah )?(?:promo|jatuh|berbaloi|murah|special)|sekarang murah|murah sekarang|diskaun besar|tengah sale|special price|offer hari ini|offer hari ni|promo)\b/i],
  ["unsupported scarcity or urgency",/\b(?:stok tinggal sikit|tinggal beberapa unit|cepat sebelum habis|ramai tengah grab|promo nak habis|last chance|harga akan naik)\b/i],
  ["unsupported medical efficacy",/\b(?:kuatkan|tingkatkan|boosts?)\s+(?:imuniti|immune)|mencegah penyakit|merawat|treats?|improves? appetite|lebih sihat\b/i],
];

export function claimGuardReasons(text:string){return rules.filter(([,pattern])=>pattern.test(text)).map(([reason])=>reason);}
export function planClaimGuard(plan:ContentPlan){
  return [...new Set(claimGuardReasons([plan.hook,plan.script,plan.visual_direction,...Object.values(plan.scene_plan||{})].join(" ")))];
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
