import type { JobInput, ProductAnalysis, Research } from "./types";

export interface ResearchContext {
  angle?: string;
  instructions?: string;
  explicitlyRequested?: boolean;
  requiredFacts?: string[];
}
const known = (text?: string) => !!text?.trim() && !/^(belum disahkan|unknown|none|tiada|n\/a)$/i.test(text.trim());
const FACT_SENSITIVE=/supplement|suplemen|vitamin|health|wellness|kesihatan|skincare|penjagaan kulit|baby|bayi|kids|kanak|food|makanan|drink|minuman|electronic|elektronik|gadget/i;
export const factSensitiveProduct=(product:ProductAnalysis)=>FACT_SENSITIVE.test([product.category,product.name,product.visible_text].join(" "));
export const researchContext = (input: JobInput): ResearchContext => ({ angle: input.settings?.angle, instructions: input.instructions });
export const researchKey = (context: ResearchContext) => JSON.stringify(context);
export function researchReasons(product: ProductAnalysis, context: ResearchContext = {}): string[] {
  const reasons: string[] = [];
  if (product.confidence !== "high" || known(product.uncertainty) || !known(product.name) || !known(product.visible_text)) reasons.push("identity_uncertain");
  if (product.variant_verification_required) reasons.push("variant_verification");
  if (!known(product.description) || !product.observed_features?.some(known)) reasons.push("insufficient_observation");
  if (product.missing_required_facts?.length || context.requiredFacts?.length) reasons.push("required_factual_evidence");
  if(factSensitiveProduct(product))reasons.push("fact_sensitive_category");
  // Empty audience/function alone is not a reason to fill out the product card.
  if (["benefit", "convenience", "feature_benefit", "use_case"].includes(context.angle || "") && !known(product.primary_function)) reasons.push("angle_requires_function");
  // Negative requests (e.g. "Jangan sebut kapasiti") do not ask for a new fact.
  const notes = (context.instructions || "").split(/[.!?\n]/).filter(sentence => !/\b(jangan|tak perlu|tidak perlu|do not|don't|no need)\b/i.test(sentence)).join(" ");
  if (context.explicitlyRequested || /\b(research|google|search|carian web|cari (?:di web|maklumat|sumber)|semak (?:web|sumber))\b/i.test(notes)) reasons.push("explicit_research");
  if (/\b(spesifikasi|specification|kapasiti|capacity|ramuan|ingredients|certification|pensijilan|varian|model tepat|bukti|evidence|keberkesanan)\b/i.test(notes)) reasons.push("requested_fact_verification");
  return reasons;
}
export const shouldResearchProduct = (product: ProductAnalysis, context: ResearchContext = {}) => researchReasons(product, context).length > 0;
export const needsConservativeFallback=(product:ProductAnalysis,context:ResearchContext={})=>researchReasons(product,context).some(reason=>["fact_sensitive_category","required_factual_evidence","angle_requires_function","requested_fact_verification","variant_verification"].includes(reason));
export function observationOnly(context: ResearchContext = {}): Research {
  return { status: "observation_only", sources: [], evidence: [], queries: [], search_html: "", context_key: researchKey(context), note: "Pemerhatian gambar sahaja. Maklumat yang kelihatan mencukupi untuk video ringkas; carian web tidak diperlukan. Tiada dakwaan luar daripada bukti gambar." };
}
export function researchLabel(research?: Research) {
  return research?.status === "grounded" ? "Sumber web disahkan · semak padanan produk" : research?.status === "observation_only" ? "Pemerhatian gambar sahaja" : "Maklumat web belum disahkan";
}
