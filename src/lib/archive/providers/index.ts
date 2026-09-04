import { libraryOfCongressProvider } from "./libraryOfCongress.ts";
import { createNlbOneSearchProvider } from "./nlbOneSearch.ts";

export const ARCHIVE_PROVIDERS = {
  newspapersg: createNlbOneSearchProvider("newspaper"),
  nlb_records: createNlbOneSearchProvider("record"),
  nlb_audiovisual: createNlbOneSearchProvider("audiovisual"),
  library_of_congress: libraryOfCongressProvider,
} as const;

export type ArchiveProviderId = keyof typeof ARCHIVE_PROVIDERS;
