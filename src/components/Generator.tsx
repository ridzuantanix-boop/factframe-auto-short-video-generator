"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Dice5, Download, Film, LoaderCircle, Play, Search, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { adaptiveTtsProvider, previewNarrator } from "@/lib/audio/ttsProvider";
import { DEFAULT_VOICE_PRESET_ID, VOICE_PRESETS, type VoicePresetId } from "@/lib/audio/voicePresets";
import { renderVideo } from "@/lib/video/renderer";
import { caseStatusLabels, categoryLabels, mysteryCatalog } from "@/lib/mystery/catalog";
import { buildMysteryScript, mysteryScriptToTopic, passesQualityGate } from "@/lib/mystery/storyEngine";
import { autoMysteryScriptToTopic, buildAutoMysteryScript } from "@/lib/mystery/autoEngine";
import { buildExplainerScript, explainerScriptToTopic, generateStoryAngles } from "@/lib/story/explainerEngine";
import type { ContentMode, MysteryScript, SearchResult, StoryAngle, StoryDuration, StoryRecord, StoryTone, Topic, Visual, VisualQualityReport, WatermarkConfig, WatermarkPosition } from "@/lib/types";

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

export function Generator() {
  const [mode, setMode] = useState<ContentMode>("STORY");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ message: "Menyediakan fakta", percent: 0 });
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(null);
  const [duration, setDuration] = useState<StoryDuration>(30);
  const [tone, setTone] = useState<StoryTone>("DOCUMENTARY");
  const [showSourceNote, setShowSourceNote] = useState(true);
  const [catalogFilter, setCatalogFilter] = useState("Semua");
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [voicePresetId, setVoicePresetId] = useState<VoicePresetId>(DEFAULT_VOICE_PRESET_ID);
  const [previewingVoice, setPreviewingVoice] = useState<VoicePresetId | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState("");
  const [ttsFailed, setTtsFailed] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<"gemini" | "local" | null>(null);
  const [visualQuality, setVisualQuality] = useState<VisualQualityReport | null>(null);
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

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
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
  const estimatedSeconds = useMemo(() => topic ? (topic.mystery?.durationTarget ?? Math.max(20, Math.min(35, Math.round(topic.narration.split(/\s+/).length / 2)))) : 0, [topic]);
  const previewVisual = visuals.find((visual) => Boolean(visual.thumbUrl)) ?? visuals[0];

  function updateWatermark(patch: Partial<WatermarkConfig>) {
    const next = { ...watermark, ...patch };
    if (typeof patch.text === "string") next.text = patch.text.replace(/[\r\n]+/g, " ").slice(0, 40);
    setWatermark(next); localStorage.setItem("factframe-watermark", JSON.stringify(next));
  }

  async function fetchStoryVisuals(story: StoryRecord | null, script: MysteryScript, sourceTopic?: Topic) {
    const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(story ? { storyId: story.id, script } : { topic: sourceTopic, script }) });
    return readJson<{ visuals: Visual[]; quality: VisualQualityReport }>(response);
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
    setError(""); setProgress({ message: "Menyediakan fakta", percent: 12 }); setStage("generating");
    try {
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

  async function discover(seed: string) {
    setError(""); setQuery(seed); setStage("searching");
    try {
      const data = await readJson<{ results: SearchResult[] }>(await fetch(`/api/search?q=${encodeURIComponent(seed)}`));
      if (!data.results.length) throw new Error("Tiada calon cerita ditemui buat masa ini.");
      setResults(data.results); setStage("choosing");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Discovery gagal."); setStage("idle"); }
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
    const seeds = ["Malaysia history", "tokoh Malaysia", "scientist", "invention", "world history", "technology", "city", "company"];
    void discover(seeds[Math.floor(Math.random() * seeds.length)]);
  }

  async function selectMystery(story: StoryRecord) {
    setError(""); setSelectedStory(story); setProgress({ message: "Menyusun dakwaan bersumber", percent: 18 }); setStage("generating");
    try {
      let script = buildMysteryScript(story, duration, tone, showSourceNote);
      if (geminiConfigured) {
        try {
          setProgress({ message: "Gemini sedang menulis semula cerita", percent: 30 });
          const response = await fetch("/api/gemini/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: story.id, duration, tone, showSourceNote }) });
          const data = await readJson<{ script: typeof script }>(response);
          script = data.script; setAiEnhanced(true);
        } catch { setAiEnhanced(false); setProgress({ message: "Menggunakan skrip bersumber tempatan", percent: 36 }); }
      } else setAiEnhanced(false);
      if (!passesQualityGate(script)) throw new Error("Cerita ini belum melepasi semakan sumber dan penceritaan.");
      setProgress({ message: "Mencari visual dokumentari", percent: 58 });
      const mediaData = await fetchStoryVisuals(story, script);
      if (!mediaData.visuals.length) throw new Error("Sumber ditemui, tetapi visual berlesen yang relevan tidak mencukupi.");
      setTopic(mysteryScriptToTopic(story, script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); setStage("preview");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Penyediaan cerita gagal."); setStage("idle"); }
  }

  async function updateMystery(nextDuration: StoryDuration, nextTone: StoryTone, nextSourceNote: boolean) {
    setDuration(nextDuration); setTone(nextTone); setShowSourceNote(nextSourceNote);
    if (selectedStory) {
      const script = buildMysteryScript(selectedStory, nextDuration, nextTone, nextSourceNote);
      setTopic(mysteryScriptToTopic(selectedStory, script)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(selectedStory, script); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    } else if (baseTopic && selectedAngle) {
      const explainer = buildExplainerScript(baseTopic, selectedAngle, nextDuration, nextTone, nextSourceNote);
      setTopic(explainerScriptToTopic(baseTopic, selectedAngle, explainer)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(null, explainer, baseTopic); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    } else if (baseTopic && mode === "MYSTERY") {
      const script = buildAutoMysteryScript(baseTopic, nextDuration, nextTone, nextSourceNote);
      setTopic(autoMysteryScriptToTopic(baseTopic, script)); setAiEnhanced(false);
      try { const mediaData = await fetchStoryVisuals(null, script, baseTopic); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); } catch { /* Visual lama kekal sebagai fallback selamat. */ }
    }
  }

  async function rewriteWithGemini() {
    if (!selectedStory || !geminiConfigured) return;
    setError(""); setStage("generating"); setProgress({ message: "Gemini sedang membina jalan cerita", percent: 35 });
    try {
      const response = await fetch("/api/gemini/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: selectedStory.id, duration, tone, showSourceNote }) });
      const data = await readJson<{ script: NonNullable<Topic["mystery"]> }>(response);
      const mediaData = await fetchStoryVisuals(selectedStory, data.script);
      setTopic(mysteryScriptToTopic(selectedStory, data.script)); setVisuals(mediaData.visuals); setVisualQuality(mediaData.quality); setAiEnhanced(true); setStage("preview");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gemini gagal menulis skrip."); setStage("preview"); }
  }

  function randomMystery() {
    const eligible = mysteryCatalog.filter((story) => story.researchScore >= .9 && story.visualScore >= .8 && story.sourceCoveragePotential === "good");
    const next = eligible[Math.floor(Math.random() * eligible.length)];
    if (next) void selectMystery(next);
  }

  function selectVoice(id: VoicePresetId) {
    setVoicePresetId(id); localStorage.setItem("factframe-voice-preset", id); setTtsFailed(false);
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
      setError(""); setTtsFailed(false); setStage("generating"); setProgress({ message: "Menyediakan suara narator", percent: 2 });
    try {
      const narration = await adaptiveTtsProvider.generateSpeech(topic.narration, "ms-MY", (message, percent = 0) => setProgress({ message, percent: Math.min(28, percent * .28) }), { tone: topic.mystery?.tone, voicePresetId, targetDurationSeconds: topic.mystery?.durationTarget });
      setVoiceProvider(narration.provider);
      const video = await renderVideo(topic, visuals, narration.audioBlob, (message, percent) => setProgress({ message, percent: 28 + percent * .72 }), watermark);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(video)); setStage("done");
    } catch (caught) { setTtsFailed(true); setError(caught instanceof Error ? caught.message : "Penjanaan suara gagal."); setStage("preview"); }
  }

  function reset() {
    setQuery(""); setResults([]); setTopic(null); setBaseTopic(null); setStoryAngles([]); setSelectedAngle(null); setSelectedStory(null); setVisuals([]); setVisualQuality(null); setError(""); setAiEnhanced(false); setTtsFailed(false); setVoiceProvider(null); setStage("idle");
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
        {mode === "MYSTERY" && stage === "idle" && <button className="randomButton" onClick={randomMystery}><Dice5 size={19} /> Jana misteri rawak <span>Hanya cerita skor tinggi</span></button>}
        {mode === "STORY" && stage === "idle" && <button className="randomButton" onClick={randomStory}><Dice5 size={19} /> Beri saya satu cerita <span>Calon bersumber</span></button>}
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
        <div className="sectionHeading"><div><span className="step">TEROKAI</span><h2>Apa yang anda mahu hasilkan?</h2></div><p>Calon persisten digunakan dahulu; carian sumber live mengisi ruang yang belum diindeks.</p></div>
        <div className="discoveryGrid">{DISCOVERY_CATEGORIES.map(([icon, label, category]) => <button className={discoveryCategory === category ? "active" : ""} key={label} onClick={() => void loadDiscovery(category)} disabled={discoveryLoading}><span>{icon}</span><strong>{label}</strong><ArrowRight size={15} /></button>)}</div>
        <div className="discoveryCatalogHead"><div><strong>{DISCOVERY_CATEGORIES.find((item) => item[2] === discoveryCategory)?.[1]}</strong><span>{discoveryItems.length} dimuatkan{discoveryTotal === null ? " daripada carian live" : ` · ${discoveryTotal} calon persisten`}</span></div>{discoveryLoading && <LoaderCircle className="spin" size={20} />}</div>
        <div className="resultsGrid discoveryResults">{discoveryItems.map((result) => <button className="resultCard" key={result.id} onClick={() => void selectEntity(result)}><span className="resultId">{result.id}</span><strong>{result.label}</strong><p>{result.description}</p><span className="selectArrow"><ArrowRight size={18} /></span></button>)}</div>
        {discoveryHasMore && <button className="loadMore" onClick={() => void loadDiscovery(discoveryCategory, discoveryPage + 1)} disabled={discoveryLoading}>{discoveryLoading ? <LoaderCircle className="spin" size={18} /> : <ChevronDown size={18} />} Muatkan sehingga 100 lagi</button>}
      </section>}

      {mode === "MYSTERY" && stage === "idle" && <section className="catalog shell reveal">
        <div className="sectionHeading"><div><span className="step">SEDIA DIJANA</span><h2>Pilih cerita</h2></div><p>Cerita dipilih berdasarkan kekuatan sumber, kejelasan kes dan visual yang tersedia.</p></div>
        <div className="filterRow">{["Semua", "Malaysia / Malaya", "Kehilangan", "Misteri sejarah", "Teori konspirasi"].map((filter) => <button className={catalogFilter === filter ? "active" : ""} key={filter} onClick={() => setCatalogFilter(filter)}>{filter}</button>)}</div>
        <div className="mysteryGrid">{mysteryCatalog.filter((story) => catalogFilter === "Semua" || (catalogFilter === "Malaysia / Malaya" ? ["Malaysia", "Malaya"].includes(story.country) : categoryLabels[story.category] === catalogFilter)).map((story) => <article className="mysteryCard" key={story.id}>
          <div className="mysteryMeta"><span>{story.country}</span><span>{story.decade}</span></div><h3>{story.title}</h3><p>{story.summary}</p>
          <div className="storyTags"><span>{categoryLabels[story.category]}</span><span>{caseStatusLabels[story.caseStatus]}</span></div>
          <div className="scoreLine"><span>Sumber {Math.round(story.researchScore * 100)}%</span><span>Visual {Math.round(story.visualScore * 100)}%</span></div>
          <button onClick={() => void selectMystery(story)}>Pilih cerita <ArrowRight size={16} /></button>
        </article>)}</div>
        <div className="discoveryCatalogHead"><div><strong>Calon penyiasatan automatik</strong><span>{mysteryCandidates.length} dimuatkan{mysteryTotal === null ? " daripada carian live" : ` · ${mysteryTotal} calon persisten`}</span></div><button className="miniAction" onClick={() => void loadMysteryCandidates(0, true)}>Fokus Malaysia</button></div>
        <div className="resultsGrid discoveryResults">{mysteryCandidates.map((result) => <button className="resultCard" key={result.id} onClick={() => void selectEntity(result)}><span className="resultId">DITEMUI · {result.id}</span><strong>{result.label}</strong><p>{result.description}</p><span className="selectArrow"><ArrowRight size={18} /></span></button>)}</div>
        {mysteryHasMore && <button className="loadMore" onClick={() => void loadMysteryCandidates(mysteryPage + 1)} disabled={mysteryLoading}>{mysteryLoading ? <LoaderCircle className="spin" size={18} /> : <ChevronDown size={18} />} Muatkan sehingga 100 lagi</button>}
      </section>}

      {stage === "choosing" && <section className="panel shell reveal">
        <div className="sectionHeading"><div><span className="step">01</span><h2>Pilih topik yang tepat</h2></div><p>Kami menemui beberapa padanan. Pilih satu supaya fakta yang digunakan kekal tepat.</p></div>
        <div className="resultsGrid">{results.map((result) => <button className="resultCard" key={result.id} onClick={() => selectEntity(result)}>
          <span className="resultId">{result.id}</span><strong>{result.label}</strong><p>{result.description}</p><span className="selectArrow"><ArrowRight size={18} /></span>
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
            <div className="formatLabel"><span>9:16</span><span>720 × 1280</span><span>~{estimatedSeconds} saat</span></div>
          </div>
        </div>

        <aside className="storyPanel">
          {topic.mystery && <div className="storyControls">
            <div className={`aiStatus ${geminiConfigured ? "ready" : "local"}`}><span>{mode === "STORY" ? "CERITA BERSUMBER" : geminiConfigured ? "GEMINI AKTIF" : "MOD TEMPATAN"}</span><small>{mode === "STORY" ? (geminiConfigured ? "Sumber semasa + suara Gemini" : "Sumber semasa + suara tempatan") : geminiConfigured ? "Skrip AI + suara manusia" : "Tambah GEMINI_API_KEY untuk suara premium"}</small></div>
            <div><label><Clock3 size={14} /> Tempoh</label><div className="segmented">{([30, 60, 90] as StoryDuration[]).map((value) => <button className={duration === value ? "active" : ""} key={value} onClick={() => void updateMystery(value, tone, showSourceNote)}>{value}s</button>)}</div></div>
            <div><label><Film size={14} /> Nada</label><div className="segmented"><button className={tone === "DOCUMENTARY" ? "active" : ""} onClick={() => void updateMystery(duration, "DOCUMENTARY", showSourceNote)}>Dokumentari</button><button className={tone === "SUSPENSEFUL" ? "active" : ""} onClick={() => void updateMystery(duration, "SUSPENSEFUL", showSourceNote)}>Suspens</button></div></div>
            <label className="sourceToggle"><input type="checkbox" checked={showSourceNote} onChange={(event) => void updateMystery(duration, tone, event.target.checked)} /> Nota sumber di akhir</label>
            {geminiConfigured && selectedStory && <button className="rewriteButton" onClick={() => void rewriteWithGemini()}><Sparkles size={14} /> {aiEnhanced ? "Tulis semula dengan Gemini" : "Tingkatkan skrip dengan Gemini"}</button>}
          </div>}
          {topic.mystery && <section className="voiceSelector" aria-labelledby="voice-selector-title">
            <div className="voiceHeading"><div><Volume2 size={15} /><strong id="voice-selector-title">Suara narator</strong></div><span>{geminiConfigured ? "Gemini TTS" : "Gemini diperlukan"}</span></div>
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
          <div className="narration"><div className="cardLabel"><Volume2 size={16} /> Skrip narasi {aiEnhanced && <span className="aiBadge">Gemini</span>}</div><p>{topic.narration}</p><div>{topic.narration.split(/\s+/).length} patah perkataan · {voiceProvider === "local" ? "Suara neural tempatan" : voiceProvider === "gemini" ? "Suara ekspresif Gemini" : geminiConfigured ? "Gemini dengan fallback tempatan" : "Suara neural tempatan"}</div></div>
          {topic.mystery && <div className="qualityGate"><div><ShieldCheck size={16} /><strong>Lulus semakan kualiti</strong></div><span>Liputan sumber {Math.round(topic.mystery.sourceCoverage * 100)}%</span><span>Skor penceritaan {topic.mystery.storytellingScore}/14</span><span>{topic.mystery.unsupportedClaims} dakwaan tanpa sumber</span></div>}
          {topic.mystery && visualQuality && <div className="visualQuality"><strong>Semakan visual</strong><span>Relevan {Math.round(visualQuality.relevanceScore * 100)}%</span><span>Tanpa ulang {Math.round(visualQuality.repetitionScore * 100)}%</span><span>{visualQuality.visualTypeDiversity} jenis visual</span></div>}
          {stage === "done" ? <a className="generateButton downloadButton" href={videoUrl} download={`${topic.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-factframe.mp4`}><Download size={19} /> Muat turun MP4</a> : <button className="generateButton" onClick={generate}><Sparkles size={19} /> {ttsFailed ? "Cuba semula suara" : "Hasilkan video"} <span>~{estimatedSeconds} saat</span></button>}
          {stage === "done" && <div className="publishPack"><strong>Pakej untuk diterbitkan</strong><div><span>Tajuk</span><p>{topic.name}</p></div><div><span>Deskripsi</span><p>{mode === "MYSTERY" ? `${topic.description} Cerita ini membezakan fakta direkodkan daripada dakwaan atau perkara yang tidak dapat disahkan.` : `${topic.description} Dihasilkan daripada sumber awam yang boleh diperiksa.`}</p></div></div>}
          <p className="renderNote">{voiceProvider === "local" ? "Gemini tidak tersedia, jadi suara neural tempatan digunakan. Video siap tetap mempunyai audio, sari kata dan format MP4." : geminiConfigured ? "Gemini digunakan apabila tersedia dan bertukar automatik kepada suara tempatan jika kuota habis; video kekal dirender pada peranti anda." : "Kali pertama akan memuat turun model suara neural ~114 MB. Selepas itu model dicache; video kekal dirender pada peranti anda."}</p>
          <details className="sources"><summary>Sumber &amp; penyelidikan <ChevronDown size={17} /></summary>
              <div className="sourceBody">
                {topic.mystery?.sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><strong>{index + 1}. {source.type}</strong><span>{source.title} · {source.publisher}</span></a>)}
                {!topic.mystery && <a href={`https://www.wikidata.org/wiki/${topic.id}`} target="_blank" rel="noreferrer"><strong>Fakta</strong><span>Wikidata · {topic.id}</span></a>}
              {topic.wikipediaUrl && <a href={topic.wikipediaUrl} target="_blank" rel="noreferrer"><strong>Konteks</strong><span>Wikipedia</span></a>}
              {visuals.filter((visual) => visual.sourceUrl).map((visual, index) => <a href={visual.sourceUrl} target="_blank" rel="noreferrer" key={`${visual.sourceUrl}-${index}`}><strong>{visual.mediaType === "video" ? "Video" : visual.mediaType === "programmatic" ? "Grafik" : "Imej"} {index + 1}</strong><span>{visual.title} · {visual.license.replace(/Public domain/i, "Domain awam")} · {visual.creator}</span></a>)}
            </div>
          </details>
        </aside>
      </section>}

      {stage === "generating" && <div className="renderOverlay" role="status">
        <div className="renderCard"><div className="renderOrb"><Film size={32} /></div><span className="step">MENGHASILKAN FILEM ANDA</span><h2>{progress.message}</h2><p>Biarkan tab ini terbuka sementara peranti anda bekerja.</p><div className="progressTrack"><span style={{ width: `${Math.max(3, progress.percent)}%` }} /></div><strong>{Math.round(progress.percent)}%</strong></div>
      </div>}

      <footer className="shell"><span>FACTFRAME / V2</span><p>Sumber institusi, arkib, Wikidata &amp; Wikipedia · Media daripada Wikimedia Commons</p><span>Tanpa akaun. Tanpa API berbayar.</span></footer>
    </main>
  );
}
