import { NextRequest, NextResponse } from "next/server";
import type { StoryIndexStatus } from "@/lib/types";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";

const STATUSES = new Set<StoryIndexStatus>(["DISCOVERED", "PARTIAL", "READY", "HIDDEN"]);
const SORTS = new Set(["newest", "oldest", "title", "research"] as const);

export async function GET(request: NextRequest) {
  if (!isStoryIndexConfigured()) return NextResponse.json({ error: "Persistent story index is not configured." }, { status: 503 });
  const params = request.nextUrl.searchParams;
  const statusValue = params.get("status")?.toUpperCase() as StoryIndexStatus | undefined;
  const sortValue = params.get("sort") as "newest" | "oldest" | "title" | "research" | null;
  if (statusValue && !STATUSES.has(statusValue)) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  if (sortValue && !SORTS.has(sortValue)) return NextResponse.json({ error: "Invalid sort option." }, { status: 400 });
  try {
    const result = await getStoryStore().list({
      category: params.get("category") || undefined, country: params.get("country") || undefined,
      status: statusValue, search: params.get("search") || undefined,
      page: Number(params.get("page") || 1), limit: Number(params.get("limit") || 24), sort: sortValue || "newest",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (error) {
    console.error("[catalog] Persistent index query failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Katalog persisten tidak dapat dicapai." }, { status: 503 });
  }
}
