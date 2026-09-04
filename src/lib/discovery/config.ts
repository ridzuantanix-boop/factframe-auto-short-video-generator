export const DISCOVERY_CATEGORY_QUERIES: Record<string, string[]> = {
  interesting: ["notable historical event", "famous invention", "remarkable person", "world heritage"],
  people: ["Malaysian politician", "scientist", "artist", "entrepreneur"],
  history: ["historical event", "ancient civilization", "battle", "independence"],
  malaysia: [
    "Malaysia", "Malaysian history", "Malaysian culture", "Malaysian people", "British Malaya history",
    "Kuala Lumpur history", "Selangor history", "Penang history", "Johor history", "Perak history", "Kedah history",
    "Kelantan history", "Terengganu history", "Pahang history", "Negeri Sembilan history", "Malacca history",
    "Sabah history", "Sarawak history", "Malaysian disaster", "Malaysian invention", "Malaysian athlete", "Malaysian artist",
  ],
  world: ["world history", "international organization", "country", "global event"],
  business: ["technology company", "consumer brand", "automobile company", "entrepreneur"],
  science: ["scientific discovery", "technology", "space exploration", "inventor"],
  entertainment: ["film actor", "musician", "film director", "television series"],
  sports: ["athlete", "football club", "Olympic Games", "sport competition"],
  places: ["city", "landmark", "world heritage site", "island"],
  current: ["current head of government", "technology company", "international organization", "living person"],
  events: ["aviation accident", "natural disaster", "political event", "expedition"],
  mysteries: ["unsolved mystery", "disappearance", "historical disaster", "urban legend"],
  malaysia_mysteries: [
    "Highland Towers collapse", "Malaysia disaster", "Malaysia disappearance", "Malayan legend", "Mona Fandey",
    "Kellie's Castle", "Mimaland", "Karak Highway", "Malaysia unsolved murder", "Malaysia aviation mystery",
    "Malay ghost legend", "Johor urban legend", "Selangor disaster", "Penang mystery", "Perak legend",
    "Sabah disappearance", "Sarawak legend", "Malacca folklore", "Pahang unexplained", "Kuala Lumpur urban legend",
  ],
};

export const DISCOVERY_PROVIDERS = ["Wikidata", "Wikipedia"] as const;
export const DISCOVERY_GROUP_SIZE = 4;

export function usefulMysteryCandidate(item: { label: string; description: string }) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  return !/^list of|^lists of/.test(item.label.toLowerCase()) && !/television series|tv series|web series|film|album|song|novel|book by|episode|video game|mathematics|problems in|fictional|topics referred to/.test(text);
}

export function usefulCandidate(item: { label: string; description: string }) {
  const text = `${item.label} ${item.description}`.toLowerCase();
  return !/^list of|^lists of|^category:|^template:|^portal:/.test(item.label.toLowerCase()) && !/disambiguation page|wikimedia list article|outline of/.test(text);
}
