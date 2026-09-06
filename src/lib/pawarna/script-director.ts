import type { JobInput, ProductAnalysis } from "./types";

export const SALES_ROUTES=["RELATABLE_PAIN","DAILY_FRUSTRATION","CONSEQUENCE_TENSION","FOMO_DISCOVERY","CURIOSITY","DIRECT_WARNING","DIRECT_RECOMMENDATION"] as const;
export type SalesRouteId=typeof SALES_ROUTES[number];

const routeShape:Record<SalesRouteId,string>={
  RELATABLE_PAIN:"common real-life pain → grounded product relevance → optional social interest → CTA",
  DAILY_FRUSTRATION:"concrete daily frustration → grounded product relevance → desire to act → CTA",
  CONSEQUENCE_TENSION:"specific problem → natural consequence or concern → grounded product relevance → CTA",
  FOMO_DISCOVERY:"generic social interest → relevant consumer problem → product discovery → CTA",
  CURIOSITY:"interesting question or unusual grounded angle → product relevance → optional social interest → CTA",
  DIRECT_WARNING:"short warning based only on the grounded problem → product relevance → CTA",
  DIRECT_RECOMMENDATION:"straight creator recommendation without personal-use claims → grounded reason → CTA",
};

export function selectSalesRoute(input:Pick<JobInput,"previous_routes"|"settings">):SalesRouteId{
  const history=(input.previous_routes||[]).filter((route):route is SalesRouteId=>SALES_ROUTES.includes(route as SalesRouteId));
  const preferred=input.settings?.videoStyle==="problem_solution"||input.settings?.angle==="problem"
    ? ["RELATABLE_PAIN","DAILY_FRUSTRATION","CONSEQUENCE_TENSION","DIRECT_WARNING","FOMO_DISCOVERY","CURIOSITY","DIRECT_RECOMMENDATION"] as SalesRouteId[]
    : [...SALES_ROUTES];
  const unused=preferred.find(route=>!history.includes(route));
  if(unused)return unused;
  return preferred.reduce((least,route)=>history.lastIndexOf(route)<history.lastIndexOf(least)?route:least,preferred[0]);
}

export function routeDirection(route:SalesRouteId){return routeShape[route];}

export function productTruth(product:ProductAnalysis){
  const profile=product.product_profile,source=[profile?.primaryFunction,product.primary_function].find(value=>value&&!/belum disahkan|unknown/i.test(value))||"Only the visibly supported product category and identity";
  const evidence=[product.visible_text,...(product.physical_product_text||[]),...(profile?.salesIntelligenceFacts||[])].join(" ");
  const problems=["rambut menipis","rambut mudah gugur","hair loss","hair fall"].filter(term=>evidence.toLowerCase().includes(term));
  const hair=/rambut|hair/i.test([product.category,source,evidence].join(" "));
  const gummy=/gumm|vitamin/i.test([product.category,source,evidence].join(" "));
  return {
    grounded_problem:problems.length?problems:[source],
    grounded_solution:source,
    allowed_product_positioning:[profile?.primaryFunction,product.primary_function,...(profile?.salesIntelligenceFacts||[])].filter(Boolean),
    forbidden_outcomes:[...(hair?["rambut tumbuh semula","rambut lebih lebat","hentikan keguguran","rawat kebotakan","confirm berkesan"]:[]),...(gummy?["lebih kuat imun","tingkatkan imuniti","mencegah penyakit"]:[])],
  };
}
