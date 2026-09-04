import { hash, json } from "./utils";
export { PawarnaFactory } from "./factory";
export interface Env {
  FACTORY: DurableObjectNamespace;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  NEXABOT_API_KEY?: string;
  PAWARNA_ADMIN_TOKEN?: string;
  GEMINI_TEXT_MODEL: string;
  PAWARNA_MAX_ACTIVE: string;
  PAWARNA_DAILY_LIMIT: string;
  GENERATION_ENABLED: string;
  NEXABOT_BASE_URL: string;
}
function secured(response: Response, pathname: string) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff"); headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY"); headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (pathname === "/sw.js") { headers.set("Cache-Control", "no-cache, no-store, must-revalidate"); headers.set("Service-Worker-Allowed", "/"); }
  if (pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return secured(await env.ASSETS.fetch(request), url.pathname);
      if (url.pathname === "/api/health" && request.method === "GET") return secured(json({ ok: true, deployment: "cloudflare", model: env.GEMINI_TEXT_MODEL }), url.pathname);
      if (url.pathname === "/api/admin/jobs") {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (request.method !== "GET" || !env.PAWARNA_ADMIN_TOKEN || !token || await hash(token) !== await hash(env.PAWARNA_ADMIN_TOKEN)) return secured(json({ error: "Tidak ditemui." }, 404), url.pathname);
        const stub = env.FACTORY.get(env.FACTORY.idFromName("studio-v1"));
        return secured(await stub.fetch(new Request("https://internal/admin/audit")), url.pathname);
      }
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") return secured(json({ error: "Kaedah tidak dibenarkan." }, 405), url.pathname);
      if (request.method === "POST" && (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site")) return secured(json({ error: "Permintaan daripada laman lain ditolak." }, 403), url.pathname);
      let token = request.headers.get("cookie")?.match(/(?:^|;\s*)pawarna_cloud_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      let newSession = false;
      if (!token && url.pathname === "/api/factory" && request.method === "GET") { token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"); newSession = true; }
      if (!token) return secured(json({ error: "Refresh halaman untuk memulakan sesi." }, 401), url.pathname);
      const headers = new Headers(request.headers);
      headers.delete("cookie"); headers.set("x-pawarna-owner", await hash(token));
      // Overwrite caller-controlled identifiers. The Durable Object has no public URL.
      headers.set("x-pawarna-ip", await hash(request.headers.get("cf-connecting-ip") || "local-test"));
      const stub = env.FACTORY.get(env.FACTORY.idFromName("studio-v1"));
      const response = await stub.fetch(new Request(request, { headers }));
      const result = secured(response, url.pathname);
      if (newSession) result.headers.set("Set-Cookie", `pawarna_cloud_session=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=7776000`);
      return result;
    } catch {
      return secured(json({ error: "Server sementara tidak tersedia. Cuba lagi sebentar lagi." }, 503), url.pathname);
    }
  },
} satisfies ExportedHandler<Env>;
