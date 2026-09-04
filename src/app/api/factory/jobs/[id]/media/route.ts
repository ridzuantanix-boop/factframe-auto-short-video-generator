import { getJob, readVideo } from "@/lib/pawarna/store";
import { ownerId } from "@/lib/pawarna/session";
import { decodeImage } from "@/lib/pawarna/validation";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const job = getJob(id);
  if (!job || job.owner !== await ownerId()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("type") === "thumbnail") {
    const { bytes, mimeType } = decodeImage(job.input.images[0]);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  }
  if (!job.video_path) return new Response("Not ready", { status: 409 });
  const bytes = readVideo(job);
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  if (url.searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="pawarna-${job.id}.mp4"`;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
    if (start > end || start >= bytes.length) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
}
