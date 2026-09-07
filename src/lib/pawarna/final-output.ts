import type { ContentPlan, JobInput, ProductAnalysis } from "./types";
import { scriptSimilarity } from "./claim-guard";
import type { SalesRouteId } from "./script-director";

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
  if(alias&&name.toLowerCase().startsWith(alias.toLowerCase())){const tokens=[...new Set(name.slice(alias.length).trim().split(/\s+/).map(escaped).filter(Boolean))];if(tokens.length){const expanded=new RegExp(`${escaped(alias)}(?:\\s+(?:${tokens.join("|")})){2,}`,"gi");script=script.replace(expanded,alias);hook=hook.replace(expanded,alias);}}
  script=script.replace(/anda boleh gunakan [^.!?]+? sebagai (?:rutin )?penjagaan rambut yang menipis dan mudah gugur/gi,`Kalau rambut makin nipis dan mudah gugur, cuba tengok ${alias} ni`)
    .replace(/[^.!?]+? (?:hadir )?(?:untuk membantu|untuk|sebagai) (?:rutin )?penjagaan rambut yang menipis dan mudah gugur/gi,`${alias} ni memang untuk rambut yang makin nipis dan mudah gugur`);
  const dottedPrefix=alias.includes(".")?alias.slice(0,alias.indexOf(".")+1):"";if(dottedPrefix)script=script.replace(new RegExp(`${escaped(dottedPrefix)}${escaped(alias)}`,"gi"),alias);
  script=script.replace(new RegExp(`mujur ada\\s+${escaped(alias)}\\s+ni memang`,"gi"),`${alias} ni memang`);
  script=script.replace(/\bni\s+ni\b/gi,"ni").replace(/([!?])(?=[A-Za-zÀ-ž])/g,"$1 ").replace(/(?<!\bDr)(?<!\bdr)\.(?=[A-ZÀ-Ž])/g,". ").replace(/\s+/g," ").replace(/\s+([,.!?])/g,"$1").trim();
  hook=hook.replace(/\s+/g," ").replace(/\s+([,.!?])/g,"$1").trim();
  return {...plan,hook,script,route_id:plan.route_id};
}

export function finalNeedsRewrite(plan:ContentPlan,product:ProductAnalysis,input:JobInput){
  const longTitle=product.name.length>spokenProductName(product).length+8&&new RegExp(escaped(product.name),"i").test(plan.script);
  const catalogue=/\banda\b|anda boleh gunakan|produk penjagaan|penjagaan rambut yang menipis dan mudah gugur|sebagai rutin penjagaan|produk untuk penjagaan|sesuai untuk kegunaan|merupakan pilihan|dirumus khas|diformulasikan (?:khas|khusus)|membantu menjaga|membantu memelihara|menawarkan|direka untuk|produk ini|bagi mereka yang|sekiranya anda/i.test(plan.script);
  return longTitle||catalogue||finalDuplicateReasons(plan.script,input.previous_scripts||[]).length>0;
}

export function routeSafeFallback(plan:ContentPlan,product:ProductAnalysis,route:SalesRouteId,voice:boolean){
  if(!voice)return {...plan,route_id:route,hook:"Show the product in a new scene",script:"",cta:""};
  const alias=spokenProductName(product),hair=/rambut|hair/i.test([product.category,product.primary_function,product.visible_text].join(" ")),gummy=/gumm|vitamin/i.test([product.category,product.primary_function,product.visible_text].join(" "));
  const topic=hair?"rambut makin nipis":gummy?"gummy vitamin C":product.category.toLowerCase();
  const openings:Record<SalesRouteId,string>={RELATABLE_PAIN:hair?"Tiap kali sikat, makin banyak rambut tertinggal?":`Susah nak pilih ${topic} yang nak tengok?`,DAILY_FRUSTRATION:hair?"Penat asyik kena kutip rambut gugur setiap hari.":`Pening nak tengok ${topic} satu-satu?`,CONSEQUENCE_TENSION:hair?"Bila rambut dah makin nipis, memang mula risau.":`Bila masih tak jumpa ${topic} yang dicari, memang leceh.`,FOMO_DISCOVERY:`Kalau tengah survey ${topic}, yang ni memang patut tengok.`,CURIOSITY:`Apa yang buat ${alias} ni menarik untuk tengok?`,DIRECT_WARNING:hair?"Kalau rambut dah makin jarang, jangan buat tak tahu.":`Kalau tengah cari ${topic}, jangan terus scroll.`,DIRECT_RECOMMENDATION:`Kalau tengah tengok ${topic}, cuba tengok ${alias} ni.`};
  const hook=openings[route],cta="Klik link kat bawah.";
  const hairLines:Record<SalesRouteId,string>={RELATABLE_PAIN:`Cuba tengok ${alias} ni untuk jaga rambut yang makin nipis.`,DAILY_FRUSTRATION:`Jangan biar sampai makin ketara. Untuk masalah ni, cuba tengok ${alias}.`,CONSEQUENCE_TENSION:`Kalau rambut makin nipis, cuba tengok ${alias} ni untuk rutin penjagaan.`,FOMO_DISCOVERY:`${alias} ni antara yang patut tengok kalau tengah survey penjagaan rambut nipis.`,CURIOSITY:`Yang menarik, ${alias} ni memang untuk jaga rambut yang makin nipis.`,DIRECT_WARNING:`Sebelum makin ketara, cuba tengok ${alias} ni.`,DIRECT_RECOMMENDATION:`Sebabnya ${alias} ni memang untuk jaga rambut yang makin nipis.`};
  const relevance=hook.toLowerCase().includes(alias.toLowerCase())?"":hair?` ${hairLines[route]}`:` Cuba tengok ${alias} ni.`;
  return {...plan,route_id:route,hook,script:`${hook}${relevance} ${cta}`.replace(/\s+/g," "),cta};
}
