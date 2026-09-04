import { listProducts } from "@/lib/pawarna/store";
import { publicProduct } from "@/lib/pawarna/projects";
import { listJobs, publicJob, workerReady } from "@/lib/pawarna/store";
import { ownerId } from "@/lib/pawarna/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const owner = (await ownerId(true))!;
  const jobs = listJobs(owner);
  return Response.json({ products:listProducts(owner).map(publicProduct),jobs: jobs.map(publicJob), paused: process.env.GENERATION_ENABLED === "false", ready: { gemini: !!process.env.GEMINI_API_KEY, nexabot: !!process.env.NEXABOT_API_KEY, worker: process.env.GENERATION_ENABLED !== "false" && workerReady() } }, { headers: { "Cache-Control": "no-store" } });
}
