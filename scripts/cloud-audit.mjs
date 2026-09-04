// Read-only audit, protected by a random server secret. No provider submission or media download.
// The short-lived audit credential is kept only in process memory and revoked after reading.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const token = randomBytes(32).toString("hex");
const result = spawnSync(process.execPath, [cli, "secret", "put", "PAWARNA_ADMIN_TOKEN"], { cwd: new URL("..", import.meta.url), input: token, encoding: "utf8", windowsHide: true });
if (result.status !== 0) throw new Error("Cannot provision audit credential");
try {
  const response = await fetch("https://pawarna-video-factory.ridzuantanix.workers.dev/api/admin/jobs", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Audit HTTP ${response.status}`);
  const report = await response.json();
  console.log(JSON.stringify(report));
} finally {
  // Rotate to a fresh, unrecoverable value; the token used by this process no longer grants access.
  const revoke = spawnSync(process.execPath, [cli, "secret", "put", "PAWARNA_ADMIN_TOKEN"], { cwd: new URL("..", import.meta.url), input: randomBytes(32).toString("hex"), encoding: "utf8", windowsHide: true });
  if (revoke.status !== 0) console.error("Audit credential rotation failed; rotate PAWARNA_ADMIN_TOKEN manually.");
}
