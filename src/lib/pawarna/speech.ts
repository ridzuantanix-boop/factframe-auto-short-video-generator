import { SPOKEN_CTAS, STRONG_SPOKEN_CTA } from "./locks";
import type { ContentPlan } from "./types";
import type { GenerationSettings } from "./settings";

export function speechPolicy(style: GenerationSettings["voiceStyle"] = "natural") {
  const fast = style === "energetic" || style === "direct";
  return { target: fast ? "18–23" : "18–22", max: fast ? 24 : 23 };
}
export function speechInstructions(style?: GenerationSettings["voiceStyle"]) {
  const policy = speechPolicy(style);
  return `Target ${policy.target} spoken words TOTAL including CTA; maximum ${policy.max}. Default 18–23; natural/soft sell strongly prefer 18–22. Shorter natural scripts are welcome: never pad to reach a minimum. Prioritise natural human pacing, understandable hook, ONE key point, then a complete CTA. Default AI CTA is "${STRONG_SPOKEN_CTA}"; the shorter legacy CTA remains valid. CTA field must exactly match the script ending. Complete script exactly once, no extra sentences.`;
}
export function validSpeech(plan: ContentPlan, settings?: GenerationSettings) {
  if (settings?.voiceoverEnabled === false) return plan.script === "" && plan.cta === "";
  if (typeof plan.script !== "string" || !plan.hook?.trim()) return false;
  const script = plan.script.trim(), words = script.split(/\s+/).length;
  const cta=SPOKEN_CTAS.find(value=>script.endsWith(value));
  return words > 4 && words <= speechPolicy(settings?.voiceStyle).max && !!cta
    && plan.cta === cta && script.startsWith(plan.hook) && script.split(cta).length === 2
    && !script.includes("Klik pautan");
}
