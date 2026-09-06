import type { ContentPlan } from "./types";

export function spokenMalayCorruptionProblems(script:string){
  const problems:string[]=[];
  if(/cubareit|\b(?:cuba|klik|tengok|rambut|produk)[a-z]{8,}\b/i.test(script))problems.push("suspicious merged or corrupted token");
  if(/[a-zA-ZÀ-ž][,!?][a-zA-ZÀ-ž]/.test(script))problems.push("missing spacing after punctuation");
  if(/\b([a-zÀ-ž]{2,})\s+\1\b/i.test(script))problems.push("accidental repeated word");
  if(/\b[a-zÀ-ž]{21,}\b/i.test(script))problems.push("implausibly long spoken token");
  return problems;
}

export function applySpokenMalayRewrite(plan:ContentPlan,rewrite:{hook:string;script:string;cta:string}){
  return {...plan,hook:rewrite.hook,script:rewrite.script,cta:rewrite.cta,route_id:plan.route_id};
}
