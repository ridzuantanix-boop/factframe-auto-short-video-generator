import type { JobInput, ProductAnalysis, Research } from "./types";
export interface ProductProject {
  source_job?: string;
  id: string; owner: string; created_at: number; updated_at: number;
  stage: "queued" | "analysing" | "researching" | "ready" | "failed";
  product?: ProductAnalysis; research?: Research; error?: string;
  image_count: number; input_key: string; corrections?: string;
  reference_audit?: import("./types").ReferenceAudit[];
  script_draft?: {plan:import("./types").ContentPlan;settings_hash:string;generated_at:number};
  script_history?: string[];
}
export type PublicProduct = Omit<ProductProject, "owner" | "input_key" | "reference_audit" | "script_draft" | "script_history"> & { image_urls: string[]; sanitized_reference_urls: string[] };
export function publicProduct(p: ProductProject): PublicProduct {
  return { source_job:p.source_job, id: p.id, created_at: p.created_at, updated_at: p.updated_at, stage: p.stage, product: p.product, research: p.research, error: p.error, corrections: p.corrections, image_count: p.image_count,
    image_urls: Array.from({ length: p.image_count }, (_, i) => `/api/products/${p.id}/media?index=${i}`), sanitized_reference_urls:(p.reference_audit||[]).filter(a=>a.sanitization_applied).map(a=>`/api/products/${p.id}/media?index=${a.index}&sanitized=1`) };
}
export function correction(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000) throw new Error("Arahan pembetulan maksimum 1,000 aksara.");
  return value.trim();
}
export function applyCorrections(p: ProductProject, body: Record<string, unknown>) {
  p.corrections = correction(body.corrections || "");
  for(const field of ["name", "category"] as const) {
    const value=body[field];if(value===undefined)continue;
    if(typeof value!=="string"||!value.trim()||value.length>160)throw new Error("Arahan nama dan kategori maksimum 160 aksara.");
  }
  if(body.primary_function!==undefined){if(typeof body.primary_function!=="string"||!body.primary_function.trim()||body.primary_function.length>200)throw new Error("Kegunaan utama maksimum 200 aksara.");if(p.product){const value=body.primary_function.trim();p.product={...p.product,primary_function:value,primary_function_source:"user_supplied",primary_function_confidence:"medium",product_profile:p.product.product_profile?{...p.product.product_profile,primaryFunction:value,primary_function_source:"user_supplied",primary_function_confidence:"medium",userFacts:[...new Set([...p.product.product_profile.userFacts,value])],claims:[...p.product.product_profile.claims.filter(item=>item.text!==value),{text:value,safety:"USER_SUPPLIED_FACT",source:"user_supplied"}],unknowns:p.product.product_profile.unknowns.filter(item=>item!=="primary_function"),micro_question_required:false}:undefined};}}
  if(p.product && (typeof body.name==="string" && body.name.trim()!==p.product.name || typeof body.category==="string" && body.category.trim()!==p.product.category)) {
    p.product={...p.product, name:typeof body.name==="string"?body.name.trim():p.product.name, category:typeof body.category==="string"?body.category.trim():p.product.category, confidence:"low", uncertainty:"Identiti diperbetulkan oleh pengguna; padanan sumber belum disahkan semula."};
    p.research={status:"unverified",sources:[],evidence:[],queries:[],search_html:"",note:"Maklumat produk telah diperbetulkan. Sumber terdahulu tidak digunakan untuk menyokong identiti baru; skrip berasaskan gambar dan nota tanpa dakwaan web."};
  }
}
export function projectInput(input: JobInput, p: ProductProject): JobInput {
  return { ...input, instructions: [p.corrections ? `USER CORRECTIONS (unverified; never evidence for claims): ${p.corrections}` : "", input.instructions].filter(Boolean).join("\n") };
}
