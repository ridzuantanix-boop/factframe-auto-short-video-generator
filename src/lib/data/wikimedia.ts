import { isReusableLicense, licenseScore } from "../licensing/licenseFilter.ts";
import type { Visual } from "../types.ts";

const API = "https://commons.wikimedia.org/w/api.php";

function plain(value?: string) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type Page = {
  pageid?: number;
  title: string;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    width: number;
    height: number;
    descriptionurl: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

async function searchCommons(query: string, mediaType: "image" | "video", limit = 12): Promise<Visual[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} ${mediaType === "video" ? "filetype:video" : "filetype:bitmap"}`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
    format: "json",
    origin: "*",
  });
  const url = `${API}?${params}`; let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try { response = await fetch(url, { signal: controller.signal, headers: { "Api-User-Agent": "FactFrame/2.0 (evidence-aware visual planner)" }, next: { revalidate: 86400 } }); }
    catch { response = null; } finally { clearTimeout(timer); }
    if (response?.ok || (response && response.status < 500 && response.status !== 429)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response?.ok) throw new Error(`Carian Wikimedia Commons gagal${response ? ` (${response.status})` : ""}`);
  const data = await response.json();
  const pages: Page[] = Object.values(data.query?.pages ?? {});
  return pages.flatMap((page): Visual[] => {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata;
    const license = plain(meta?.LicenseShortName?.value ?? meta?.UsageTerms?.value);
    const validMime = mediaType === "video" ? Boolean(info?.mime?.startsWith("video/")) : Boolean(info?.mime?.startsWith("image/"));
    if (!info || !validMime || !isReusableLicense(license)) return [];
    if (Math.max(info.width, info.height) < 640 || Math.min(info.width, info.height) < 320) return [];
    const lower = page.title.toLowerCase();
    if (mediaType === "image" && /logo|icon|signature|map icon|coat of arms|screenshot/.test(lower)) return [];
    return [{
      id: String(page.pageid ?? info.url),
      title: plain(meta?.ObjectName?.value) || page.title.replace(/^File:/, ""),
      url: info.url,
      thumbUrl: info.thumburl ?? info.url,
      width: info.width,
      height: info.height,
      creator: plain(meta?.Artist?.value) || "Pencipta tidak diketahui",
      license,
      licenseUrl: plain(meta?.LicenseUrl?.value),
      sourceUrl: info.descriptionurl,
      description: plain(meta?.ImageDescription?.value),
      source: "Wikimedia Commons",
      mediaType,
      mimeType: info.mime,
      visualKind: mediaType === "video" ? "VIDEO" : "PHOTO",
    }];
  }).sort((a, b) => licenseScore(b.license) - licenseScore(a.license) || (b.width * b.height) - (a.width * a.height));
}

export async function searchVisuals(query: string): Promise<Visual[]> {
  return (await searchCommons(query, "image", 24)).slice(0, 6);
}

export async function searchVideos(query: string): Promise<Visual[]> {
  return (await searchCommons(query, "video", 12)).slice(0, 5);
}
