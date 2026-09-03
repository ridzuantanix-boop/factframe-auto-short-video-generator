import { NextRequest, NextResponse } from "next/server";
import { getEntity, extractFacts } from "@/lib/data/wikidata";
import { getWikipediaContext } from "@/lib/data/wikipedia";
import { buildNarration } from "@/lib/content/narrationBuilder";

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
    if (facts.length < 3 && wikipedia?.extract && wikipedia.url) {
      const extras = wikipedia.extract.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.split(/\s+/).length >= 8 && sentence.split(/\s+/).length <= 30);
      for (const sentence of extras) {
        if (facts.length >= 3) break;
        if (facts.some((fact) => fact.sentence.toLowerCase().includes(sentence.slice(0, 24).toLowerCase()))) continue;
        const words = sentence.replace(/[.!?]+$/, "").split(/\s+/);
        facts.push({ label: `${words.slice(0, 7).join(" ")}${words.length > 7 ? "…" : ""}`, sentence, sourceUrl: wikipedia.url });
      }
    }
    return NextResponse.json({ topic: { id, name, description, entityType: details.entityType, facts, narration, wikipediaUrl: wikipedia?.url, wikipediaExtract: wikipedia?.extract } }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ error: "Fakta sahih untuk topik ini tidak dapat disediakan." }, { status: 502 });
  }
}
