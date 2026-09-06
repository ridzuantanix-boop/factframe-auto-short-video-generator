// Production acceptance for Gemini script generation only. Never calls /api/generate or Nexabot.
import sharp from "sharp";
const origin=process.env.PAWARNA_ACCEPTANCE_ORIGIN||"https://pawarna-video-factory.ridzuantanix.workers.dev";
const title="Dr.Lan Black Sesame Black Rice & Rosemary Water Spray For Hair";
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="100%" height="100%" fill="#eee9df"/><rect x="190" y="150" width="340" height="650" rx="45" fill="#f8f7f1" stroke="#333" stroke-width="8"/><text x="360" y="285" text-anchor="middle" font-size="52" font-family="Arial" font-weight="700">Dr.Lan</text><text x="360" y="370" text-anchor="middle" font-size="30" font-family="Arial">BLACK SESAME</text><text x="360" y="415" text-anchor="middle" font-size="30" font-family="Arial">BLACK RICE &amp; ROSEMARY</text><text x="360" y="490" text-anchor="middle" font-size="28" font-family="Arial">WATER SPRAY FOR HAIR</text><text x="360" y="600" text-anchor="middle" font-size="25" font-family="Arial">FOR THINNING HAIR</text><text x="360" y="640" text-anchor="middle" font-size="25" font-family="Arial">AND HAIR LOSS</text></svg>`;
const png=await sharp(Buffer.from(svg)).png().toBuffer(),image=`data:image/png;base64,${png.toString("base64")}`;
const first=await fetch(origin+"/api/factory");if(!first.ok)throw Error(`factory ${first.status}`);const cookie=first.headers.get("set-cookie")?.split(";")[0],initialState=await first.json();if(!cookie)throw Error("session cookie missing");
const headers={origin,cookie,"content-type":"application/json"};
const created=await fetch(origin+"/api/products",{method:"POST",headers:{...headers,"idempotency-key":crypto.randomUUID()},body:JSON.stringify({images:[image],product_title:title,mode:"Auto",instructions:""})});let id;if(created.status===202)id=(await created.json()).product.id;else{const error=await created.text();id=initialState.products?.find(item=>item.stage==="ready"&&/dr\.?lan/i.test(item.product?.name||""))?.id;if(!id)throw Error(`product ${created.status}: ${error}`);console.error(JSON.stringify({acceptance_reused_product:id,reason:"analysis limit"}));}
let product;
for(let i=0;i<120;i++){const state=await (await fetch(origin+"/api/factory",{headers:{cookie}})).json();product=state.products.find(item=>item.id===id);if(product?.stage==="ready")break;if(product?.stage==="failed")throw Error(product.error);await new Promise(resolve=>setTimeout(resolve,1000));}
if(product?.stage!=="ready")throw Error("product analysis timeout");
console.error(JSON.stringify({
  acceptance_product_id: id,
  name: product.product?.name,
  brand: product.product?.brand,
  category: product.product?.category,
  primary_function: product.product?.primary_function,
}));
const corrected=await fetch(`${origin}/api/products/${id}/corrections`,{method:"POST",headers,body:JSON.stringify({name:title,category:"hair care",primary_function:"penjagaan rambut yang menipis dan mudah gugur"})});if(!corrected.ok)throw Error(`correction ${corrected.status}: ${await corrected.text()}`);
const settings={productId:id,videoStyle:"problem_solution",angle:"auto",voiceoverEnabled:true,voiceGender:"female",voiceStyle:"energetic",subjectType:"female_hands",shariahCompliance:true,auratLevel:"full",durationSeconds:10};
const outputs=[];
for(let i=0;i<5;i++){
  let response,body;
  for(let retry=0;retry<3;retry++){
    response=await fetch(`${origin}/api/products/${id}/script`,{method:"POST",headers,body:JSON.stringify({settings,instructions:""})});
    body=await response.json();
    if(response.ok)break;
    if(retry<2){console.error(JSON.stringify({acceptance_cooldown:i+1,retry:retry+1,status:response.status}));await new Promise(resolve=>setTimeout(resolve,70000));}
  }
  if(!response.ok)throw Error(`script ${i+1} ${response.status}: ${JSON.stringify(body)}`);
  const output={index:i+1,attempt_id:body.attempt_id,route:body.plan.route_id,script:body.script,displayed_equals_plan:body.script===body.plan.script};
  outputs.push(output);
  console.error(JSON.stringify({acceptance_output:output}));
  if(i<4)await new Promise(resolve=>setTimeout(resolve,70000));
}
console.log(JSON.stringify({product_id:id,product:product.product,outputs},null,2));
