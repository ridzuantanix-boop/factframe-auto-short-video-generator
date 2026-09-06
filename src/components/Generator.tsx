"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Dice5, Download, Film, LoaderCircle, Play, Search, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { adaptiveTtsProvider, previewNarrator } from "@/lib/audio/ttsProvider";
import { DEFAULT_VOICE_PRESET_ID, VOICE_PRESETS, type VoicePresetId } from "@/lib/audio/voicePresets";
import { renderVideo } from "@/lib/video/renderer";
import { caseStatusLabels, categoryLabels, mysteryCatalog } from "@/lib/mystery/catalog";
import { buildMysteryScript, effectiveStoryDuration, mysteryScriptToTopic, passesQualityGate } from "@/lib/mystery/storyEngine";
import { autoMysteryScriptToTopic, buildAutoMysteryScript } from "@/lib/mystery/autoEngine";
import { buildExplainerScript, explainerScriptToTopic, generateStoryAngles } from "@/lib/story/explainerEngine";
import type { ContentMode, MysteryScript, SearchResult, StoryAngle, StoryDuration, StoryRecord, StoryTone, Topic, Visual, VisualQualityReport, WatermarkConfig, WatermarkPosition } from "@/lib/types";
import type { VisualPlan } from "@/lib/visual/types";
import type { ExportManifest } from "@/lib/video/renderer";
import { canGenerateStory, friendlyGenerationError, supportedDurationLabel, userReadinessLabel } from "@/lib/product/readiness";
import { safePublicUrl } from "@/lib/security/assetPolicy";

type Stage = "idle" | "searching" | "choosing" | "angles" | "preview" | "generating" | "done";

const DEFAULT_WATERMARK: WatermarkConfig = { enabled: false, text: "", position: "BOTTOM_RIGHT", opacity: .75, size: "SMALL" };
const WATERMARK_POSITIONS: Array<{ value: WatermarkPosition; label: string }> = [
  { value: "TOP_LEFT", label: "Atas kiri" }, { value: "TOP_CENTER", label: "Atas tengah" }, { value: "TOP_RIGHT", label: "Atas kanan" },
  { value: "MIDDLE_LEFT", label: "Tengah kiri" }, { value: "CENTER", label: "Tengah" }, { value: "MIDDLE_RIGHT", label: "Tengah kanan" },
  { value: "BOTTOM_LEFT", label: "Bawah kiri" }, { value: "BOTTOM_CENTER", label: "Bawah tengah" }, { value: "BOTTOM_RIGHT", label: "Bawah kanan" },
];

const DISCOVERY_CATEGORIES = [
  ["🔥", "Cerita menarik", "interesting"], ["👤", "Tokoh", "people"], ["🏛", "Sejarah", "history"], ["🇲🇾", "Malaysia", "malaysia"],
  ["🌍", "Dunia", "world"], ["💼", "Syarikat & jenama", "business"], ["🚀", "Sains & teknologi", "science"], ["🎬", "Hiburan", "entertainment"],
  ["⚽", "Sukan", "sports"], ["📍", "Tempat", "places"], ["📈", "Topik semasa", "current"], ["✈️", "Peristiwa besar", "events"],
] as const;

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (response.status === 429) throw new Error("Had penggunaan Gemini sementara telah dicapai. Tunggu sebentar, kemudian cuba semula.");
  if (!response.ok) throw new Error(data.error ?? "Sesuatu tidak berjalan lancar.");
  return data;
}

// Keep instrumentation outside React's render-purity analysis. This helper is only
// called from event handlers and effects, never while deriving rendered output.
function monotonicNowMs() {
  return globalThis.performance.now();
}

function randomCatalogStory<T>(stories: T[]) {
  return stories[Math.floor(Math.random() * stories.length)];
}

