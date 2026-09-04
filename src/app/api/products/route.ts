import { after } from "next/server";
import { createHash } from "node:crypto";
import { ownerId,sameOrigin } from "@/lib/pawarna/session";
import { getJob,reserveProduct,saveProduct } from "@/lib/pawarna/store";
import { validateInput } from "@/lib/pawarna/validation";
import { publicProduct } from "@/lib/pawarna/projects";
import { analyseProduct,researchProduct } from "@/services/pawarna/intelligence";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  sameOrigin(request);const owner=await ownerId();if(!owner)return Response.json({error:"Refresh halaman dahulu."},{status:401});
  const key=request.headers.get("idempotency-key");if(!key||!/^[a-zA-Z0-9-]{16,100}$/.test(key))throw new Error("Permintaan tidak sah.");
  if(!request.body)throw new Error("Permintaan kosong.");const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>17*1024*1024){await reader.cancel();throw new Error("Jumlah gambar terlalu besar.");}parts.push(value);}
  const body=JSON.parse(Buffer.concat(parts).toString());let source;
  if(body.source_job){source=getJob(String(body.source_job));if(!source||source.owner!==owner)return Response.json({error:"Video tidak ditemui."},{status:404});}
  if(!source&&!process.env.GEMINI_API_KEY)return Response.json({error:"Analisis belum tersedia."},{status:503});
  const input=source?source.input:await validateInput(body),fingerprint=createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const result=reserveProduct(owner,key,fingerprint,input,source),p=result.project;
  if(result.fresh&&p.stage!=="ready")after(async()=>{try{p.stage="analysing";saveProduct(p);p.product||=await analyseProduct(input);p.stage="researching";saveProduct(p);p.research||=await researchProduct(p.product);p.stage="ready";saveProduct(p);}catch{p.stage="failed";p.error="Analisis belum berjaya. Semak gambar atau akses analisis. Tiada video berbayar dihantar.";saveProduct(p);}});
  return Response.json({product:publicProduct(p)},{status:202,headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e instanceof Error&&/^(Upload|Imej|Had|Arahan|Jumlah|Permintaan|Fail|Setiap)/.test(e.message)?e.message:"Permintaan produk tidak sah."},{status:400});}
}
