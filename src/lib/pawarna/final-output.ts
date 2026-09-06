import type { ContentPlan, JobInput, ProductAnalysis } from "./types";
import { scriptSimilarity } from "./claim-guard";

const clean=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g," ").trim();
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

export function spokenProductName(product:ProductAnalysis){
  const brand=(product.brand||"").trim();
  if(brand&&brand.length<=24)return brand;
  const words=product.name.trim().split(/\s+/);
  return words.slice(0,Math.min(2,words.length)).join(" ");
}

export function openingPattern(script:string){
  const opening=script.split(/[.!?]/)[0].trim();
  if(/^kalau\b/i.test(opening)&&/jangan|tak/i.test(opening))return "WARNING";
  if(/^kalau\b/i.test(opening)&&/survey|tengok/i.test(opening))return "FOMO_DISCOVERY";
  if(/[?]$/.test(script.trim().split(/\n|(?<=[?])/)[0]||"")||/^(?:apa|kenapa|macam mana|setiap kali|tiap kali)\b/i.test(opening))return "QUESTION";
  if(/geram|penat|rimas|penuh .*lantai/i.test(opening))return "DAILY_COMPLAINT";
  if(/makin nampak|mula risau|buat cuak|buat risau/i.test(opening))return "TENSION";
  return "STATEMENT";
}

export function sentenceShape(script:string){
  return script.split(/[.!?]+/).map(sentence=>{
    const value=clean(sentence);if(!value)return "";
    if(/klik|link|tengok dekat link/.test(value))return "CTA";
    if(/dr lan|spray ni|produk ni|yang ni/.test(value))return "PRODUCT";
    if(/ramai|survey/.test(value))return "FOMO";
    if(/jangan|risau|cuak|ketara/.test(value))return "TENSION";
    return "PROBLEM";
  }).filter(Boolean).join(">");
}

export function finalDuplicateReasons(script:string,recent:string[]){
  const reasons:string[]=[];
  for(const previous of recent.slice(-5)){
    if(clean(script)===clean(previous)||scriptSimilarity(script,previous)>=.58)reasons.push("near-duplicate final text");
    if(openingPattern(script)===openingPattern(previous)&&sentenceShape(script)===sentenceShape(previous))reasons.push("repeated opening pattern and sentence structure");
  }
  return [...new Set(reasons)];
}

export function deterministicFinalNormalize(plan:ContentPlan,product:ProductAnalysis){
  const alias=spokenProductName(product),name=product.name.trim();
  let script=plan.script,hook=plan.hook;
  if(name.length>alias.length+8){const title=new RegExp(escaped(name),"gi");script=script.replace(title,alias);hook=hook.replace(title,alias);}
  script=script.replace(/\s+/g," ").replace(/\s+([,.!?])/g,"$1").trim();
  hook=hook.replace(/\s+/g," ").replace(/\s+([,.!?])/g,"$1").trim();
  return {...plan,hook,script,route_id:plan.route_id};
}

export function finalNeedsRewrite(plan:ContentPlan,product:ProductAnalysis,input:JobInput){
  const longTitle=product.name.length>spokenProductName(product).length+8&&new RegExp(escaped(product.name),"i").test(plan.script);
  const catalogue=/produk penjagaan|penjagaan rambut yang menipis dan mudah gugur|produk untuk penjagaan|sesuai untuk kegunaan|merupakan pilihan|dirumus khas|membantu menjaga|membantu memelihara|menawarkan|direka untuk|produk ini|bagi mereka yang|sekiranya anda/i.test(plan.script);
  return longTitle||catalogue||finalDuplicateReasons(plan.script,input.previous_scripts||[]).length>0;
}
