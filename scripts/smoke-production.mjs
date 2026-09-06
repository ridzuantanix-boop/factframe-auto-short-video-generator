const baseUrl = (process.env.DEPLOYMENT_URL ?? "http://localhost:3100").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);

async function request(path, options = {}) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal, headers: { "X-FactFrame-Session": "production-smoke", ...(options.headers ?? {}) } });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error ?? "unknown error"}`);
    return { response, body };
  } finally { clearTimeout(timer); }
}

const report = { deployment: baseUrl, checkedAt: new Date().toISOString(), checks: {} };
const health = await request("/api/health"); report.checks.health = health.body.status === "ok";
const catalog = await request("/api/catalog?status=READY&sort=research&limit=1"); const story = catalog.body.items?.[0]; report.checks.catalog = Array.isArray(catalog.body.items); report.readyCount = catalog.body.total ?? 0;
if (!story?.id) throw new Error("No READY story is available for smoke verification.");
const research = await request(`/api/research?id=${encodeURIComponent(story.id)}`); report.checks.readyStory = research.body.story?.id === story.id;
const duration = research.body.story?.supportedDurationSeconds ?? 18;
const visual = await request("/api/visual-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyCandidateId: story.id, durationSeconds: duration }) }); report.checks.visualPlan = Boolean(visual.body.plan?.segments?.length);
const tts = await request("/api/gemini/status"); report.checks.ttsEndpoint = typeof tts.body.configured === "boolean"; report.ttsMode = tts.body.configured ? "online-configured" : "local-fallback";
if (Object.values(report.checks).some((value) => value !== true)) throw new Error(`Smoke checks failed: ${JSON.stringify(report)}`);
console.log(JSON.stringify(report, null, 2));
