import type { StoryStore } from "../discovery/store.ts";
import type { StoredStorySource } from "../archive/types.ts";
import { cleanArchiveText } from "./narrationRewriter.ts";

function decodeHtml(value: string) { return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim(); }
function publicText(html: string) {
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1];
  const text = cleanArchiveText(decodeHtml(meta ?? "")); return text.length >= 80 ? text.slice(0, 1200) : "";
}

export async function deepenLinkedSources(sources: StoredStorySource[], store: StoryStore, fetcher: typeof fetch = fetch) {
  let attempted = 0; let enriched = 0;
  const stale = (source: StoredStorySource) => { const checked = Date.parse(String(source.metadata.sourceDeepeningCheckedAt ?? "")); return !checked || Date.now() - checked > 86_400_000; };
  await Promise.all(sources.filter((source) => source.snippet.length < 900 && typeof source.metadata.expandedSnippet !== "string" && stale(source)
    && source.metadata.requiresLogin !== true && source.metadata.requiresEzproxy !== true).slice(0, 2).map(async (source) => {
    attempted += 1; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000); const checkedAt = new Date().toISOString(); let persisted = false;
    try { const response = await fetcher(source.url, { signal: controller.signal, headers: { "User-Agent": "FactFrame/2.0 research audit" } });
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return;
      const excerpt = publicText(await response.text()); if (!excerpt || excerpt.length <= source.snippet.length + 40) return;
      await store.updateSourceEnrichment(source.id, { ...source.metadata, rawSnippet: source.snippet, expandedSnippet: excerpt, expandedSnippetSource: source.url,
        expandedSnippetFetchedAt: checkedAt, sourceDeepeningCheckedAt: checkedAt }); persisted = true; enriched += 1;
    } catch { /* Public source unavailable: preserve existing snippet and continue. */ } finally {
      clearTimeout(timeout); if (!persisted) try { await store.updateSourceEnrichment(source.id, { ...source.metadata, sourceDeepeningCheckedAt: checkedAt }); } catch { /* Cache failure must not break deterministic fallback. */ }
    }
  }));
  return { attempted, enriched };
}
