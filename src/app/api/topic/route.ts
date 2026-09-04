import { after, NextRequest, NextResponse } from "next/server";
import { getEntity, extractFacts } from "@/lib/data/wikidata";
import { getWikipediaContext } from "@/lib/data/wikipedia";
import { buildNarration } from "@/lib/content/narrationBuilder";
import { normalizeCandidate } from "@/lib/discovery/normalizer";
import { calculateResearchScore, qualifyCandidate } from "@/lib/discovery/storyScorer";
import { getStoryStore, isStoryIndexConfigured } from "@/lib/discovery/store";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const requestedLabel = request.nextUrl.searchParams.get("label")?.trim().slice(0, 100);
  if (!id || !/^Q\d+$/.test(id)) return NextResponse.json({ error: "Topik tidak sah." }, { status: 400 });
  try {
    const entity = await getEntity(id);
    const wikiTitleMs = entity.sitelinks?.mswiki?.title;
    const wikiTitleEn = entity.sitelinks?.enwiki?.title;
    const name = requestedLabel || entity.labels?.ms?.value || entity.labels?.en?.value || wikiTitleMs?.replace(/\s*\([^)]*\)$/, "") || wikiTitleEn?.replace(/\s*\([^)]*\)$/, "") || id;
    const details = await extractFacts(entity);
    const genericDescriptions = { person: "seorang tokoh yang tercatat dalam sejarah", place: "sebuah lokasi yang mempunyai sejarah tersendiri", event: "sebuah peristiwa yang direkodkan dalam sejarah", object: "sebuah objek yang mempunyai kisah tersendiri", organisation: "sebuah organisasi yang direkodkan dalam sumber awam", animal: "sejenis haiwan yang direkodkan dalam dunia semula jadi", space: "sebuah objek angkasa", general: "sebuah subjek yang mempunyai rekod sejarah" };
    const description = entity.descriptions?.ms?.value ?? genericDescriptions[details.entityType];
    const wikipedia = wikiTitleMs ? await getWikipediaContext(wikiTitleMs, "ms") : undefined;
    const narration = buildNarration(name, description, details.entityType, details.facts, wikipedia?.extract);
    if (!details.facts.length && !wikipedia?.extract) {
      return NextResponse.json({ error: "Kami tidak menemui maklumat sahih yang mencukupi untuk topik ini." }, { status: 404 });
    }
    const overview = description ? { label: "Gambaran ringkas", sentence: `${name} ialah ${description.replace(/\.$/, "")}.`, sourceUrl: `https://www.wikidata.org/wiki/${id}` } : undefined;
    const facts = overview ? [overview, ...details.facts].slice(0, 5) : [...details.facts];
    if (wikipedia?.extract && wikipedia.url) {
      const extras = wikipedia.extract.split(/(?<=[.!?])\s+/).flatMap((sentence) => sentence.split(/;|,(?=\s+(?:kemudian|tetapi|dan|yang|apabila|selepas|sebelum|pada tahun))/i)).map((sentence) => sentence.trim()).filter((sentence) => { const count = sentence.split(/\s+/).length; return /^[A-ZÀ-ÖØ-Þ0-9]/.test(sentence) && count >= 8 && count <= 38; });
      for (const sentence of extras) {
        if (facts.length >= 14) break;
        const normalized = sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ");
        if (facts.some((fact) => { const existing = fact.sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " "); return existing.includes(normalized.slice(0, 28)) || normalized.includes(existing.slice(0, 28)); })) continue;
        const words = sentence.replace(/[.!?]+$/, "").split(/\s+/);
        facts.push({ label: `${words.slice(0, 7).join(" ")}${words.length > 7 ? "…" : ""}`, sentence, sourceUrl: wikipedia.url });
      }
    }
    const currentAware = ["person", "organisation", "place", "event"].includes(details.entityType);
    if (isStoryIndexConfigured()) {
      const verifiedAt = new Date().toISOString();
      const sourceHints = [...new Set(facts.map((fact) => fact.sourceUrl).filter(Boolean))];
      const candidate = normalizeCandidate({ id, label: name, description, url: `https://www.wikidata.org/wiki/${id}` }, "interesting", name, "Wikidata/Wikipedia");
      Object.assign(candidate, { sourceHints, sourceCount: sourceHints.length, claimCount: facts.length,
        researchScore: calculateResearchScore(sourceHints.length, facts.length), status: qualifyCandidate(sourceHints.length, facts.length),
        lastResearchedAt: verifiedAt, lastVerifiedAt: verifiedAt });
      after(async () => { await getStoryStore().upsert(candidate); });
    }
    return NextResponse.json({ topic: { id, name, description, entityType: details.entityType, facts, narration, wikipediaUrl: wikipedia?.url, wikipediaExtract: wikipedia?.extract, currentAware, lastVerifiedAt: new Date().toISOString().slice(0, 10) } }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (error) {
    console.error("[topic] Topic hydration failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Fakta sahih untuk topik ini tidak dapat disediakan." }, { status: 502 });
  }
}
