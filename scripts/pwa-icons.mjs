import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(path.join(dir, "pawarna.svg")).resize(size, size).png().toFile(path.join(dir, name));
}
console.log("Pawarna app icons generated.");
