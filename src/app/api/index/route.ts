import { NextRequest, NextResponse } from "next/server";
import { DISCOVERY_CATEGORY_QUERIES } from "@/lib/discovery/config";
import { runDiscoveryIngestion } from "@/lib/discovery/indexer";
import { isStoryIndexConfigured } from "@/lib/discovery/store";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStoryIndexConfigured()) return NextResponse.json({ error: "Persistent story index is not configured." }, { status: 503 });
  const names = Object.keys(DISCOVERY_CATEGORY_QUERIES);
  const requested = request.nextUrl.searchParams.get("category");
  const category = requested && names.includes(requested) ? requested : names[Math.floor(Date.now() / 86_400_000) % names.length];
  try {
    return NextResponse.json(await runDiscoveryIngestion({ category, pagesPerQuery: 1, limit: 10, concurrency: 2 }));
  } catch (error) {
    console.error("[index] Scheduled ingestion failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Indexing failed." }, { status: 502 });
  }
}
