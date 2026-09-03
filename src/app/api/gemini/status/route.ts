export async function GET() {
  return Response.json({ configured: Boolean(process.env.GEMINI_API_KEY) });
}
