import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const children = [];
function launch(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", () => { console.error("Tidak dapat menjalankan proses Pawarna."); stop(); });
  child.on("exit", code => { if (code) { console.error(`Proses Pawarna berhenti (${code}).`); stop(); } });
}
function stop() { for (const child of children) child.kill(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
let existing;
try {
  const response = await fetch("http://localhost:3100/api/factory", { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("occupied");
  existing = await response.json();
  if (!existing.ready || !Array.isArray(existing.jobs)) throw new Error("occupied");
} catch (error) {
  if (error?.message === "occupied" || error instanceof SyntaxError) {
    console.error("Port 3100 digunakan oleh app lain atau server belum sedia. Semak sebelum mula."); process.exit(1);
  }
}
if (!existing) launch([require.resolve("next/dist/bin/next"), "dev", "--port", "3100"]);
if (!existing?.ready.worker) launch(["--env-file=.env.local", "--import", "tsx", "scripts/factory-worker.ts"]);
console.log("Pawarna: http://localhost:3100 — UI + worker. Biarkan terminal ini terbuka.");
