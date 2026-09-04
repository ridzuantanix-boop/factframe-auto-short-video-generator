import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFile } from "node:fs/promises";
import manifest from "../src/app/manifest";
export default defineConfig({
  root: path.resolve(import.meta.dirname),
  publicDir: false,
  plugins: [react(), { name: "pawarna-public-assets", async generateBundle() {
    this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest()) });
    // Explicit allowlist: never upload legacy WASM, local outputs, secrets or user media.
    for (const fileName of ["sw.js", "offline.html", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"]) this.emitFile({ type: "asset", fileName, source: await readFile(path.resolve(import.meta.dirname, "../public", fileName)) });
  } }],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") } },
  build: { outDir: path.resolve(import.meta.dirname, "../dist-cloud"), emptyOutDir: true },
});
