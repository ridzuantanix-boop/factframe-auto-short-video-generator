import { validateSettings } from "./settings";
import sharp from "sharp";
import { MODES, type JobInput } from "./types";
import { decodeImage } from "./image";
export { decodeImage, MAX_IMAGE_BYTES } from "./image";
export async function validateInput(body: Record<string, unknown>): Promise<JobInput> {
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5) throw new Error("Upload 1 hingga 5 gambar produk.");
  if (!MODES.includes((body.mode || "Auto") as typeof MODES[number])) throw new Error("Gaya video tidak sah.");
  if (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 1000)) throw new Error("Arahan maksimum 1,000 aksara.");
  const input: JobInput = { images: body.images as string[], avatar: body.avatar ? String(body.avatar) : undefined, mode: (body.mode || "Auto") as JobInput["mode"], instructions: String(body.instructions || ""), angle_seed: "default" };
  for (const image of [...input.images, ...(input.avatar ? [input.avatar] : [])]) {
    const decoded = decodeImage(image);
    const metadata = await sharp(decoded.bytes, { limitInputPixels: 40_000_000 }).metadata();
    const expected = decoded.mimeType.split("/")[1];
    if (metadata.format !== expected || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) throw new Error("Fail imej rosak, format tidak sepadan atau imej beranimasi.");
  }
  if (body.settings !== undefined) input.settings = validateSettings(body.settings);
  if (input.avatar && input.settings && !input.settings.subjectType.endsWith("_creator")) throw new Error("Imej avatar hanya untuk creator penuh.");
  return input;
}