export function Generator() {
  const [mode, setMode] = useState<ContentMode>("MYSTERY");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ message: "Menyediakan fakta", percent: 0 });
  const [videoUrl, setVideoUrl] = useState("");
  const [exportManifest, setExportManifest] = useState<ExportManifest | null>(null);
  const [exportExtension, setExportExtension] = useState<".mp4" | ".webm">(".webm");
  const [renderHashes, setRenderHashes] = useState({ researchPackageHash: "UNVERSIONED", visualPlanHash: "UNVERSIONED" });
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(null);
  const [duration, setDuration] = useState<StoryDuration>(30);
  const [durationNotice, setDurationNotice] = useState("");
  const [tone, setTone] = useState<StoryTone>("DOCUMENTARY");
  const [showSourceNote, setShowSourceNote] = useState(true);
  const [catalogFilter, setCatalogFilter] = useState("Semua");
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [voicePresetId, setVoicePresetId] = useState<VoicePresetId>(DEFAULT_VOICE_PRESET_ID);
  const [previewingVoice, setPreviewingVoice] = useState<VoicePresetId | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState("");
  const [, setTtsFailed] = useState(false);
  const [, setVoiceProvider] = useState<"gemini" | "local" | null>(null);
  const [, setVisualQuality] = useState<VisualQualityReport | null>(null);
  const [watermark, setWatermark] = useState<WatermarkConfig>(DEFAULT_WATERMARK);
  const [baseTopic, setBaseTopic] = useState<Topic | null>(null);
  const [storyAngles, setStoryAngles] = useState<StoryAngle[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<StoryAngle | null>(null);
  const [discoveryItems, setDiscoveryItems] = useState<SearchResult[]>([]);
  const [discoveryCategory, setDiscoveryCategory] = useState("interesting");
  const [discoveryPage, setDiscoveryPage] = useState(0);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryHasMore, setDiscoveryHasMore] = useState(true);
  const [discoveryTotal, setDiscoveryTotal] = useState<number | null>(null);
  const [mysteryCandidates, setMysteryCandidates] = useState<SearchResult[]>([]);
  const [mysteryPage, setMysteryPage] = useState(0);
  const [mysteryLoading, setMysteryLoading] = useState(false);
  const [mysteryHasMore, setMysteryHasMore] = useState(true);
  const [mysteryTotal, setMysteryTotal] = useState<number | null>(null);
  const [failedStage, setFailedStage] = useState<"voice" | "visual" | "render" | null>(null);
  const timingsRef = useRef({ researchLoadMs: 0, visualPlanLoadMs: 0 });

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => { if (exportManifest && new URLSearchParams(window.location.search).get("debug") === "1") (window as Window & { __FACTFRAME_AUDIT__?: ExportManifest }).__FACTFRAME_AUDIT__ = exportManifest; }, [exportManifest]);
  useEffect(() => { void fetch("/api/gemini/status").then((response) => response.json()).then((data) => setGeminiConfigured(Boolean(data.configured))).catch(() => setGeminiConfigured(false)); }, []);
  useEffect(() => { const saved = localStorage.getItem("factframe-voice-preset") as VoicePresetId | null; if (VOICE_PRESETS.some((preset) => preset.id === saved)) queueMicrotask(() => setVoicePresetId(saved!)); }, []);
  useEffect(() => { try { const saved = localStorage.getItem("factframe-watermark"); if (saved) { const parsed = JSON.parse(saved) as Partial<WatermarkConfig>; queueMicrotask(() => setWatermark({ ...DEFAULT_WATERMARK, ...parsed, text: String(parsed.text ?? "").replace(/[\r\n]+/g, " ").slice(0, 40) })); } } catch { /* Kekalkan tetapan lalai jika data lama rosak. */ } }, []);
  useEffect(() => () => { if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl); }, [previewAudioUrl]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/discover?category=interesting&page=0").then((response) => readJson<{ results: SearchResult[]; hasMore: boolean; total: number | null }>(response)),
      fetch("/api/discover?category=mysteries&page=0").then((response) => readJson<{ results: SearchResult[]; hasMore: boolean; total: number | null }>(response)),
    ]).then(([stories, mysteries]) => {
      if (active) { setDiscoveryItems(stories.results); setDiscoveryHasMore(stories.hasMore); setDiscoveryTotal(stories.total); setMysteryCandidates(mysteries.results); setMysteryHasMore(mysteries.hasMore); setMysteryTotal(mysteries.total); }
    }).catch(() => { /* Carian manual masih tersedia jika feed discovery gagal. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const restoreId = new URLSearchParams(window.location.search).get("story") ?? sessionStorage.getItem("factframe-last-story");
    if (restoreId && !/^Q\d+$/.test(restoreId)) {
      const researchStartedAt = monotonicNowMs();
      void fetch(`/api/research?id=${encodeURIComponent(restoreId)}`)
        .then((response) => readJson<{ story: StoryRecord }>(response))
        .then(({ story }) => {
          timingsRef.current.researchLoadMs = Math.round(monotonicNowMs() - researchStartedAt);
          // The restore effect intentionally invokes the stable function declaration below.
          // eslint-disable-next-line react-hooks/immutability
          return selectMystery(story, false);
        })
        .catch(() => sessionStorage.removeItem("factframe-last-story"));
    }
    const onBack = () => { if (!new URLSearchParams(window.location.search).has("story")) { setTopic(null); setSelectedStory(null); setVisuals([]); setError(""); setStage("idle"); } };
    window.addEventListener("popstate", onBack); return () => window.removeEventListener("popstate", onBack);
    // Restore is intentionally a one-time navigation bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const estimatedSeconds = useMemo(() => topic ? (topic.mystery?.durationTarget ?? Math.max(20, Math.min(35, Math.round(topic.narration.split(/\s+/).length / 2)))) : 0, [topic]);
  const durationOptions = useMemo(() => [...new Set([...(selectedStory?.supportedDurationSeconds ? [selectedStory.supportedDurationSeconds as StoryDuration] : []), 30, 60, 90] as StoryDuration[])].sort((a, b) => a - b), [selectedStory]);
  const previewVisual = visuals.find((visual) => Boolean(visual.thumbUrl)) ?? visuals[0];
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";

  function sessionHeaders() {
    let id = sessionStorage.getItem("factframe-session");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("factframe-session", id); }
    return { "Content-Type": "application/json", "X-FactFrame-Session": id };
  }

  function clearRenderedOutput() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(""); setExportManifest(null); setVoiceProvider(null); setFailedStage(null);
  }

  function updateWatermark(patch: Partial<WatermarkConfig>) {
    const next = { ...watermark, ...patch };
    if (typeof patch.text === "string") next.text = patch.text.replace(/[\r\n]+/g, " ").slice(0, 40);
    setWatermark(next); localStorage.setItem("factframe-watermark", JSON.stringify(next));
  }

  async function fetchStoryVisuals(story: StoryRecord | null, script: MysteryScript, sourceTopic?: Topic) {
    const startedAt = monotonicNowMs();
    if (story && !mysteryCatalog.some((item) => item.id === story.id)) {
      const data = await readJson<{ plan: VisualPlan; researchPackageHash: string; visualPlanHash: string }>(await fetch("/api/visual-plan", { method: "POST", headers: sessionHeaders(), body: JSON.stringify({ storyCandidateId: story.id, durationSeconds: script.durationTarget }) }));
      const byId = new Map(data.plan.assets.map((asset) => [asset.id, asset]));
      const visuals = data.plan.segments.flatMap((segment): Visual[] => { const asset = byId.get(segment.assetIds[0]); if (!asset || asset.usageStatus === "RESTRICTED_REFERENCE") return [];
        return [{ id: asset.id, title: asset.title, url: asset.url, thumbUrl: asset.thumbnailUrl, width: Number(asset.metadata.width ?? 720), height: Number(asset.metadata.height ?? 1280),
          creator: asset.creator, license: asset.license, licenseUrl: asset.licenseUrl, sourceUrl: asset.originalUrl, description: asset.description,
          source: asset.provider === "FACTFRAME" ? "FactFrame" : "Wikimedia Commons", mediaType: asset.provider === "FACTFRAME" ? "programmatic" : asset.assetType === "ARCHIVAL_VIDEO" ? "video" : "image",
          visualKind: asset.assetType === "MAP" ? "MAP" : asset.assetType === "TIMELINE" ? "TIMELINE" : asset.assetType === "DOCUMENT" ? "DOCUMENT" : asset.assetType === "FACT_CARD" ? "FACT_CARD" : asset.assetType === "NEWSPAPER_CLIP" ? "NEWSPAPER" : asset.assetType === "ARCHIVAL_VIDEO" ? "VIDEO" : "PHOTO",
          visualIntent: segment.visualIntent, segmentIndex: segment.segmentIndex, relevanceScore: asset.relevanceScore, metadata: { ...asset.metadata, representationType: asset.representationType, usageStatus: asset.usageStatus } }]; });
      const kinds = [...new Set(visuals.map((item) => item.visualKind ?? "PHOTO"))]; setRenderHashes({ researchPackageHash: data.researchPackageHash, visualPlanHash: data.visualPlanHash });
      timingsRef.current.visualPlanLoadMs = Math.round(monotonicNowMs() - startedAt);
      return { visuals, quality: { repetitionScore: new Set(visuals.map((item) => item.id)).size / Math.max(1, visuals.length), relevanceScore: visuals.reduce((sum, item) => sum + (item.relevanceScore ?? 0), 0) / Math.max(1, visuals.length), visualTypeDiversity: kinds.length, visualKinds: kinds } };
    }
    const response = await fetch("/api/media", { method: "POST", headers: sessionHeaders(), body: JSON.stringify(story ? { storyId: story.id, script } : { topic: sourceTopic, script }) });
    const result = await readJson<{ visuals: Visual[]; quality: VisualQualityReport }>(response); timingsRef.current.visualPlanLoadMs = Math.round(monotonicNowMs() - startedAt); return result;
  }

  async function searchTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setError(""); setStage("searching"); setTopic(null); setVisuals([]);
    try {
      if (mode === "MYSTERY") {
        const normalized = query.toLocaleLowerCase("ms-MY").replace(/[^a-z0-9]+/g, " ").trim();
        const localStory = mysteryCatalog.find((story) => `${story.title} ${story.summary}`.toLocaleLowerCase("ms-MY").replace(/[^a-z0-9]+/g, " ").includes(normalized));
        if (localStory) { await selectMystery(localStory); return; }
      }
      const data = await readJson<{ results: SearchResult[] }>(await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`));
      if (!data.results.length) throw new Error("Kami tidak menemui maklumat sahih yang mencukupi untuk topik ini.");
      setResults(data.results);
      setStage("choosing");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Carian gagal."); setStage("idle"); }
  }

  async function selectEntity(result: SearchResult) {
    if (!canGenerateStory(result)) { setError("Bahan untuk cerita ini masih disemak. Pilih cerita bertanda ‘Boleh dijana’. "); return; }
    setError(""); setProgress({ message: "Menyediakan fakta", percent: 12 }); setStage("generating");
    try {
      if (!/^Q\d+$/.test(result.id)) {
        const researchStartedAt = monotonicNowMs();
        const research = await readJson<{ story: StoryRecord }>(await fetch(`/api/research?id=${encodeURIComponent(result.id)}`));
        timingsRef.current.researchLoadMs = Math.round(monotonicNowMs() - researchStartedAt);
        await selectMystery(research.story); return;
      }
      const topicData = await readJson<{ topic: Topic }>(await fetch(`/api/topic?id=${result.id}&label=${encodeURIComponent(result.label)}`));
      if (mode === "MYSTERY") {
        const script = buildAutoMysteryScript(topicData.topic, duration, tone, showSourceNote);
        const mediaData = await fetchStoryVisuals(null, script, topicData.topic);
        setSelectedStory(null); setBaseTopic(topicData.topic); setSelectedAngle(null); setTopic(autoMysteryScriptToTopic(topicData.topic, script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); setAiEnhanced(false); setStage("preview");
        return;
      }
      const angles = generateStoryAngles(topicData.topic);
      setBaseTopic(topicData.topic); setStoryAngles(angles); setSelectedAngle(null); setTopic(null); setVisuals([]); setStage("angles");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Penyediaan topik gagal."); setStage("choosing"); }
  }

  async function chooseStoryAngle(angle: StoryAngle) {
    if (!baseTopic) return;
    setError(""); setSelectedAngle(angle); setStage("generating"); setProgress({ message: "Membina jalan cerita bersumber", percent: 34 });
    try {
      const script = buildExplainerScript(baseTopic, angle, duration, tone, showSourceNote);
      const mediaData = await fetchStoryVisuals(null, script, baseTopic);
      setTopic(explainerScriptToTopic(baseTopic, angle, script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); setAiEnhanced(false); setStage("preview");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Cerita tidak dapat disediakan."); setStage("angles"); }
  }

  async function loadDiscovery(category: string, page = 0) {
    setDiscoveryLoading(true); setError("");
    try {
      const data = await readJson<{ results: SearchResult[]; hasMore: boolean; total: number | null }>(await fetch(`/api/discover?category=${encodeURIComponent(category)}&page=${page}`));
      setDiscoveryItems((current) => page === 0 ? data.results : [...new Map([...current, ...data.results].map((item) => [item.id, item])).values()]);
      setDiscoveryCategory(category); setDiscoveryPage(page); setDiscoveryHasMore(data.hasMore); setDiscoveryTotal(data.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Katalog gagal dimuatkan."); }
    finally { setDiscoveryLoading(false); }
  }

  async function loadMysteryCandidates(page = 0, malaysia = false) {
    setMysteryLoading(true); setError("");
    try {
      const category = malaysia ? "malaysia_mysteries" : "mysteries";
      const data = await readJson<{ results: SearchResult[]; hasMore: boolean; total: number | null }>(await fetch(`/api/discover?category=${category}&page=${page}`));
      setMysteryCandidates((current) => page === 0 ? data.results : [...new Map([...current, ...data.results].map((item) => [item.id, item])).values()]);
      setMysteryPage(page); setMysteryHasMore(data.hasMore); setMysteryTotal(data.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Calon misteri gagal dimuatkan."); }
    finally { setMysteryLoading(false); }
  }

  function randomStory() {
    const ready = discoveryItems.filter(canGenerateStory); const next = randomCatalogStory(ready);
    if (next) void selectEntity(next); else setError("Belum ada cerita sedia dijana dalam kategori ini. Cuba bahagian Misteri & Teori.");
  }

  async function selectMystery(story: StoryRecord, updateHistory = true) {
    clearRenderedOutput(); setError(""); setSelectedStory(story); setProgress({ message: "Semak cerita", percent: 18 }); setStage("generating");
    try {
      const effectiveDuration = effectiveStoryDuration(story, duration); setDuration(effectiveDuration);
      setDurationNotice(story.supportedDurationSeconds ? `Cadangan: ${story.supportedDurationSeconds} saat berdasarkan bahan bersumber yang tersedia.` : "");
      const script = buildMysteryScript(story, effectiveDuration, tone, showSourceNote); setAiEnhanced(Boolean(story.aiNarration));
      if (!passesQualityGate(script)) throw new Error("Cerita ini belum melepasi semakan sumber dan penceritaan.");
      setProgress({ message: "Cari visual", percent: 58 });
      const mediaData = await fetchStoryVisuals(story, script);
      if (!mediaData.visuals.length) throw new Error("Sumber ditemui, tetapi visual berlesen yang relevan tidak mencukupi.");
      setTopic(mysteryScriptToTopic(story, script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); sessionStorage.setItem("factframe-last-story", story.id); if (updateHistory) history.pushState({ storyId: story.id }, "", `?story=${encodeURIComponent(story.id)}`); setStage("preview");
    } catch (caught) { setFailedStage("visual"); setError(friendlyGenerationError("visual", caught)); setStage("idle"); }
  }

  async function updateMystery(nextDuration: StoryDuration, nextTone: StoryTone, nextSourceNote: boolean) {
    clearRenderedOutput();
    setTone(nextTone); setShowSourceNote(nextSourceNote);
    if (selectedStory) {
      const effectiveDuration = effectiveStoryDuration(selectedStory, nextDuration); setDuration(effectiveDuration);
      setDurationNotice(nextDuration > effectiveDuration
        ? `Bahan yang sah untuk cerita ini paling sesuai sekitar ${effectiveDuration} saat. Kami pendekkan supaya cerita tidak dipanjangkan dengan fakta berulang.`
        : `Cadangan: ${selectedStory.supportedDurationSeconds ?? effectiveDuration} saat berdasarkan bahan bersumber yang tersedia.`);
      const script = buildMysteryScript(selectedStory, effectiveDuration, nextTone, nextSourceNote);
      setTopic(mysteryScriptToTopic(selectedStory, script)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(selectedStory, script); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    } else if (baseTopic && selectedAngle) {
      setDuration(nextDuration);
      const explainer = buildExplainerScript(baseTopic, selectedAngle, nextDuration, nextTone, nextSourceNote);
      setTopic(explainerScriptToTopic(baseTopic, selectedAngle, explainer)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(null, explainer, baseTopic); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    } else if (baseTopic && mode === "MYSTERY") {
      setDuration(nextDuration);
      const script = buildAutoMysteryScript(baseTopic, nextDuration, nextTone, nextSourceNote);
      setTopic(autoMysteryScriptToTopic(baseTopic, script)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(null, script, baseTopic); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    }
  }

  async function rewriteWithGemini() {
    if (!selectedStory || !geminiConfigured) return;
    clearRenderedOutput(); setError(""); setStage("generating"); setProgress({ message: "Semak cerita", percent: 35 });
    try {
      const response = await fetch("/api/gemini/script", { method: "POST", headers: sessionHeaders(), body: JSON.stringify({ storyId: selectedStory.id, duration, tone, showSourceNote }) });
      const data = await readJson<{ script: NonNullable<Topic["mystery"]> }>(response);
      const mediaData = await fetchStoryVisuals(selectedStory, data.script);
      setTopic(mysteryScriptToTopic(selectedStory, data.script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); setAiEnhanced(true); setStage("preview");
    } catch { setError("Cerita asal masih boleh digunakan. Versi yang diperkemas belum tersedia."); setStage("preview"); }
  }

  function randomMystery() {
    const eligible = mysteryCatalog.filter((story) => story.researchScore >= .9 && story.visualScore >= .8 && story.sourceCoveragePotential === "good");
    const next = randomCatalogStory(eligible);
    if (next) void selectMystery(next);
  }

  function selectVoice(id: VoicePresetId) {
    clearRenderedOutput(); setVoicePresetId(id); localStorage.setItem("factframe-voice-preset", id); setTtsFailed(false);
  }

  async function previewVoice(id: VoicePresetId) {
    if (!geminiConfigured || previewingVoice) return;
    setError(""); setPreviewingVoice(id);
    try {
      const result = await previewNarrator(id, tone);
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
      const url = URL.createObjectURL(result.audioBlob); setPreviewAudioUrl(url);
      await new Audio(url).play();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Pratonton suara gagal."); }
    finally { setPreviewingVoice(null); }
  }

  async function generate() {
    if (!topic || !visuals.length) return;
    const generationStartedAt = performance.now(); let activeStage: "voice" | "render" = "voice";
      setError(""); setFailedStage(null); setTtsFailed(false); setStage("generating"); setProgress({ message: "Sediakan suara", percent: 2 });
    try {
      const ttsStartedAt = performance.now();
      const narration = await adaptiveTtsProvider.generateSpeech(topic.narration, "ms-MY", (_message, percent = 0) => setProgress({ message: "Sediakan suara", percent: Math.min(28, percent * .28) }), { tone: topic.mystery?.tone, voicePresetId, targetDurationSeconds: topic.mystery?.durationTarget });
      const ttsMs = Math.round(performance.now() - ttsStartedAt); activeStage = "render"; setProgress({ message: "Susun video", percent: 29 });
      setVoiceProvider(narration.provider);
      const auditResolution = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("render") === "1080" ? "1080x1920" as const : "720x1280" as const;
      const video = await renderVideo(topic, visuals, narration.audioBlob, (_message, percent) => setProgress({ message: percent >= 94 ? "Siapkan video" : "Susun video", percent: 28 + percent * .72 }), watermark,
        { storyCandidateId: selectedStory?.id ?? topic.id, ...renderHashes, narrationHash: narration.narrationHash, ttsProvider: narration.provider, voicePreset: narration.voicePresetId, resolution: auditResolution, timings: { ...timingsRef.current, ttsMs, totalGenerationMs: Math.round(performance.now() - generationStartedAt) } });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(video.blob)); setExportManifest(video.manifest); setExportExtension(video.extension);
      localStorage.setItem(`factframe-audio:${narration.narrationHash}:${narration.voicePresetId}`, JSON.stringify({ duration: narration.durationSeconds, provider: narration.provider, voicePreset: narration.voicePresetId, generatedAt: narration.generatedAt, narrationHash: narration.narrationHash, mimeType: narration.mimeType, estimatedNarrationSeconds: narration.estimatedNarrationSeconds, actualNarrationSeconds: narration.durationSeconds }));
      localStorage.setItem(`factframe-render:${video.manifest.storyCandidateId}`, JSON.stringify(video.manifest)); setStage("done");
    } catch (caught) { setTtsFailed(activeStage === "voice"); setFailedStage(activeStage); setError(friendlyGenerationError(activeStage, caught)); setStage("preview"); }
  }

  function reset() {
    setQuery(""); setResults([]); setTopic(null); setBaseTopic(null); setStoryAngles([]); setSelectedAngle(null); setSelectedStory(null); setVisuals([]); setVisualQuality(null); setError(""); setDurationNotice(""); setAiEnhanced(false); setTtsFailed(false); setFailedStage(null); setVoiceProvider(null); setStage("idle"); sessionStorage.removeItem("factframe-last-story"); history.replaceState({}, "", window.location.pathname);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(""); }
  }

  return (
    <main>
      <nav className="nav shell">
        <button className="brand" onClick={reset} aria-label="Laman utama FactFrame"><span className="brandMark"><Film size={18} /></span><span>FACTFRAME</span></button>
        <div className="navMeta"><span><ShieldCheck size={15} /> Data sumber terbuka</span><span className="localPill">Berjalan pada peranti anda</span></div>
      </nav>

      <div className="modeBar shell" role="tablist" aria-label="Mod kandungan">
        <button role="tab" aria-selected={mode === "MYSTERY"} className={mode === "MYSTERY" ? "active" : ""} onClick={() => { reset(); setMode("MYSTERY"); }}><BookOpen size={15} /> Misteri &amp; Teori</button>
        <button role="tab" aria-selected={mode === "STORY"} className={mode === "STORY" ? "active" : ""} onClick={() => { reset(); setMode("STORY"); }}><Sparkles size={15} /> Cerita &amp; Penerangan</button>
      </div>

      <section className={`hero shell ${topic ? "heroCompact" : ""}`}>
        <div className="eyebrow">{mode === "MYSTERY" ? <><BookOpen size={14} /> Misteri &amp; legenda bersumber</> : <><Sparkles size={14} /> Kilang dokumentari pendek</>}</div>
        <h1>{mode === "MYSTERY" ? <>Misteri sebenar.<br /><em>Sumber yang boleh diperiksa.</em></> : <>Pilih sebuah cerita.<br /><em>Kami uruskan selebihnya.</em></>}</h1>
        <p className="heroCopy">{mode === "MYSTERY" ? "Pilih misteri atau legenda. Fakta, dakwaan dan perkara yang tidak dapat disahkan kekal dibezakan." : "Temui topik, pilih sudut, dan hasilkan video menegak bersumber—tanpa penyelidikan manual atau kemahiran menyunting."}</p>
        {mode === "MYSTERY" && stage === "idle" && <button className="randomButton" onClick={randomMystery}><Dice5 size={19} /> Pilihkan misteri <span>Boleh dijana</span></button>}
        {mode === "STORY" && stage === "idle" && <button className="randomButton" onClick={randomStory}><Dice5 size={19} /> Beri saya satu cerita <span>Boleh dijana</span></button>}
        <form className="searchForm" onSubmit={searchTopic}>
          <Search size={21} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "MYSTERY" ? "Cari misteri, legenda atau peristiwa pelik" : "Cari tokoh, tempat, syarikat, sains atau sejarah"} aria-label="Cari apa-apa topik" disabled={stage === "searching" || stage === "generating"} />
          {query && <button type="button" className="clear" onClick={() => setQuery("")} aria-label="Kosongkan"><X size={16} /></button>}
          <button className="searchButton" disabled={!query.trim() || stage === "searching" || stage === "generating"}>{stage === "searching" ? <LoaderCircle className="spin" size={18} /> : <>Cari <ArrowRight size={17} /></>}</button>
        </form>
        <div className="tryRow"><span>{mode === "MYSTERY" ? "Atau cari sendiri:" : "Popular:"}</span>{(mode === "MYSTERY" ? ["Villa Nabila", "Highland Towers", "MH370", "Mona Fandey"] : ["Anwar Ibrahim", "P. Ramlee", "Michelle Yeoh", "Nikola Tesla"]).map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
        {error && <div className="errorBox">{error}</div>}
      </section>

      {mode === "STORY" && stage === "idle" && <section className="discovery shell reveal">
        <div className="sectionHeading"><div><span className="step">TEROKAI</span><h2>Apa yang anda mahu hasilkan?</h2></div><p>Hanya cerita dengan bahan yang mencukupi boleh dijana sekarang.</p></div>
        <div className="discoveryGrid">{DISCOVERY_CATEGORIES.map(([icon, label, category]) => <button className={discoveryCategory === category ? "active" : ""} key={label} onClick={() => void loadDiscovery(category)} disabled={discoveryLoading}><span>{icon}</span><strong>{label}</strong><ArrowRight size={15} /></button>)}</div>
        <div className="discoveryCatalogHead"><div><strong>{DISCOVERY_CATEGORIES.find((item) => item[2] === discoveryCategory)?.[1]}</strong><span>{discoveryTotal ? `${discoveryTotal} cerita sedia dijana` : "Belum ada cerita sedia dijana dalam pilihan ini"}</span></div>{discoveryLoading && <LoaderCircle className="spin" size={20} />}</div>
        <div className="resultsGrid discoveryResults">{discoveryItems.map((result) => <button className="resultCard" key={result.id} onClick={() => void selectEntity(result)} disabled={!canGenerateStory(result)}><span className={`readiness ${result.status === "READY" ? "ready" : "review"}`}>{userReadinessLabel(result.status)}</span><strong>{result.label}</strong><p>{result.description}</p><div className="cardMeta"><span>{result.category ?? "Cerita"}</span><span>{supportedDurationLabel(result.supportedDurationSeconds)}</span><span>{result.timeContext === "SEMASA" ? "Semasa" : "Sejarah"}</span></div>{canGenerateStory(result) && <span className="selectArrow"><ArrowRight size={18} /></span>}</button>)}</div>
        {!discoveryItems.length && !discoveryLoading && <div className="emptyState"><strong>Belum ada cerita sedia dijana di sini.</strong><p>Lagi banyak cerita sedang disemak. Cuba kategori lain.</p></div>}
        {discoveryHasMore && <button className="loadMore" onClick={() => void loadDiscovery(discoveryCategory, discoveryPage + 1)} disabled={discoveryLoading}>{discoveryLoading ? <LoaderCircle className="spin" size={18} /> : <ChevronDown size={18} />} Lihat lagi</button>}
      </section>}

      {mode === "MYSTERY" && stage === "idle" && <section className="catalog shell reveal">
        <div className="sectionHeading"><div><span className="step">SEDIA DIJANA</span><h2>Pilih cerita</h2></div><p>Cerita dipilih berdasarkan kekuatan sumber, kejelasan kes dan visual yang tersedia.</p></div>
        <div className="filterRow">{["Semua", "Malaysia / Malaya", "Kehilangan", "Misteri sejarah", "Teori konspirasi"].map((filter) => <button className={catalogFilter === filter ? "active" : ""} key={filter} onClick={() => setCatalogFilter(filter)}>{filter}</button>)}</div>
        <div className="mysteryGrid">{mysteryCatalog.filter((story) => catalogFilter === "Semua" || (catalogFilter === "Malaysia / Malaya" ? ["Malaysia", "Malaya"].includes(story.country) : categoryLabels[story.category] === catalogFilter)).map((story) => <article className="mysteryCard" key={story.id}>
          <div className="mysteryMeta"><span>{story.country}</span><span>{story.decade}</span></div><h3>{story.title}</h3><p>{story.summary}</p>
          <div className="storyTags"><span>{categoryLabels[story.category]}</span><span>{caseStatusLabels[story.caseStatus]}</span><span>{story.year > 2000 ? "Semasa" : "Sejarah"}</span></div>
          <div className="cardMeta"><span>Boleh dijana</span><span>{supportedDurationLabel(story.supportedDurationSeconds ?? 30)}</span></div>
          <button onClick={() => void selectMystery(story)}>Pilih cerita <ArrowRight size={16} /></button>
        </article>)}</div>
        <div className="discoveryCatalogHead"><div><strong>Cerita arkib yang sudah disemak</strong><span>{mysteryTotal ? `${mysteryTotal} cerita sedia dijana sekarang` : "Lagi banyak cerita sedang disemak"}</span></div><button className="miniAction" onClick={() => void loadMysteryCandidates(0, true)}>Fokus Malaysia</button></div>
        <div className="resultsGrid discoveryResults">{mysteryCandidates.map((result) => <button className="resultCard" key={result.id} onClick={() => void selectEntity(result)} disabled={!canGenerateStory(result)}><span className={`readiness ${result.status === "READY" ? "ready" : "review"}`}>{userReadinessLabel(result.status)}</span><strong>{result.label}</strong><p>{result.description}</p><div className="cardMeta"><span>{result.category ?? "Misteri"}</span><span>{supportedDurationLabel(result.supportedDurationSeconds)}</span><span>{result.timeContext === "SEMASA" ? "Semasa" : "Sejarah"}</span></div>{canGenerateStory(result) && <span className="selectArrow"><ArrowRight size={18} /></span>}</button>)}</div>
        {!mysteryCandidates.length && !mysteryLoading && <div className="emptyState"><strong>Belum ada cerita arkib yang boleh dijana.</strong><p>Lagi banyak sedang disemak.</p></div>}
        {mysteryHasMore && <button className="loadMore" onClick={() => void loadMysteryCandidates(mysteryPage + 1)} disabled={mysteryLoading}>{mysteryLoading ? <LoaderCircle className="spin" size={18} /> : <ChevronDown size={18} />} Lihat lagi</button>}
      </section>}

      {stage === "choosing" && <section className="panel shell reveal">
        <div className="sectionHeading"><div><span className="step">01</span><h2>Pilih topik yang tepat</h2></div><p>Kami menemui beberapa padanan. Pilih satu supaya fakta yang digunakan kekal tepat.</p></div>
        <div className="resultsGrid">{results.map((result) => <button className="resultCard" key={result.id} onClick={() => selectEntity(result)} disabled={!canGenerateStory(result)}>
          <span className={`readiness ${result.status === "READY" ? "ready" : "review"}`}>{userReadinessLabel(result.status)}</span><strong>{result.label}</strong><p>{result.description}</p><div className="cardMeta"><span>{supportedDurationLabel(result.supportedDurationSeconds)}</span></div>{canGenerateStory(result) && <span className="selectArrow"><ArrowRight size={18} /></span>}
        </button>)}</div>
      </section>}

      {stage === "angles" && baseTopic && <section className="panel shell reveal">
        <div className="sectionHeading"><div><span className="step">02</span><h2>Pilih sudut cerita</h2></div><p>Satu topik boleh menghasilkan banyak video. Semua sudut di bawah dibina daripada bahan sumber yang sama.</p></div>
        <div className="currentness"><ShieldCheck size={16} /><span>{baseTopic.currentAware ? "Semakan sumber semasa aktif" : "Latar sejarah disemak"}</span><small>Terakhir disahkan: {baseTopic.lastVerifiedAt ?? "hari ini"}</small></div>
        <div className="angleGrid">{storyAngles.map((angle) => <button key={angle.id} onClick={() => void chooseStoryAngle(angle)}><span>{angle.type.replaceAll("_", " ")}</span><strong>{angle.title}</strong><p>{angle.summary}</p><ArrowRight size={17} /></button>)}</div>
      </section>}

      {topic && (stage === "preview" || stage === "done") && <section className="workspace shell reveal">
        <div className="previewColumn">
          <div className="sectionHeading"><div><span className="step">02</span><h2>Filem cerita anda</h2></div><p>Semuanya sudah disediakan. Semak jalan cerita, kemudian biarkan peranti anda menghasilkan video.</p></div>
          <div className="phoneStage">
            <div className="phoneFrame">
              {stage === "done" && videoUrl ? <video src={videoUrl} controls playsInline /> : <>
                {previewVisual?.thumbUrl ? <Image src={previewVisual.thumbUrl} alt={topic.name} fill sizes="360px" unoptimized /> : <div className="programmaticPreview" />}
                <div className="phoneShade" />
                <span className="videoBadge">{mode === "MYSTERY" ? "MISTERI BERSUMBER" : "CERITA BERSUMBER"}</span>
                <div className="phoneTitle"><h3>{topic.name}</h3><p>{topic.description}</p></div>
                <button className="playButton" onClick={generate} aria-label="Hasilkan dan pratonton video"><Play fill="currentColor" size={23} /></button>
                <div className="captionMock">{topic.narration.split(/(?<=[.!?])\s+/)[0]}</div>
                {watermark.enabled && watermark.text && <span className={`watermarkPreview ${watermark.position} ${watermark.size}`} style={{ opacity: watermark.opacity }}>{watermark.text}</span>}
              </>}
            </div>
            <div className="formatLabel"><span>9:16</span><span>{exportManifest?.resolution.replace("x", " × ") ?? "720 × 1280"}</span><span>~{exportManifest?.videoDuration.toFixed(1) ?? estimatedSeconds} saat</span></div>
          </div>
        </div>

        <aside className="storyPanel">
          {topic.mystery && <div className="storyControls">
            <div className={`aiStatus ${geminiConfigured ? "ready" : "local"}`}><span>CERITA SUDAH DISEMAK</span><small>{geminiConfigured ? "Suara narator tersedia" : "Suara asas akan digunakan"}</small></div>
            <div><label><Clock3 size={14} /> Tempoh</label><div className="segmented">{durationOptions.map((value) => <button className={duration === value ? "active" : ""} key={value} onClick={() => void updateMystery(value, tone, showSourceNote)}>{value}s</button>)}</div>{durationNotice && <p className="safeAreaNote">{durationNotice}</p>}</div>
            <div><label><Film size={14} /> Nada</label><div className="segmented"><button className={tone === "DOCUMENTARY" ? "active" : ""} onClick={() => void updateMystery(duration, "DOCUMENTARY", showSourceNote)}>Dokumentari</button><button className={tone === "SUSPENSEFUL" ? "active" : ""} onClick={() => void updateMystery(duration, "SUSPENSEFUL", showSourceNote)}>Suspens</button></div></div>
            <label className="sourceToggle"><input type="checkbox" checked={showSourceNote} onChange={(event) => void updateMystery(duration, tone, event.target.checked)} /> Nota sumber di akhir</label>
            {geminiConfigured && selectedStory && <button className="rewriteButton" onClick={() => void rewriteWithGemini()}><Sparkles size={14} /> {aiEnhanced ? "Perkemas semula skrip" : "Perkemas skrip"}</button>}
          </div>}
          {topic.mystery && <section className="voiceSelector" aria-labelledby="voice-selector-title">
            <div className="voiceHeading"><div><Volume2 size={15} /><strong id="voice-selector-title">Suara narator</strong></div><span>{geminiConfigured ? "Sedia" : "Suara asas"}</span></div>
            <div className="voiceGrid">{VOICE_PRESETS.map((preset) => <label className={`voiceCard ${voicePresetId === preset.id ? "selected" : ""}`} key={preset.id}>
              <input type="radio" name="voice-preset" value={preset.id} checked={voicePresetId === preset.id} onChange={() => selectVoice(preset.id)} />
              <span className="radioMark" /><span className="voiceCopy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
              <button type="button" disabled={!geminiConfigured || previewingVoice !== null} onClick={(event) => { event.preventDefault(); void previewVoice(preset.id); }}><Play size={11} fill="currentColor" />{previewingVoice === preset.id ? "Menjana…" : "Pratonton"}</button>
            </label>)}</div>
          </section>}
          {topic.mystery && <section className="watermarkControl" aria-labelledby="watermark-title">
            <div className="watermarkHeading"><strong id="watermark-title">Tera air</strong><label><input type="checkbox" checked={watermark.enabled} onChange={(event) => updateWatermark({ enabled: event.target.checked })} /> Tambah tera air</label></div>
            {watermark.enabled && <div className="watermarkFields">
              <label className="watermarkText">Teks<input value={watermark.text} maxLength={40} placeholder="@namapage" onChange={(event) => updateWatermark({ text: event.target.value })} /><small>{watermark.text.length}/40</small></label>
              <fieldset><legend>Kedudukan</legend><div className="positionGrid">{WATERMARK_POSITIONS.map((position) => <label className={watermark.position === position.value ? "selected" : ""} key={position.value}><input type="radio" name="watermark-position" checked={watermark.position === position.value} onChange={() => updateWatermark({ position: position.value })} /><span>{position.label}</span></label>)}</div></fieldset>
              <div className="watermarkOptions"><label>Kelegapan<select value={watermark.opacity} onChange={(event) => updateWatermark({ opacity: Number(event.target.value) })}><option value={.5}>50%</option><option value={.75}>75%</option><option value={1}>100%</option></select></label><label>Saiz<select value={watermark.size} onChange={(event) => updateWatermark({ size: event.target.value as WatermarkConfig["size"] })}><option value="SMALL">Kecil</option><option value="MEDIUM">Sederhana</option><option value="LARGE">Besar</option></select></label></div>
              {watermark.position === "BOTTOM_CENTER" && <p className="safeAreaNote">Tera air akan dinaikkan secara automatik supaya tidak bertindih dengan sari kata.</p>}
            </div>}
          </section>}
          <div className="topicHeader"><div><span className="typeTag">{{ person: "tokoh", place: "tempat", event: "peristiwa", object: "objek", organisation: "organisasi", animal: "haiwan", space: "angkasa", general: "umum" }[topic.entityType]}</span><h2>{topic.name}</h2><p>{topic.description}</p></div><span className="factCount">{topic.facts.length} fakta</span></div>
          <div className="factList">{topic.facts.map((fact, index) => <div className="fact" key={`${fact.label}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{({ VERIFIED: "Fakta disahkan", REPORTED: "Laporan", THEORY: "Teori", DISPUTED: "Dipertikaikan", UNRESOLVED: "Belum terjawab", FOLKLORE: "Cerita rakyat", "EXPLAINED LATER": "Dijelaskan kemudian" } as Record<string, string>)[fact.label] ?? fact.label}</strong><p>{fact.sentence}</p></div><Check size={16} /></div>)}</div>
          <div className="narration"><div className="cardLabel"><Volume2 size={16} /> Skrip narasi {aiEnhanced && <span className="aiBadge">Diperkemas</span>}</div><p>{topic.narration}</p><div>{topic.narration.split(/\s+/).length} patah perkataan · suara narator</div></div>
          {topic.mystery && <div className="qualityGate"><div><ShieldCheck size={16} /><strong>Boleh dijana</strong></div><span>Fakta dan sumber sudah disemak</span></div>}
          {stage === "done" ? <a className="generateButton downloadButton" href={videoUrl} download={`${topic.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-factframe${exportExtension}`}><Download size={19} /> Muat turun video {exportExtension.slice(1).toUpperCase()} <span>{exportManifest?.videoDuration.toFixed(1)} saat</span></a> : <button className="generateButton" onClick={generate}><Sparkles size={19} /> {failedStage ? "Cuba semula" : "Hasilkan video"} <span>~{estimatedSeconds} saat</span></button>}
          {stage === "done" && <button className="rewriteButton" onClick={generate}><Film size={14} /> Hasilkan semula video yang sama</button>}
          {stage === "done" && exportManifest && <div className="visualQuality"><strong>Video siap</strong><span>{exportExtension.slice(1).toUpperCase()}</span><span>{exportManifest.resolution} · {exportManifest.videoDuration.toFixed(1)} saat</span></div>}
          {stage === "done" && exportManifest && debugMode && <output hidden data-testid="performance-audit" data-manifest={JSON.stringify(exportManifest)} />}
          {stage === "done" && <div className="publishPack"><strong>Pakej untuk diterbitkan</strong><div><span>Tajuk</span><p>{topic.name}</p></div><div><span>Deskripsi</span><p>{mode === "MYSTERY" ? `${topic.description} Cerita ini membezakan fakta direkodkan daripada dakwaan atau perkara yang tidak dapat disahkan.` : `${topic.description} Dihasilkan daripada sumber awam yang boleh diperiksa.`}</p></div></div>}
          <p className="renderNote">Video disediakan pada peranti anda. Kali pertama mungkin mengambil masa lebih lama kerana suara dan visual perlu dimuatkan.</p>
          <details className="sources"><summary>Sumber &amp; kredit <ChevronDown size={17} /></summary>
              <div className="sourceBody">
                {topic.mystery?.sources.map((source) => <a href={safePublicUrl(source.url) ?? undefined} target="_blank" rel="noreferrer" key={source.id}><strong>{source.publisher}</strong><span>{source.title}</span></a>)}
                {!topic.mystery && <a href={`https://www.wikidata.org/wiki/${topic.id}`} target="_blank" rel="noreferrer"><strong>Fakta</strong><span>Wikidata · {topic.id}</span></a>}
              {topic.wikipediaUrl && <a href={safePublicUrl(topic.wikipediaUrl) ?? undefined} target="_blank" rel="noreferrer"><strong>Konteks</strong><span>Wikipedia</span></a>}
              {visuals.filter((visual) => visual.sourceUrl).map((visual, index) => <a href={safePublicUrl(visual.sourceUrl) ?? undefined} target="_blank" rel="noreferrer" key={`${visual.sourceUrl}-${index}`}><strong>Kredit visual</strong><span>{visual.title} · {visual.creator} · {visual.license.replace(/Public domain/i, "Domain awam")}</span></a>)}
            </div>
          </details>
        </aside>
      </section>}

      {stage === "generating" && <div className="renderOverlay" role="status">
        <div className="renderCard"><div className="renderOrb"><Film size={32} /></div><span className="step">VIDEO SEDANG DISEDIAKAN</span><h2>{progress.message}</h2><p>Biarkan tab ini terbuka sehingga video siap.</p><div className="progressTrack"><span style={{ width: `${Math.max(3, progress.percent)}%` }} /></div><strong>{Math.round(progress.percent)}%</strong></div>
      </div>}

      <footer className="shell"><span>FACTFRAME / V2</span><p>Cerita bersumber · Visual berlesen · Kredit dikekalkan</p><span>Video disediakan pada peranti anda</span></footer>
    </main>
  );
}
