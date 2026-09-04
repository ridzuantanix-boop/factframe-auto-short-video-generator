import { ownerId,sameOrigin } from "@/lib/pawarna/session";
import { getProduct,saveProduct } from "@/lib/pawarna/store";
import { applyCorrections,publicProduct } from "@/lib/pawarna/projects";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{sameOrigin(request);const {id}=await params,p=getProduct(id);if(!p||p.project.owner!==await ownerId())return new Response(null,{status:404});
 if(p.project.stage!=="ready")return Response.json({error:"Tunggu analisis siap."},{status:409});
 if(!request.body)return new Response(null,{status:400});const reader=request.body.getReader();let size=0;const parts:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return new Response(null,{status:413});}parts.push(value);}
 applyCorrections(p.project,JSON.parse(Buffer.concat(parts).toString()));saveProduct(p.project);return Response.json({product:publicProduct(p.project)});
 }catch{return Response.json({error:"Pembetulan tidak sah."},{status:400});}
}
