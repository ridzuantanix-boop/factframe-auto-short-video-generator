export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    app: "ok",
    research: "ok",
    tts: process.env.GEMINI_API_KEY ? "configured" : "local-fallback",
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
