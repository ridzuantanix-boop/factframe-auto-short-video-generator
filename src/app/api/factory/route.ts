import { listProducts } from "@/lib/pawarna/store";
import { publicProduct } from "@/lib/pawarna/projects";
import { listJobs, publicJob, workerReady } from "@/lib/pawarna/store";
import { ownerId } from "@/lib/pawarna/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const owner = (await ownerId(true))!;
  const jobs = listJobs(owner);
  return Response.json({ products:listProducts(owner).map(publicProduct),usage:jobs.map(j=>({id:j.id,name:j.product?.name || "Produk",attempts:j.provider_requests.length,recorded_cost:j.provider_requests.reduce((sum,r)=>sum+r.cost,0),stage:j.stage})), jobs: listJobs(owner).map(publicJob), paused: process.env.GENERATION_ENABLED === "false", ready: { gemini: !!process.env.GEMINI_API_KEY, nexabot: !!process.env.NEXABOT_API_KEY, worker: process.env.GENERATION_ENABLED !== "false" && workerReady() } }, { headers: { "Cache-Control": "no-store" } });
}
