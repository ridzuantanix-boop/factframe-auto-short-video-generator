# Architecture

FactFrame ialah satu aplikasi Next.js 16 App Router. Tiada database, queue, scheduled crawler atau indeks kekal pada masa ini.

| Stage | Pelaksanaan sebenar | Lokasi/runtime |
|---|---|---|
| User | Memilih mode, topik, sudut, tempoh, nada, suara dan watermark | Browser, `Generator.tsx` |
| Discovery/catalog | 10 seed dalam kod + query Wikipedia/Wikidata secara live | Build bundle + server route `/api/discover` + external API |
| Story/entity selection | Seed dipilih terus; calon live dihidratkan melalui Wikidata/Wikipedia | Browser + `/api/topic` |
| Story angle | Tiga template mengikut jenis entiti | Browser, `explainerEngine.ts` |
| Research | Entity JSON, label, intro Wikipedia; seed mempunyai sources/claims manual | Server + external API / build-time seed |
| Current-aware check | Flag heuristik untuk person/organisation/place/event dan `lastVerifiedAt` tarikh request | Server; tiada semakan provider berita khusus |
| Source ranking | Seed menyimpan reliability label; data live dianggap `REFERENCE` | Build-time/manual + browser |
| Claim extraction/classification | Seed manual; explainer live menukar fakta kepada `VERIFIED` | Build-time/manual + browser |
| Story arc | Algoritma deterministik atau Gemini JSON berstruktur | Browser; Gemini melalui server |
| Retention narration | Hook/open-loop/escalation/twist/payoff dan quality gate | Browser; Gemini opsyenal server |
| Visual planner | Satu intent/query set bagi setiap segmen | Server `/api/media` |
| Image/video/archive search | Wikimedia Commons sahaja; tiada archive API khusus | Server + external API |
| Gemini TTS | Gemini API server-side, dua cubaan; fallback MMS-VITS dalam worker | Server + browser worker |
| Renderer | Canvas 720×1280, media muted, audio graph dan MediaRecorder | Browser |
| Captions/watermark | Dilukis ke Canvas pada setiap frame | Browser |
| MP4 | MP4 terus jika disokong; selain itu WebM ditranskod melalui FFmpeg/WASM | Browser + jsDelivr runtime asset |

```text
USER
  -> DISCOVERY / CATALOG
  -> STORY / ENTITY SELECTION
  -> STORY ANGLE
  -> RESEARCH
  -> CURRENT-AWARE FLAG
  -> SOURCE METADATA
  -> CLAIM EXTRACTION / CLASSIFICATION
  -> STORY ARC / RETENTION NARRATION
  -> VISUAL PLANNER
  -> WIKIMEDIA IMAGE / VIDEO SEARCH
  -> GEMINI TTS OR LOCAL FALLBACK
  -> CANVAS + MEDIARECORDER
  -> CAPTIONS + WATERMARK
  -> MP4
```

Major trust boundaries: browser input enters Next.js routes; Gemini key stays server-side; public sources and media are untrusted external dependencies; generated video never needs to be uploaded to the server.
