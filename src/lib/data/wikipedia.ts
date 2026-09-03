export async function getWikipediaContext(title?: string, language = "ms") {
  if (!title) return undefined;
  const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const response = await fetch(endpoint, { headers: { "Api-User-Agent": "AutoShortVideo/1.0 (educational MVP)" }, next: { revalidate: 86400 } });
  if (!response.ok) return undefined;
  const data = await response.json();
  return { extract: String(data.extract ?? ""), url: data.content_urls?.desktop?.page as string | undefined };
}
