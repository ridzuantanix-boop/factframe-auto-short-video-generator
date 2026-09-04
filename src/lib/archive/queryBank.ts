const REGIONS = ["Kuala Lumpur", "Selangor", "Perak", "Penang", "Johore", "Kedah", "Kelantan", "Trengganu", "Pahang", "Negri Sembilan", "Malacca", "North Borneo", "Sarawak", "Malaya"];

export const ARCHIVE_QUERY_GROUPS: Record<string, string[]> = {
  mysteries: [
    "Kuala Lumpur missing", "Selangor mysterious death", "Perak body found", "Penang disappeared", "Johore murder",
    "Kedah missing man", "Kelantan strange animal", "Trengganu missing", "Pahang unexplained", "Negri Sembilan murder",
    "Malacca haunted", "North Borneo disappearance", "Sarawak mysterious", "Malaya strange lights", "Malaya missing child",
    "Malaya mysterious shooting", "Malaya vanished", "Malaya body found", "Malaya unexplained death", "Malaya mass hysteria",
  ],
  incidents: [
    "Kuala Lumpur accident", "Selangor shooting", "Perak murder", "Penang missing woman", "Johore police disappearance",
    "Kedah strange incident", "Kelantan panic", "Trengganu dead body", "Pahang lost", "Negri Sembilan unexplained accident",
    "Malacca ghost", "North Borneo strange animal", "Sarawak missing", "Malaya disaster", "Malaya abandoned building",
  ],
  historical: [
    "British Malaya incident", "Federated Malay States police", "Unfederated Malay States accident", "Straits Settlements inquiry",
    "Kwala Lumpur tragedy", "Johor unexplained", "Terengganu mysterious", "Negeri Sembilan missing", "Melaka murder",
    "Sabah disappearance", "Malayan folklore", "Malaya legend",
  ],
};

export const ARCHIVE_REGIONS = REGIONS;

export function archiveQueries(group?: string, region?: string) {
  const groups = group ? { [group]: ARCHIVE_QUERY_GROUPS[group] } : ARCHIVE_QUERY_GROUPS;
  if (group && !ARCHIVE_QUERY_GROUPS[group]) throw new Error(`Unknown archive query group: ${group}`);
  const queries = Object.values(groups).flat();
  if (!region) return [...new Set(queries)];
  const normalized = region.toLowerCase();
  return [...new Set(queries.filter((query) => query.toLowerCase().includes(normalized)).concat([
    `${region} missing`, `${region} mysterious`, `${region} unexplained`, `${region} historical incident`,
  ]))];
}
