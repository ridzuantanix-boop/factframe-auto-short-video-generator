"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Dice5, Download, Film, LoaderCircle, Play, Search, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { adaptiveTtsProvider, previewNarrator } from "@/lib/audio/ttsProvider";
import { DEFAULT_VOICE_PRESET_ID, VOICE_PRESETS, type VoicePresetId } from "@/lib/audio/voicePresets";
import { renderVideo } from "@/lib/video/renderer";
import { caseStatusLabels, categoryLabels, mysteryCatalog } from "@/lib/mystery/catalog";
import { buildMysteryScript, mysteryScriptToTopic, passesQualityGate } from "@/lib/mystery/storyEngine";
import type { ContentMode, SearchResult, StoryDuration, StoryRecord, StoryTone, Topic, Visual } from "@/lib/types";

type Stage = "idle" | "searching" | "choosing" | "preview" | "generating" | "done";

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Sesuatu tidak berjalan lancar.");
  return data;
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

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => { void fetch("/api/gemini/status").then((response) => response.json()).then((data) => setGeminiConfigured(Boolean(data.configured))).catch(() => setGeminiConfigured(false)); }, []);
  useEffect(() => { const saved = localStorage.getItem("factframe-voice-preset") as VoicePresetId | null; if (VOICE_PRESETS.some((preset) => preset.id === saved)) queueMicrotask(() => setVoicePresetId(saved!)); }, []);
  useEffect(() => () => { if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl); }, [previewAudioUrl]);
  const estimatedSeconds = useMemo(() => topic ? (topic.mystery?.durationTarget ?? Math.max(20, Math.min(35, Math.round(topic.narration.split(/\s+/).length / 2)))) : 0, [topic]);

  async function searchTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setError(""); setStage("searching"); setTopic(null); setVisuals([]);
    try {
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
      setProgress({ message: "Mencari visual berlesen", percent: 58 });
      const mediaData = await readJson<{ visuals: Visual[] }>(await fetch(`/api/media?q=${encodeURIComponent(topicData.topic.name)}`));
      if (!mediaData.visuals.length) throw new Error("Fakta ditemui, tetapi visual yang boleh digunakan semula tidak mencukupi.");
      setTopic(topicData.topic); setVisuals(mediaData.visuals); setStage("preview");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Penyediaan topik gagal."); setStage("choosing"); }
  }

  async function selectMystery(story: StoryRecord) {
    setError(""); setSelectedStory(story); setProgress({ message: "Menyusun dakwaan bersumber", percent: 18 }); setStage("generating");
    try {
      let script = buildMysteryScript(story, duration, tone, showSourceNote);
      if (geminiConfigured) {
        setProgress({ message: "Gemini sedang menulis semula cerita", percent: 30 });
        const response = await fetch("/api/gemini/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: story.id, duration, tone, showSourceNote }) });
        const data = await readJson<{ script: typeof script }>(response);
        script = data.script; setAiEnhanced(true);
      } else setAiEnhanced(false);
      if (!passesQualityGate(script)) throw new Error("Cerita ini belum melepasi semakan sumber dan penceritaan.");
      setProgress({ message: "Mencari visual dokumentari", percent: 58 });
      const mediaData = await readJson<{ visuals: Visual[] }>(await fetch(`/api/media?q=${encodeURIComponent(story.visualSearchTerms[0] ?? story.title)}`));
      if (!mediaData.visuals.length) throw new Error("Sumber ditemui, tetapi visual berlesen yang relevan tidak mencukupi.");
      setTopic(mysteryScriptToTopic(story, script)); setVisuals(mediaData.visuals); setStage("preview");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Penyediaan cerita gagal."); setStage("idle"); }
  }

  function updateMystery(nextDuration: StoryDuration, nextTone: StoryTone, nextSourceNote: boolean) {
    setDuration(nextDuration); setTone(nextTone); setShowSourceNote(nextSourceNote);
    if (!selectedStory) return;
    const script = buildMysteryScript(selectedStory, nextDuration, nextTone, nextSourceNote);
    setTopic(mysteryScriptToTopic(selectedStory, script)); setAiEnhanced(false);
  }

  async function rewriteWithGemini() {
    if (!selectedStory || !geminiConfigured) return;
    setError(""); setStage("generating"); setProgress({ message: "Gemini sedang membina jalan cerita", percent: 35 });
    try {
      const response = await fetch("/api/gemini/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: selectedStory.id, duration, tone, showSourceNote }) });
      const data = await readJson<{ script: NonNullable<Topic["mystery"]> }>(response);
      setTopic(mysteryScriptToTopic(selectedStory, data.script)); setAiEnhanced(true); setStage("preview");
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
      const video = await renderVideo(topic, visuals, narration.audioBlob, (message, percent) => setProgress({ message, percent: 28 + percent * .72 }));
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(video)); setStage("done");
    } catch (caught) { setTtsFailed(true); setError(caught instanceof Error ? caught.message : "Penjanaan suara gagal."); setStage("preview"); }
  }

  function reset() {
    setQuery(""); setResults([]); setTopic(null); setSelectedStory(null); setVisuals([]); setError(""); setAiEnhanced(false); setTtsFailed(false); setStage("idle");
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
        <button role="tab" aria-selected={mode === "QUICK_FACTS"} className={mode === "QUICK_FACTS" ? "active" : ""} onClick={() => { reset(); setMode("QUICK_FACTS"); }}><Sparkles size={15} /> Fakta Ringkas</button>
      </div>

      <section className={`hero shell ${topic ? "heroCompact" : ""}`}>
        <div className="eyebrow">{mode === "MYSTERY" ? <><BookOpen size={14} /> Cerita misteri bersumber</> : <><Sparkles size={14} /> Fakta awam. Render peribadi.</>}</div>
        <h1>{mode === "MYSTERY" ? <>Misteri sebenar.<br /><em>Sumber yang boleh diperiksa.</em></> : <>Ubah apa-apa topik menjadi<br /><em>video pendek yang memikat.</em></>}</h1>
        <p className="heroCopy">{mode === "MYSTERY" ? "Pilih cerita atau biarkan aplikasi mencarinya. Setiap dakwaan dilabel, disusun untuk retensi, dan dipautkan kepada sumber." : "Cari sekali. Dapatkan video menegak bernarasi yang dibina daripada fakta sahih dan media boleh guna semula—tanpa menulis prompt atau menyunting."}</p>
        {mode === "MYSTERY" && stage === "idle" && <button className="randomButton" onClick={randomMystery}><Dice5 size={19} /> Jana misteri rawak <span>Hanya cerita skor tinggi</span></button>}
        <form className="searchForm" onSubmit={searchTopic}>
          <Search size={21} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "MYSTERY" ? "Cari misteri, kehilangan atau peristiwa pelik" : "Cuba “Tun Dr. Mahathir” atau “Saturn”"} aria-label="Cari apa-apa topik" disabled={stage === "searching" || stage === "generating"} />
          {query && <button type="button" className="clear" onClick={() => setQuery("")} aria-label="Kosongkan"><X size={16} /></button>}
          <button className="searchButton" disabled={!query.trim() || stage === "searching" || stage === "generating"}>{stage === "searching" ? <LoaderCircle className="spin" size={18} /> : <>Cari <ArrowRight size={17} /></>}</button>
        </form>
        <div className="tryRow"><span>{mode === "MYSTERY" ? "Atau cari sendiri:" : "Popular:"}</span>{(mode === "MYSTERY" ? ["MH370", "Mary Celeste", "D. B. Cooper"] : ["Tun Dr. Mahathir", "Menara Eiffel", "Gunung Everest"]).map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
        {error && <div className="errorBox">{error}</div>}
      </section>

      {mode === "MYSTERY" && stage === "idle" && <section className="catalog shell reveal">
        <div className="sectionHeading"><div><span className="step">SEDIA DIJANA</span><h2>Pilih cerita</h2></div><p>Cerita dipilih berdasarkan kekuatan sumber, kejelasan kes dan visual yang tersedia.</p></div>
        <div className="filterRow">{["Semua", "Malaysia / Malaya", "Kehilangan", "Misteri sejarah", "Teori konspirasi"].map((filter) => <button className={catalogFilter === filter ? "active" : ""} key={filter} onClick={() => setCatalogFilter(filter)}>{filter}</button>)}</div>
        <div className="mysteryGrid">{mysteryCatalog.filter((story) => catalogFilter === "Semua" || (catalogFilter === "Malaysia / Malaya" ? ["Malaysia", "Malaya"].includes(story.country) : categoryLabels[story.category] === catalogFilter)).map((story) => <article className="mysteryCard" key={story.id}>
          <div className="mysteryMeta"><span>{story.country}</span><span>{story.decade}</span></div><h3>{story.title}</h3><p>{story.summary}</p>
          <div className="storyTags"><span>{categoryLabels[story.category]}</span><span>{caseStatusLabels[story.caseStatus]}</span></div>
          <div className="scoreLine"><span>Sumber {Math.round(story.researchScore * 100)}%</span><span>Visual {Math.round(story.visualScore * 100)}%</span></div>
          <button onClick={() => void selectMystery(story)}>Pilih cerita <ArrowRight size={16} /></button>
        </article>)}</div>
      </section>}

      {stage === "choosing" && <section className="panel shell reveal">
        <div className="sectionHeading"><div><span className="step">01</span><h2>Pilih topik yang tepat</h2></div><p>Kami menemui beberapa padanan. Pilih satu supaya fakta yang digunakan kekal tepat.</p></div>
        <div className="resultsGrid">{results.map((result) => <button className="resultCard" key={result.id} onClick={() => selectEntity(result)}>
          <span className="resultId">{result.id}</span><strong>{result.label}</strong><p>{result.description}</p><span className="selectArrow"><ArrowRight size={18} /></span>
        </button>)}</div>
      </section>}

      {topic && (stage === "preview" || stage === "done") && <section className="workspace shell reveal">
        <div className="previewColumn">
          <div className="sectionHeading"><div><span className="step">02</span><h2>Filem fakta anda</h2></div><p>Semuanya sudah disediakan. Semak jalan cerita, kemudian biarkan peranti anda menghasilkan video.</p></div>
          <div className="phoneStage">
            <div className="phoneFrame">
              {stage === "done" && videoUrl ? <video src={videoUrl} controls playsInline /> : <>
                <Image src={visuals[0].thumbUrl} alt={topic.name} fill sizes="360px" unoptimized />
                <div className="phoneShade" />
                <span className="videoBadge">{topic.mystery ? "MISTERI BERSUMBER" : "FAKTA RINGKAS"}</span>
                <div className="phoneTitle"><h3>{topic.name}</h3><p>{topic.description}</p></div>
                <button className="playButton" onClick={generate} aria-label="Hasilkan dan pratonton video"><Play fill="currentColor" size={23} /></button>
                <div className="captionMock">{topic.narration.split(/(?<=[.!?])\s+/)[0]}</div>
              </>}
            </div>
            <div className="formatLabel"><span>9:16</span><span>720 × 1280</span><span>~{estimatedSeconds} saat</span></div>
          </div>
        </div>

        <aside className="storyPanel">
          {topic.mystery && <div className="storyControls">
            <div className={`aiStatus ${geminiConfigured ? "ready" : "local"}`}><span>{geminiConfigured ? "GEMINI AKTIF" : "MOD TEMPATAN"}</span><small>{geminiConfigured ? "Skrip AI + suara manusia" : "Tambah GEMINI_API_KEY untuk suara premium"}</small></div>
            <div><label><Clock3 size={14} /> Tempoh</label><div className="segmented">{([30, 60, 90] as StoryDuration[]).map((value) => <button className={duration === value ? "active" : ""} key={value} onClick={() => updateMystery(value, tone, showSourceNote)}>{value}s</button>)}</div></div>
            <div><label><Film size={14} /> Nada</label><div className="segmented"><button className={tone === "DOCUMENTARY" ? "active" : ""} onClick={() => updateMystery(duration, "DOCUMENTARY", showSourceNote)}>Dokumentari</button><button className={tone === "SUSPENSEFUL" ? "active" : ""} onClick={() => updateMystery(duration, "SUSPENSEFUL", showSourceNote)}>Suspens</button></div></div>
            <label className="sourceToggle"><input type="checkbox" checked={showSourceNote} onChange={(event) => updateMystery(duration, tone, event.target.checked)} /> Nota sumber di akhir</label>
            {geminiConfigured && <button className="rewriteButton" onClick={() => void rewriteWithGemini()}><Sparkles size={14} /> {aiEnhanced ? "Tulis semula dengan Gemini" : "Tingkatkan skrip dengan Gemini"}</button>}
          </div>}
          {topic.mystery && <section className="voiceSelector" aria-labelledby="voice-selector-title">
            <div className="voiceHeading"><div><Volume2 size={15} /><strong id="voice-selector-title">Suara narator</strong></div><span>{geminiConfigured ? "Gemini TTS" : "Gemini diperlukan"}</span></div>
            <div className="voiceGrid">{VOICE_PRESETS.map((preset) => <label className={`voiceCard ${voicePresetId === preset.id ? "selected" : ""}`} key={preset.id}>
              <input type="radio" name="voice-preset" value={preset.id} checked={voicePresetId === preset.id} onChange={() => selectVoice(preset.id)} />
              <span className="radioMark" /><span className="voiceCopy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
              <button type="button" disabled={!geminiConfigured || previewingVoice !== null} onClick={(event) => { event.preventDefault(); void previewVoice(preset.id); }}><Play size={11} fill="currentColor" />{previewingVoice === preset.id ? "Menjana…" : "Pratonton"}</button>
            </label>)}</div>
          </section>}
          <div className="topicHeader"><div><span className="typeTag">{{ person: "tokoh", place: "tempat", event: "peristiwa", object: "objek", organisation: "organisasi", animal: "haiwan", space: "angkasa", general: "umum" }[topic.entityType]}</span><h2>{topic.name}</h2><p>{topic.description}</p></div><span className="factCount">{topic.facts.length} fakta</span></div>
          <div className="factList">{topic.facts.map((fact, index) => <div className="fact" key={`${fact.label}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{({ VERIFIED: "Fakta disahkan", REPORTED: "Laporan", THEORY: "Teori", DISPUTED: "Dipertikaikan", UNRESOLVED: "Belum terjawab", FOLKLORE: "Cerita rakyat", "EXPLAINED LATER": "Dijelaskan kemudian" } as Record<string, string>)[fact.label] ?? fact.label}</strong><p>{fact.sentence}</p></div><Check size={16} /></div>)}</div>
          <div className="narration"><div className="cardLabel"><Volume2 size={16} /> Skrip narasi {aiEnhanced && <span className="aiBadge">Gemini</span>}</div><p>{topic.narration}</p><div>{topic.narration.split(/\s+/).length} patah perkataan · {geminiConfigured ? "Suara ekspresif Gemini" : "Suara neural tempatan"}</div></div>
          {topic.mystery && <div className="qualityGate"><div><ShieldCheck size={16} /><strong>Lulus semakan kualiti</strong></div><span>Liputan sumber {Math.round(topic.mystery.sourceCoverage * 100)}%</span><span>Skor penceritaan {topic.mystery.storytellingScore}/14</span><span>{topic.mystery.unsupportedClaims} dakwaan tanpa sumber</span></div>}
          {stage === "done" ? <a className="generateButton downloadButton" href={videoUrl} download={`${topic.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-factframe.mp4`}><Download size={19} /> Muat turun MP4</a> : <button className="generateButton" onClick={generate}><Sparkles size={19} /> {ttsFailed ? "Cuba semula suara" : "Hasilkan video"} <span>~{estimatedSeconds} saat</span></button>}
          <p className="renderNote">{geminiConfigured ? "Gemini menjana suara narator yang dipilih. Pratonton dan audio yang sama dicache untuk mempercepat cubaan seterusnya; video kekal dirender pada peranti anda." : "Kali pertama akan memuat turun model suara neural ~114 MB. Selepas itu model dicache; video kekal dirender pada peranti anda."}</p>
          <details className="sources"><summary>Sumber &amp; penyelidikan <ChevronDown size={17} /></summary>
              <div className="sourceBody">
                {topic.mystery?.sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><strong>{index + 1}. {source.type}</strong><span>{source.title} · {source.publisher}</span></a>)}
                {!topic.mystery && <a href={`https://www.wikidata.org/wiki/${topic.id}`} target="_blank" rel="noreferrer"><strong>Fakta</strong><span>Wikidata · {topic.id}</span></a>}
              {topic.wikipediaUrl && <a href={topic.wikipediaUrl} target="_blank" rel="noreferrer"><strong>Konteks</strong><span>Wikipedia</span></a>}
              {visuals.map((visual, index) => <a href={visual.sourceUrl} target="_blank" rel="noreferrer" key={visual.sourceUrl}><strong>Imej {index + 1}</strong><span>{visual.title} · {visual.license.replace(/Public domain/i, "Domain awam")} · {visual.creator}</span></a>)}
            </div>
          </details>
        </aside>
      </section>}

      {stage === "generating" && <div className="renderOverlay" role="status">
        <div className="renderCard"><div className="renderOrb"><Film size={32} /></div><span className="step">MENGHASILKAN FILEM ANDA</span><h2>{progress.message}</h2><p>Biarkan tab ini terbuka sementara peranti anda bekerja.</p><div className="progressTrack"><span style={{ width: `${Math.max(3, progress.percent)}%` }} /></div><strong>{Math.round(progress.percent)}%</strong></div>
      </div>}

      <footer className="shell"><span>FACTFRAME / V1.2</span><p>Sumber institusi, arkib, Wikidata &amp; Wikipedia · Media daripada Wikimedia Commons</p><span>Tanpa akaun. Tanpa API berbayar.</span></footer>
    </main>
  );
}
