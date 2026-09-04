export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function decodeImage(value: unknown) {
  if (typeof value !== "string") throw new Error("Imej tidak sah.");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("Hanya JPG, PNG dan WEBP diterima.");
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error("Setiap imej mesti kurang daripada 5 MB.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 20) throw new Error("Setiap imej mesti kurang daripada 5 MB.");
  return { mimeType: match[1], data: match[2], bytes };
}
