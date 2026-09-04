# FactFrame V2

FactFrame V2 ialah aplikasi Next.js untuk menghasilkan video cerita pendek Bahasa Melayu yang bersumber. Ia mempunyai dua aliran: **Stories & Explainers** untuk entiti Wikidata/Wikipedia dan **Mystery & Legends** untuk cerita yang membezakan fakta, laporan, teori, pertikaian dan cerita rakyat.

## Keupayaan semasa

- discovery cerita secara live melalui indeks Wikidata/Wikipedia;
- katalog seed misteri yang sudah melalui readiness gate;
- penjanaan beberapa sudut cerita untuk entiti;
- penyelidikan bersumber, klasifikasi dakwaan dan susunan retention storytelling;
- tanda `currentAware` dan tarikh semakan untuk topik yang boleh berubah;
- perancangan visual setiap segmen, carian imej/video Wikimedia Commons dan babak programatik;
- Gemini 3.1 Flash TTS Preview dengan empat preset, retry, cache dan fallback suara neural tempatan;
- sari kata, tera air tersuai dan eksport MP4 menegak 9:16 pada 720 × 1280.

Dokumentasi audit terperinci berada dalam [`docs/`](docs/). Angka “1,000+” dalam UI ialah anggaran ruang calon discovery live, **bukan** 1,000 cerita READY yang disimpan. Katalog READY tersimpan semasa ialah 10 cerita.

## Jalankan secara tempatan

Prasyarat: Node.js 24 dan npm.

```bash
git clone https://github.com/ridzuantanix-boop/factframe-auto-short-video-generator.git
cd factframe-auto-short-video-generator
npm install
copy .env.example .env.local
npm run dev -- --port 3100
```

Pada macOS/Linux, gunakan `cp .env.example .env.local`. Buka `http://localhost:3100`.

Tiada key diperlukan untuk katalog, penyelidikan awam, visual planning dan render menggunakan suara fallback tempatan. Muat turun pertama model suara tempatan kira-kira 114 MB.

## Environment variables

| Variable | Keperluan | Skop | Kegunaan |
|---|---|---|---|
| `GEMINI_API_KEY` | Opsyenal | Server sahaja | Skrip Gemini dan Gemini TTS. Jangan gunakan awalan `NEXT_PUBLIC_`. |
| `GEMINI_TEXT_MODEL` | Opsyenal | Server sahaja | Override model teks; default `gemini-3.7-flash`. |
| `GEMINI_TTS_MODEL` | Opsyenal | Server sahaja | Override model suara; default `gemini-3.1-flash-tts-preview`. |
| `DEMO_MODE` | Opsyenal | Server sahaja | `true` mematikan Gemini dengan jelas dan menggunakan aliran sumber awam serta suara tempatan. Default `false`. |

Semua panggilan Gemini dibuat melalui route server `/api/gemini/*`. Tiada secret dihantar ke bundle browser.

## Demo / safe review mode

```bash
set DEMO_MODE=true
npm run dev -- --port 3100
```

PowerShell: `$env:DEMO_MODE='true'`. Demo mode menggunakan katalog/discovery/visual sebenar, bukan data palsu, tetapi mematikan Gemini. Pemilihan cerita, sudut cerita, fakta, claims, narasi deterministik, visual, sumber, watermark dan render masih boleh diperiksa. TTS menggunakan model neural tempatan dan dilabel sebagai mod tempatan. Fixtures di `fixtures/audit/` hanya untuk ujian/export audit.

## Pemeriksaan dan audit

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run audit:project
npm run export:catalog
npm run export:audit-samples
npm run audit:discovery
npm run audit:visuals
```

Export dihasilkan dalam `audit/` dan tidak mengandungi secret atau media berhak cipta. `audit:visuals` merekodkan keputusan programatik dan query sebenar; fail media konkrit kekal runtime-dependent kerana Commons dicari secara live.

## Production

- URL: https://factframe-v2.vercel.app
- Vercel project: `factframe-auto-short-video-generator`
- Production/default branch: `main`
- Expected domain: `factframe-v2.vercel.app` (alias awam)

## Status data semasa

- katalog misteri tersimpan: 10;
- READY: 10; PARTIAL: 0; HIDDEN: 0 berdasarkan threshold yang didokumenkan;
- Malaysia/Malaya tersimpan: 4; global: 6;
- discovery live: tidak disimpan, berubah mengikut respons upstream dan tidak sama dengan READY.

## Had penggunaan

MMS-TTS fallback tempatan menggunakan model berlesen CC BY-NC 4.0 dan tidak sesuai dianggap sebagai lesen komersial automatik. Gemini tertakluk pada kuota akaun. Media Commons perlu mematuhi lesen setiap aset. Lihat [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) sebelum audit atau penggunaan production.
