import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
export async function ownerId(create = false) {
  const jar = await cookies(); let token = jar.get("pawarna_session")?.value;
  if (!token && create) { token = randomBytes(32).toString("hex"); jar.set("pawarna_session", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 }); }
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return createHash("sha256").update(token).digest("hex");
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("Permintaan daripada laman lain ditolak.");
}
