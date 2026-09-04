import type { JobInput, ProductAnalysis, Research } from "./types";
export interface ProductProject {
  source_job?: string;
  id: string; owner: string; created_at: number; updated_at: number;
  stage: "queued" | "analysing" | "researching" | "ready" | "failed";
  product?: ProductAnalysis; research?: Research; error?: string;
  image_count: number; input_key: string; corrections?: string;
}
export type PublicProduct = Omit<ProductProject, "owner" | "input_key"> & { image_urls: string[] };
export function publicProduct(p: ProductProject): PublicProduct {
  return { source_job:p.source_job, id: p.id, created_at: p.created_at, updated_at: p.updated_at, stage: p.stage, product: p.product, research: p.research, error: p.error, corrections: p.corrections, image_count: p.image_count,
    image_urls: Array.from({ length: p.image_count }, (_, i) => `/api/products/${p.id}/media?index=${i}`) };
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
  if(p.product && (typeof body.name==="string" && body.name.trim()!==p.product.name || typeof body.category==="string" && body.category.trim()!==p.product.category)) {
    p.product={...p.product, name:typeof body.name==="string"?body.name.trim():p.product.name, category:typeof body.category==="string"?body.category.trim():p.product.category, confidence:"low", uncertainty:"Identiti diperbetulkan oleh pengguna; padanan sumber belum disahkan semula."};
    p.research={status:"unverified",sources:[],evidence:[],queries:[],search_html:"",note:"Maklumat produk telah diperbetulkan. Sumber terdahulu tidak digunakan untuk menyokong identiti baru; skrip berasaskan gambar dan nota tanpa dakwaan web."};
  }
}
export function projectInput(input: JobInput, p: ProductProject): JobInput {
  return { ...input, instructions: [p.corrections ? `USER CORRECTIONS (unverified; never evidence for claims): ${p.corrections}` : "", input.instructions].filter(Boolean).join("\n") };
}
