// Reads only the two provider keys from the user's local env; never writes them to disk or logs.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const env = parseEnv(readFileSync(new URL("../.env.local", import.meta.url), "utf8"));
const keys = { GEMINI_API_KEY: env.GEMINI_API_KEY, NEXABOT_API_KEY: env.NEXABOT_API_KEY };
if (Object.values(keys).some(value => !value || value.length < 10)) throw new Error("Provider keys are missing. Update .env.local first.");
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), "secret", "bulk", "--config", "wrangler.jsonc"], { cwd: new URL("..", import.meta.url), input: JSON.stringify(keys), encoding: "utf8", windowsHide: true });
// Wrangler normally prints names only, but scrub values defensively before displaying output.
let output = (result.stdout || "") + (result.stderr || "");
for (const secret of Object.values(keys)) output = output.split(secret).join("[REDACTED]");
process.stdout.write(output);
process.exitCode = result.status ?? 1;
