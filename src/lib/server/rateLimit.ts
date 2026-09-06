type LimitState = { count: number; resetAt: number };

const globalLimits = globalThis as typeof globalThis & { factFrameLimits?: Map<string, LimitState> };
const limits = globalLimits.factFrameLimits ??= new Map<string, LimitState>();

export type RateLimitPolicy = { name: string; limit: number; windowMs: number };

function requestIdentities(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const session = request.headers.get("x-factframe-session")?.trim().slice(0, 80);
  return [...new Set([`ip:${ip}`, session ? `session:${session}` : null].filter((value): value is string => Boolean(value)))];
}

export function consumeRateLimit(key: string, policy: RateLimitPolicy, now = Date.now()) {
  const storageKey = `${policy.name}:${key}`;
  const previous = limits.get(storageKey);
  const state = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + policy.windowMs } : previous;
  state.count += 1;
  limits.set(storageKey, state);
  return { allowed: state.count <= policy.limit, remaining: Math.max(0, policy.limit - state.count), retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)), resetAt: state.resetAt };
}

export function enforceRateLimit(request: Request, policy: RateLimitPolicy) {
  const results = requestIdentities(request).map((identity) => consumeRateLimit(identity, policy));
  const result = results.find((candidate) => !candidate.allowed);
  if (!result) return null;
  return Response.json({ error: "Terlalu banyak cubaan. Tunggu sebentar sebelum cuba lagi." }, {
    status: 429,
    headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" },
  });
}

export function rejectOversizedRequest(request: Request, maxBytes: number) {
  const size = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(size) && size > maxBytes
    ? Response.json({ error: "Permintaan terlalu besar." }, { status: 413, headers: { "Cache-Control": "no-store" } })
    : null;
}

export function resetRateLimitsForTests() { limits.clear(); }
