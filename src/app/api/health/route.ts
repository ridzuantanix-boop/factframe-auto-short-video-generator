export const dynamic = "force-dynamic";

export async function GET() {
  const demoMode = process.env.DEMO_MODE === "true";
  return Response.json({
    status: "ok",
    app: "ok",
    research: "ok",
    mode: demoMode ? "demo-local" : "production",
    tts: process.env.GEMINI_API_KEY && !demoMode ? "configured" : "local-fallback",
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
