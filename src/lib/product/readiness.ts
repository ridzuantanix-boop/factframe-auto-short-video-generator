import type { SearchResult, StoryIndexStatus } from "../types.ts";
import type { ResearchPackage } from "../research/types.ts";

export function userReadinessLabel(status?: StoryIndexStatus) {
  if (status === "READY") return "Boleh dijana";
  if (status === "PARTIAL") return "Bahan belum cukup";
  if (status === "DISCOVERED") return "Sedang disemak";
  return "Boleh dijana";
}

export function canGenerateStory(result: Pick<SearchResult, "status">) {
  return !result.status || result.status === "READY";
}

export function supportedDurationLabel(seconds?: number) {
  return seconds && seconds > 0 ? `Cadangan: ${Math.round(seconds)} saat` : "Tempoh ikut bahan tersedia";
}

export function friendlyGenerationError(stage: "voice" | "visual" | "render", error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/codec|MediaRecorder|rakaman video/i.test(message)) return "Pelayar ini tidak menyokong format video yang diperlukan. Cuba Chrome atau Edge versi terkini.";
  if (/timeout|terlalu lama|network|fetch|abort/i.test(message)) return "Sambungan mengambil masa terlalu lama. Cuba semula—bahan yang sudah siap akan digunakan semula.";
  if (/map|peta|visual|imej|asset/i.test(message) || stage === "visual") return "Sebahagian visual tidak dapat dimuatkan. Cuba semula atau pilih cerita lain.";
  if (/suara|audio|tts|gemini/i.test(message) || stage === "voice") return "Suara belum dapat disediakan. Cuba semula sebentar lagi.";
  if (/interrupted|terhenti|tab/i.test(message)) return "Proses video terhenti. Pastikan tab kekal terbuka, kemudian cuba semula.";
  return stage === "render" ? "Video belum dapat disiapkan. Cuba semula tanpa menutup tab ini." : "Cerita belum dapat disediakan. Sila cuba lagi.";
}

export function isPublicReadyPackage(pkg: Partial<ResearchPackage> | null | undefined) {
  return pkg?.readyDecision?.status === "READY"
    && Number(pkg.supportedDurationSeconds) >= 8
    && ["NOT_REQUIRED", "VERIFIED"].includes(String(pkg.verificationStatus));
}
