import type { ContentPlan } from "./types";

export function spokenMalayCorruptionProblems(script:string){
  const problems:string[]=[];
  if(/cubareit|\b(?:cuba|klik|tengok|rambut|produk)[a-z]{8,}\b/i.test(script))problems.push("suspicious merged or corrupted token");
  const spacingSample=script.replace(/\bDr\.[A-Za-zÀ-ž]+/g,"Brand");
  if(/[a-zA-ZÀ-ž][,!?][a-zA-ZÀ-ž]/.test(spacingSample)||/[a-zA-ZÀ-ž]\.[A-ZÀ-Ž]/.test(spacingSample))problems.push("missing spacing after punctuation");
  if(/\b([a-zÀ-ž]{2,})\s+\1\b/i.test(script))problems.push("accidental repeated word");
  if(/\b[a-zÀ-ž]{21,}\b/i.test(script))problems.push("implausibly long spoken token");
  if(/\bpatut masuk senarai nak tengok\b/i.test(script))problems.push("awkward translated recommendation");
  if(/\bboleh cuba\b.*\bni memang\b/i.test(script))problems.push("unnatural modal attachment");
  if(/\brutin rambut (?:makin )?nipis\b/i.test(script))problems.push("unnatural noun attachment");
  if((script.match(/\brambut (?:dah )?makin nipis\b/gi)||[]).length>1)problems.push("repeated phrase across sentences");
  return problems;
}

export function applySpokenMalayRewrite(plan:ContentPlan,rewrite:{hook:string;script:string;cta:string}){
  return {...plan,hook:rewrite.hook,script:rewrite.script,cta:rewrite.cta,route_id:plan.route_id};
}
