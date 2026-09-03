import { NextRequest, NextResponse } from "next/server";
import { searchVisuals } from "@/lib/data/wikimedia";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Topik tidak diberikan." }, { status: 400 });
  try {
    const visuals = await searchVisuals(query);
    return NextResponse.json({ visuals }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ error: "Visual berlesen tidak dapat diambil buat masa ini." }, { status: 502 });
  }
}
