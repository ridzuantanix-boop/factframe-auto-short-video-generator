import { isReusableLicense, licenseScore } from "@/lib/licensing/licenseFilter";
import type { Visual } from "@/lib/types";

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

export async function searchVisuals(query: string): Promise<Visual[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`${API}?${params}`, { headers: { "Api-User-Agent": "FactFrame/1.0 (local educational video generator)" }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error("Wikimedia Commons search failed");
  const data = await response.json();
  const pages: Page[] = Object.values(data.query?.pages ?? {});
  return pages.flatMap((page): Visual[] => {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata;
    const license = plain(meta?.LicenseShortName?.value ?? meta?.UsageTerms?.value);
    if (!info || !info.mime?.startsWith("image/") || !isReusableLicense(license)) return [];
    if (Math.max(info.width, info.height) < 700 || Math.min(info.width, info.height) < 350) return [];
    const lower = page.title.toLowerCase();
    if (/logo|icon|signature|map icon|coat of arms|screenshot|scan/.test(lower)) return [];
    return [{
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
    }];
  }).sort((a, b) => licenseScore(b.license) - licenseScore(a.license) || (b.width * b.height) - (a.width * a.height)).slice(0, 6);
}
