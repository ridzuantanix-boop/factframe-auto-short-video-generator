import { createHash } from "node:crypto";
import { decodeImage } from "../src/lib/pawarna/image";
import type { JobInput, ProductAnalysis, ReferenceAssessment, ReferenceAudit } from "../src/lib/pawarna/types";
const id=(value:string)=>createHash("sha256").update(value).digest("hex");
function safe(a:ReferenceAssessment|undefined,index:number): a is ReferenceAssessment {
  const b=a?.product_region;
  return !!a&&a.index===index&&a.reference_type==="SCREENSHOT_OR_UI_IMAGE"&&a.detected_ui&&a.sanitization_confidence==="high"&&!a.ui_overlap_product&&!!b&&[b.left,b.top,b.right,b.bottom].every(Number.isFinite)&&b.left>=0&&b.top>=0&&b.right<=1&&b.bottom<=1&&b.right-b.left>=.15&&b.bottom-b.top>=.15;
}
export type OriginalPixelCrop=(source:string,bounds:NonNullable<ReferenceAssessment["product_region"]>,index:number)=>Promise<string>;
export type PostSanitizationValidation=(source:string,index:number)=>Promise<{postSanitizationClean:boolean;residualUiDetected:boolean;sanitizationConfidence:"high"|"medium"|"low";rectangularCropInsufficient:boolean}>;
export async function providerReferences(input:JobInput,product:ProductAnalysis,indices:number[],crop:OriginalPixelCrop,validate:PostSanitizationValidation){
  const media:string[]=[],audit:ReferenceAudit[]=[];
  for(const index of indices){const original=input.images[index],assessment=product.reference_preprocessing?.find(a=>a.index===index);let provider=original,applied=false;
    const raw:ReferenceAssessment=assessment||{index,reference_type:"UNCERTAIN",detected_ui:false,product_region:null,ui_overlap_product:false,sanitization_confidence:"low",reason:"No conservative assessment available."};
    const base:ReferenceAssessment=raw.ui_overlap_product?{...raw,sanitization_confidence:"low",reason:`${raw.reason} UI overlaps the product region; V1 keeps the complete original.`}:raw;
    let postSanitizationClean=false,residualUiDetected=base.detected_ui,rectangularCropInsufficient=base.ui_overlap_product,providerCallAllowed=false,referencePathUsed:ReferenceAudit["referencePathUsed"]="blocked_unsafe",confidence=base.sanitization_confidence;
    if(base.reference_type==="CLEAN_PRODUCT_IMAGE"&&!base.detected_ui){postSanitizationClean=true;residualUiDetected=false;rectangularCropInsufficient=false;providerCallAllowed=true;referencePathUsed="original_clean";confidence="high";}
    else if(safe(base,index))try{provider=await crop(original,base.product_region!,index);applied=provider!==original;if(applied){const post=await validate(provider,index);postSanitizationClean=post.postSanitizationClean;residualUiDetected=post.residualUiDetected;rectangularCropInsufficient=post.rectangularCropInsufficient;confidence=post.sanitizationConfidence;providerCallAllowed=postSanitizationClean&&!residualUiDetected&&confidence==="high";referencePathUsed=providerCallAllowed?"sanitized_clean":"blocked_unsafe";}}catch{/* fail closed */}
    if(providerCallAllowed)media.push(provider);
    audit.push({...base,sanitization_confidence:confidence,original_reference_id:id(original),provider_reference_id:id(provider),sanitization_applied:applied,sanitization_method:applied?"original_pixel_crop":"none",crop_bounds:applied?base.product_region:null,referencePathUsed,postSanitizationClean,residualUiDetected,rectangularCropInsufficient,providerCallAllowed});
  }
  return {media,audit,providerCallAllowed:audit.length>0&&audit.every(item=>item.providerCallAllowed)};
}
export async function cloudflareCrop(images:ImagesBinding,source:string,b:{left:number;top:number;right:number;bottom:number}){
  const {bytes,mimeType}=decodeImage(source),stream=new Blob([bytes],{type:mimeType}).stream();
  const result=await images.input(stream).transform({trim:{top:b.top,right:1-b.right,bottom:1-b.bottom,left:b.left}}).output({format:mimeType as "image/jpeg"|"image/png"|"image/webp",quality:95,anim:false});
  const cropped=Buffer.from(await new Response(result.image()).arrayBuffer());if(!cropped.length)throw new Error("Empty crop");return `data:${result.contentType()};base64,${cropped.toString("base64")}`;
}
