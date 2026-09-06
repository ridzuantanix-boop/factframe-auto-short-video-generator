const APPROVED_ASSET_HOSTS = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "tile.openstreetmap.org",
  "www.openstreetmap.org",
]);

export function isApprovedAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && APPROVED_ASSET_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch { return false; }
}

export function requireApprovedAssetUrl(value: string) {
  if (!isApprovedAssetUrl(value)) throw new Error("Alamat visual tidak datang daripada sumber yang diluluskan.");
  return value;
}

export const approvedAssetHosts = () => [...APPROVED_ASSET_HOSTS];

export function safePublicUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
