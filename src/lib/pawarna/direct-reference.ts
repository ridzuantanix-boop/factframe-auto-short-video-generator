import type {JobInput,ProductAnalysis} from "./types";
export function directReferenceMedia(input:JobInput,product:ProductAnalysis){
  const limit=input.avatar?2:3,indices=product.reference_indices.slice(0,limit),media=indices.map(index=>input.images[index]).filter((value):value is string=>!!value);
  return {indices,media,providerCallAllowed:media.length>0};
}
