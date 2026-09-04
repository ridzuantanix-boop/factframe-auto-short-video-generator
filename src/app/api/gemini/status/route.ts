export async function GET() {
  const demoMode = process.env.DEMO_MODE === "true";
  return Response.json({ configured: Boolean(process.env.GEMINI_API_KEY) && !demoMode, demoMode, mode: demoMode ? "demo-local" : process.env.GEMINI_API_KEY ? "gemini" : "local" });
}
