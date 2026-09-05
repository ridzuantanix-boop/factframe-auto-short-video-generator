import { validateSettings } from "../src/lib/pawarna/settings";
import { imageSize } from "image-size";
import { decodeImage } from "../src/lib/pawarna/image";
import { MODES, type JobInput } from "../src/lib/pawarna/types";
export function validateInput(body: Record<string, unknown>): JobInput {
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5) throw new Error("Upload 1 hingga 5 gambar produk.");
  if (!MODES.includes((body.mode || "Auto") as typeof MODES[number])) throw new Error("Gaya video tidak sah.");
  if (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 1000)) throw new Error("Arahan maksimum 1,000 aksara.");
  if (body.avatar !== undefined && typeof body.avatar !== "string") throw new Error("Imej avatar tidak sah.");
  if(body.product_title!==undefined&&(typeof body.product_title!=="string"||body.product_title.length>200))throw new Error("Nama produk maksimum 200 aksara.");
  if(body.product_url!==undefined&&(typeof body.product_url!=="string"||body.product_url.length>2048||body.product_url&&!/^https:\/\//i.test(body.product_url)))throw new Error("Link produk mesti URL HTTPS yang sah.");
  const input: JobInput = { images: body.images as string[], avatar: body.avatar ? String(body.avatar) : undefined, product_title:String(body.product_title||"").trim()||undefined,product_url:String(body.product_url||"").trim()||undefined,mode: (body.mode || "Auto") as JobInput["mode"], instructions: String(body.instructions || ""), angle_seed: "default" };
  let total = 0;
  for (const value of [...input.images, ...(input.avatar ? [input.avatar] : [])]) {
    const { bytes, mimeType } = decodeImage(value); total += bytes.length;
    if (total > 12 * 1024 * 1024) throw new Error("Jumlah gambar maksimum 12 MB untuk versi cloud.");
    let meta;
    try { meta = imageSize(bytes); } catch { throw new Error("Fail imej rosak atau format tidak disokong."); }
    const expected = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    if (meta.type !== expected || !meta.width || !meta.height || meta.width * meta.height > 40_000_000) throw new Error("Fail imej rosak, format tidak sepadan atau terlalu besar.");
    if (meta.type === "png" && bytes.includes(Buffer.from("acTL")) || meta.type === "webp" && bytes.includes(Buffer.from("ANIM"))) throw new Error("Fail imej beranimasi tidak disokong.");
  }
  if (body.settings !== undefined) input.settings = validateSettings(body.settings);
  if (input.avatar && input.settings && !input.settings.subjectType.endsWith("_creator")) throw new Error("Imej avatar hanya untuk creator penuh.");
  return input;
}
