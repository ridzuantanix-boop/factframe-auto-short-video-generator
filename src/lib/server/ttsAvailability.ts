export function ttsUnavailableResponse() {
  return Response.json({ error: "Suara dalam talian belum tersedia. Aplikasi akan cuba suara tempatan." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
