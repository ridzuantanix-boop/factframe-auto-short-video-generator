const ALLOWED = ["public domain", "cc0", "cc by", "cc-by", "creative commons attribution"];

export function isReusableLicense(name: string) {
  const normalized = name.toLowerCase();
  return ALLOWED.some((license) => normalized.includes(license));
}

export function licenseScore(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("public domain") || normalized.includes("cc0")) return 3;
  if (normalized.includes("cc by") || normalized.includes("cc-by")) return 2;
  return 1;
}
