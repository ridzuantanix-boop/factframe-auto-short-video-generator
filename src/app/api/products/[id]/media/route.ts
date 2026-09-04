import { ownerId } from "@/lib/pawarna/session";
import { getProduct } from "@/lib/pawarna/store";
import { decodeImage } from "@/lib/pawarna/image";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,p=getProduct(id),index=Number(new URL(request.url).searchParams.get("index")||0);
 if(!p||p.project.owner!==await ownerId()||!Number.isInteger(index)||index<0||index>=p.input.images.length)return new Response(null,{status:404});
 const image=decodeImage(p.input.images[index]);return new Response(new Uint8Array(image.bytes),{headers:{"Content-Type":image.mimeType,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
