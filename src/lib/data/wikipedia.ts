export async function getWikipediaContext(title?: string, language = "ms") {
  if (!title) return undefined;
  const params = new URLSearchParams({ action: "query", prop: "extracts|info", explaintext: "1", exintro: "1", redirects: "1", inprop: "url", titles: title, format: "json", origin: "*" });
  const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, { headers: { "Api-User-Agent": "FactFrame/2.0 (source-backed story video generator)" }, next: { revalidate: 21600 } });
  if (!response.ok) return undefined;
  const data = await response.json();
  const page = Object.values(data.query?.pages ?? {})[0] as { extract?: string; fullurl?: string } | undefined;
  if (!page?.extract) return undefined;
  return { extract: page.extract.replace(/\s+/g, " ").trim(), url: page.fullurl };
}
