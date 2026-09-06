import { ownerId,sameOrigin } from "@/lib/pawarna/session";
import { getJob,getProduct,saveProduct } from "@/lib/pawarna/store";
import { projectInput } from "@/lib/pawarna/projects";
import { validateSettings } from "@/lib/pawarna/settings";
import { createPlan,outputTrace } from "@/services/pawarna/intelligence";
import { scriptRelevantSnapshot,scriptSettingsHash } from "@/lib/pawarna/script-gate";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{sameOrigin(request);const {id}=await params,saved=getProduct(id);if(!saved||saved.project.owner!==await ownerId())return new Response(null,{status:404});
  const p=saved.project;if(p.stage!=="ready"||!p.product||!p.research)return Response.json({error:"Tunggu analisis siap dahulu."},{status:409});
  const body=await request.json() as Record<string,unknown>,settings=validateSettings(body.settings,id),instructions=String(body.instructions||"");if(instructions.length>1000)throw new Error("Arahan maksimum 1,000 aksara.");
  const history=[...(p.script_history||[]),...(p.script_draft?.plan.script?[p.script_draft.plan.script]:[])].slice(-5),routeHistory=[...(p.route_history||[]),...(p.script_draft?.plan.route_id?[p.script_draft.plan.route_id]:[])].slice(-7),input=projectInput({...saved.input,settings,instructions,angle_seed:crypto.randomUUID(),previous_hook:p.script_draft?.plan.hook,previous_scripts:history,previous_routes:routeHistory},p),reused=body.source_job?getJob(String(body.source_job)):undefined;if(body.source_job&&(!reused||reused.owner!==p.owner||!reused.plan))return new Response(null,{status:404});
  const plan=reused?.plan?{...reused.plan,video_prompt:""}:await createPlan(input,p.product,p.research),settings_hash=await scriptSettingsHash(scriptRelevantSnapshot(p,settings,instructions)),generated_at=Date.now();
  const attempt_id=crypto.randomUUID(),trace=outputTrace(plan)||{route_id:plan.route_id,route_draft:plan.script,humanized_draft:plan.script,post_claim_checked_candidate:plan.script,final_normalized_candidate:plan.script,displayed_final:plan.script};if(trace.displayed_final!==plan.script||trace.final_normalized_candidate!==plan.script)throw new Error("Final output trace mismatch");
  p.script_history=history;p.route_history=routeHistory;p.script_attempt_id=attempt_id;p.output_trace=trace;p.script_draft={plan:{...plan,script_source:"ai",script_settings_hash:settings_hash,script_generated_at:generated_at},settings_hash,generated_at};saveProduct(p);
  return Response.json({script:trace.displayed_final,plan:p.script_draft.plan,settings_hash,generated_at,attempt_id,source:"ai"},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e instanceof Error&&/^(Arahan|Gaya|Tunggu|Skrip)/.test(e.message)?e.message:"Skrip belum berjaya dijana. Cuba lagi."},{status:400});}
}
