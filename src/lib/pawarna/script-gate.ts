import type { ProductProject } from "./projects";
import type { ContentPlan } from "./types";
import type { GenerationSettings } from "./settings";
import { SPOKEN_CTAS } from "./locks";

export function scriptRelevantSnapshot(project:Pick<ProductProject,"id"|"product"|"corrections">,settings:GenerationSettings,instructions:string){
  return JSON.stringify({version:"product-intelligence-v1.1",productId:project.id,identity:project.product?.product_profile?.productIdentity||project.product?.name||"",title:project.product?.name||"",category:project.product?.category||"",primaryFunction:project.product?.primary_function||"",style:settings.videoStyle,angle:settings.angle,voiceover:settings.voiceoverEnabled,voiceGender:settings.voiceGender,voiceStyle:settings.voiceStyle,creatorType:settings.subjectType,instructions:instructions.trim(),corrections:project.corrections||""});
}
export async function scriptSettingsHash(snapshot:string){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(snapshot)))].map(value=>value.toString(16).padStart(2,"0")).join("");}
export function approvedPlan(draft:ContentPlan,script:string,hash:string,source:"ai"|"user_edited"):ContentPlan{
  if(typeof script!=="string"||script.length>1500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(script))throw new Error("Skrip tidak sah atau terlalu panjang.");
  const cta=SPOKEN_CTAS.find(value=>script.trim().endsWith(value))||"";
  return {...draft,script,cta,script_source:source,script_settings_hash:hash,script_generated_at:Date.now(),video_prompt:""};
}
