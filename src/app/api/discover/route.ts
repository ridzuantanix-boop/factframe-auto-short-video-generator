import { NextRequest, NextResponse } from "next/server";
import { searchWikipediaCandidates } from "@/lib/data/wikidata";

const categoryQueries: Record<string, string[]> = {
  interesting: ["notable historical event", "famous invention", "remarkable person", "world heritage"],
  people: ["Malaysian politician", "scientist", "artist", "entrepreneur"],
  history: ["historical event", "ancient civilization", "battle", "independence"],
  malaysia: ["Malaysia", "Malaysian history", "Malaysian culture", "Malaysian people"],
  world: ["world history", "international organization", "country", "global event"],
  business: ["technology company", "consumer brand", "automobile company", "entrepreneur"],
  science: ["scientific discovery", "technology", "space exploration", "inventor"],
  entertainment: ["film actor", "musician", "film director", "television series"],
  sports: ["athlete", "football club", "Olympic Games", "sport competition"],
  places: ["city", "landmark", "world heritage site", "island"],
  current: ["current head of government", "technology company", "international organization", "living person"],
  events: ["aviation accident", "natural disaster", "political event", "expedition"],
  mysteries: ["unsolved mystery", "disappearance", "historical disaster", "urban legend"],
  malaysia_mysteries: ["Highland Towers collapse", "Malaysia disaster", "Malaysia disappearance", "Malayan legend", "Mona Fandey", "Kellie's Castle", "Mimaland", "Karak Highway", "Malaysia unsolved murder", "Malaysia aviation mystery", "Malay ghost legend", "Johor urban legend"],
};

function usefulMysteryCandidate(item: { label: string; description: string }) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  return !/^list of|^lists of/.test(item.label.toLowerCase()) && !/television series|tv series|web series|film|album|song|novel|book by|episode|video game|mathematics|problems in|fictional|topics referred to/.test(text);
}

function usefulCandidate(item: { label: string; description: string }) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  return !/^list of|^lists of|^category:|^template:|^portal:/.test(item.label.toLowerCase()) && !/disambiguation page|wikimedia list article|outline of/.test(text);
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? "interesting";
  const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") ?? 0));
  const queries = categoryQueries[category] ?? categoryQueries.interesting;
  try {
    const mysteryCategory = category === "mysteries" || category === "malaysia_mysteries";
    const groupSize = 4;
    const groupCount = Math.ceil(queries.length / groupSize);
    const groupIndex = page % groupCount;
    const offsetPage = Math.floor(page / groupCount);
    const activeQueries = queries.slice(groupIndex * groupSize, groupIndex * groupSize + groupSize);
    const batches = await Promise.all(activeQueries.map((query) => searchWikipediaCandidates(query, offsetPage * 25, 25).catch(() => ({ results: [], hasMore: false }))));
    const combined = batches.flatMap((batch) => batch.results);
    const filtered = combined.filter(usefulCandidate).filter((item) => !mysteryCategory || usefulMysteryCandidate(item));
    const unique = [...new Map(filtered.map((item) => [item.id, item])).values()];
    return NextResponse.json({ results: unique, page, hasMore: groupIndex < groupCount - 1 || batches.some((batch) => batch.hasMore), estimatedAvailable: 1000 }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "Katalog sumber tidak dapat dicapai buat masa ini." }, { status: 502 });
  }
}
