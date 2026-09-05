export const MODES = ["Auto", "Real Creator", "UGC Review", "Product Demo", "POV Product", "Book Creator"] as const;
export type Mode = typeof MODES[number];
export type Stage = "queued" | "analysing" | "researching" | "planning" | "submitting" | "processing" | "saving" | "completed" | "failed";
export const STAGES: Record<Stage, string> = {
  queued: "Video sedang masuk giliran.", analysing: "Sedang kenal pasti produk…",
  researching: "Sedang semak maklumat dan sumber…", planning: "Sedang tulis skrip dan susun adegan…",
  submitting: "Menghantar bahan untuk video…", processing: "Video sedang dijana…",
  saving: "Menyimpan video anda…", completed: "Video dah siap.", failed: "Video belum berjaya disiapkan.",
};
export interface ProductAnalysis {
  variant_verification_required?: boolean; missing_required_facts?: string[];
  primary_function?: string; target_audience?: string;
  name: string; brand: string; category: string; confidence: "high" | "medium" | "low";
  visible_text: string; description: string; observed_features: string[];
  search_query: string; uncertainty: string; reference_indices: number[];
  reference_preprocessing?: ReferenceAssessment[];
}
export interface ReferenceAssessment {
  index: number; reference_type: "CLEAN_PRODUCT_IMAGE" | "SCREENSHOT_OR_UI_IMAGE" | "UNCERTAIN";
  detected_ui: boolean; product_region: { left:number; top:number; right:number; bottom:number } | null;
  ui_overlap_product: boolean; sanitization_confidence: "high" | "medium" | "low"; reason: string;
}
export interface ReferenceAudit extends ReferenceAssessment {
  original_reference_id: string; provider_reference_id: string; sanitization_applied: boolean;
  sanitization_method: "original_pixel_crop" | "none"; crop_bounds: ReferenceAssessment["product_region"];
}
export interface Source { id: string; title: string; url: string }
export interface Research {
  status: "grounded" | "observation_only" | "unverified"; sources: Source[];
  context_key?: string;
  evidence: { id: string; text: string; source_ids: string[] }[];
  queries: string[]; search_html: string; note: string;
}
export interface ContentPlan {
  scene_plan?: Record<"0-2" | "2-6" | "6-8" | "8-10", string>;
  angle: string; hook: string; script: string; cta: string; mode: Exclude<Mode, "Auto">;
  visual_direction: string; claim_evidence_ids: string[]; video_prompt: string;
}
export interface JobInput { images: string[]; sanitized_video_references?: Record<string,string>; avatar?: string; mode: Mode; instructions: string; angle_seed: string; previous_hook?: string; settings?: import("./settings").GenerationSettings }
export interface Job {
  settings?: import("./settings").GenerationSettings;
  id: string; owner: string; input: JobInput; stage: Stage; created_at: number; updated_at: number;
  external_job_id?: string; product?: ProductAnalysis; research?: Research; plan?: ContentPlan;
  retry_count: number; error?: string; video_path?: string; lease_until: number;
  provider_requests: { at: number; external_job_id?: string; status: string; cost: number; refund_expected?: boolean }[];
  duration_seconds: number; parent_generation_id?: string; segment_number: number;
  reference_audit?: ReferenceAudit[];
}
export type PublicJob = Omit<Job, "owner" | "input" | "lease_until" | "provider_requests" | "video_path"> & {
  has_avatar: boolean; image_count: number; video_url?: string; thumbnail_url: string;
};
