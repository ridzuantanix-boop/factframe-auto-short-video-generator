import { createHash } from "node:crypto";
import { decodeImage } from "../src/lib/pawarna/image";
import type { JobInput, ProductAnalysis, ReferenceAssessment, ReferenceAudit } from "../src/lib/pawarna/types";
const id=(value:string)=>createHash("sha256").update(value).digest("hex");
function safe(a:ReferenceAssessment|undefined,index:number): a is ReferenceAssessment {
  const b=a?.product_region;
  return !!a&&a.index===index&&a.reference_type==="SCREENSHOT_OR_UI_IMAGE"&&a.detected_ui&&a.sanitization_confidence==="high"&&!a.ui_overlap_product&&!!b&&[b.left,b.top,b.right,b.bottom].every(Number.isFinite)&&b.left>=0&&b.top>=0&&b.right<=1&&b.bottom<=1&&b.right-b.left>=.15&&b.bottom-b.top>=.15;
}
export type OriginalPixelCrop=(source:string,bounds:NonNullable<ReferenceAssessment["product_region"]>,index:number)=>Promise<string>;
export async function providerReferences(input:JobInput,product:ProductAnalysis,indices:number[],crop:OriginalPixelCrop){
  const media:string[]=[],audit:ReferenceAudit[]=[];
  for(const index of indices){const original=input.images[index],assessment=product.reference_preprocessing?.find(a=>a.index===index);let provider=original,applied=false;
    if(safe(assessment,index)){try{provider=await crop(original,assessment.product_region!,index);applied=provider!==original;}catch{/* fail closed to the complete original */}}
    const base:ReferenceAssessment=assessment||{index,reference_type:"UNCERTAIN",detected_ui:false,product_region:null,ui_overlap_product:false,sanitization_confidence:"low",reason:"No conservative assessment available."};
    media.push(provider);audit.push({...base,original_reference_id:id(original),provider_reference_id:id(provider),sanitization_applied:applied,sanitization_method:applied?"original_pixel_crop":"none",crop_bounds:applied?base.product_region:null});
  }
  return {media,audit};
}
export async function cloudflareCrop(images:ImagesBinding,source:string,b:{left:number;top:number;right:number;bottom:number}){
  const {bytes,mimeType}=decodeImage(source),stream=new Blob([bytes],{type:mimeType}).stream();
  const result=await images.input(stream).transform({trim:{top:b.top,right:1-b.right,bottom:1-b.bottom,left:b.left}}).output({format:mimeType as "image/jpeg"|"image/png"|"image/webp",quality:95,anim:false});
  const cropped=Buffer.from(await new Response(result.image()).arrayBuffer());if(!cropped.length)throw new Error("Empty crop");return `data:${result.contentType()};base64,${cropped.toString("base64")}`;
}
