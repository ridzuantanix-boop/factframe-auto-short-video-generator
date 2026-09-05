export const VIDEO_STYLES = [
  { id: "pov_demo", label: "POV Demo", note: "Tangan, produk dan aksi dekat.", rule: "DIRECT-EYESIGHT POV — CRITICAL. The generated camera IS the viewer's direct eyesight. The viewer is NOT holding or looking through a smartphone, camera, action camera, viewfinder or recording device. Never show a smartphone used for filming, camera body, camera screen, viewfinder, recording interface, REC icon, camera controls, phone screen showing the product, screen-within-screen or fake filming UI. The viewer directly sees and physically interacts with the product. Hands and forearms may naturally enter from below the viewer's field of vision. The video itself IS the POV. Do not depict someone recording a POV video. TRUE FIRST-PERSON POV DEMO — HARD CAMERA LOCK. Keep one coherent first-person session for the full video. Never show the viewer in third person or switch to an external product shot, commercial hero shot, side view, over-the-shoulder view, floating camera, orbit shot or cinematic commercial montage. Hands and forearms originate naturally from below the camera and the viewer's body, with realistic contact, weight, grip and product scale. Camera movement follows natural head and body movement while reaching, holding, placing, opening, using or demonstrating. No floating hands, detached arms or impossible hand positions. Cuts may occur only if they remain the same first-person user and session." },
  { id: "problem_solution", label: "Problem → Solution", note: "Situasi harian, kemudian produk.", rule: "Show an everyday problem followed by the product; never imply unverified efficacy or before/after results." },
  { id: "real_life", label: "Real-Life Use", note: "Produk dalam rutin sebenar.", rule: "A believable everyday Malaysian routine. Only supported uses." },
  { id: "product_motion", label: "Product Motion", note: "Gerakan ringkas. Produk jadi fokus.", rule: "Natural camera movement around a physically supported product. No floating or transformation." },
  { id: "satisfying_demo", label: "Satisfying Demo", note: "Aksi kecil yang seronok ditonton.", rule: "A satisfying realistic handling action. Never invent mechanisms, texture or performance." },
  { id: "doodle_ugc", label: "Doodle UGC", note: "UGC realistik + lakaran ringan.", rule: "DOODLE UGC EXCEPTION: intentional, minimal non-text doodle lines or circles are allowed. Real smartphone footage with a few simple drawn lines or circles highlighting the product. No random text, letters, words, numbers, alien lettering, fake UI or cartoon replacement." },
  { id: "closeup_detail", label: "Close-Up Detail", note: "Bentuk, label dan butiran jelas.", rule: "Close views of visible label and shape with realistic phone focus. Do not infer materials or reveal unseen surfaces." },
  { id: "mini_commercial_ugc", label: "Mini Commercial UGC", note: "Tersusun, tetap rasa natural.", rule: "Tidy hook, detail and payoff sequence shot on a phone, not a cinematic studio commercial." },
] as const;
export const ANGLES = [
  ["auto", "Auto", "Choose the strongest evidence-supported angle."], ["problem", "Masalah", "Relatable problem without unverified solution promises."],
  ["curiosity", "Curiosity", "Curiosity about a visible detail."], ["discovery", "Discovery", "Product discovery without claiming personal use."],
  ["benefit", "Manfaat", "Only exact-product verified benefits; otherwise visible features."], ["convenience", "Mudah", "Verified convenience, not inferred performance."],
  ["relatable", "Relatable", "A familiar everyday situation."], ["feature_benefit", "Ciri → Manfaat", "Connect a feature to a benefit only when that benefit is verified."],
  ["recommendation", "Cadangan", "A modest suggestion, never fabricated testimony."], ["objection", "Keraguan", "Address an objection using known facts; acknowledge unknowns."], ["use_case", "Situasi guna", "A verified use case or simple product display."],
] as const;
export interface GenerationSettings {
  productId: string; videoStyle: typeof VIDEO_STYLES[number]["id"]; angle: typeof ANGLES[number][0];
  voiceoverEnabled: boolean; voiceGender: "auto" | "female" | "male"; voiceStyle: "natural" | "energetic" | "soft_sell" | "direct";
  subjectType: "auto" | "female_hands" | "male_hands" | "no_hands" | "female_creator" | "male_creator";
  shariahCompliance: boolean; auratLevel: "standard" | "full" | null; durationSeconds: 10;
}
export const DEFAULT_SETTINGS: GenerationSettings = { productId: "", videoStyle: "pov_demo", angle: "auto", voiceoverEnabled: true, voiceGender: "auto", voiceStyle: "natural", subjectType: "auto", shariahCompliance: true, auratLevel: "full", durationSeconds: 10 };
export const supportsCreator = (style: string) => ["problem_solution", "real_life", "doodle_ugc", "mini_commercial_ugc"].includes(style);
export function validateSettings(value: unknown, productId?: string): GenerationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Gaya dan tetapan tidak sah.");
  const s = value as GenerationSettings;
  if (typeof s.productId !== "string" || s.productId.length > 100 || (productId !== undefined && s.productId !== productId) || !VIDEO_STYLES.some(v => v.id === s.videoStyle) || !ANGLES.some(a => a[0] === s.angle) || typeof s.voiceoverEnabled !== "boolean" || !["auto", "female", "male"].includes(s.voiceGender) || !["natural", "energetic", "soft_sell", "direct"].includes(s.voiceStyle) || !["auto", "female_hands", "male_hands", "no_hands", "female_creator", "male_creator"].includes(s.subjectType) || typeof s.shariahCompliance !== "boolean" || (s.shariahCompliance ? !["standard", "full"].includes(String(s.auratLevel)) : s.auratLevel !== null) || s.durationSeconds !== 10 || s.subjectType.endsWith("_creator") && !supportsCreator(s.videoStyle)) throw new Error("Gaya dan tetapan tidak sah atau tidak serasi.");
  return { productId: s.productId, videoStyle: s.videoStyle, angle: s.angle, voiceoverEnabled: s.voiceoverEnabled, voiceGender: s.voiceGender, voiceStyle: s.voiceStyle, subjectType: s.subjectType, shariahCompliance: s.shariahCompliance, auratLevel: s.auratLevel, durationSeconds: 10 };
}
export function recommendStyle(category = ""): GenerationSettings["videoStyle"] {
  return /buku|book|kapsul|supplement|makanan|food|minuman/i.test(category) ? "closeup_detail" : /pakaian|fashion|beg|bag/i.test(category) ? "real_life" : "pov_demo";
}
