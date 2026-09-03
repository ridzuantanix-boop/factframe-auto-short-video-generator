# FactFrame V1.2 — Sourced Mystery Short Video Generator

FactFrame ialah aplikasi Next.js local-first yang menghasilkan video dokumentari misteri 9:16 dalam Bahasa Melayu. V1.2 melanjutkan—bukan menggantikan—aliran Fakta Ringkas V1.

## Jalankan secara tempatan

```bash
npm install
npm run dev
```

Buka `http://127.0.0.1:3000` atau port yang dipaparkan oleh Next.js.

## Dua mod kandungan

- **Misteri & Teori:** katalog sedia dijana, pilihan rawak berkualiti, penapis Malaysia/Malaya, tempoh 30/60/90 saat, nada dokumentari atau suspens, model dakwaan, liputan sumber dan quality gate.
- **Fakta Ringkas:** carian Wikidata/Wikipedia dan aliran render asal dikekalkan.

## Aliran Mystery Mode

1. Pilih cerita katalog atau jana cerita rawak yang mempunyai skor sumber dan visual tinggi.
2. Susun dakwaan bersumber kepada hook, open loop, konteks, eskalasi, teori/counterpoint dan payoff.
3. Tolak render jika liputan sumber bukan 100%, skor penceritaan di bawah 10/14 atau terdapat dakwaan tanpa sumber.
4. Cari visual berlesen melalui integrasi Wikimedia Commons sedia ada.
5. Jana suara neural Bahasa Melayu secara tempatan menggunakan MMS-VITS.
6. Render babak foto, peta, garis masa, dokumen, bukti, kad teori dan nota sumber menggunakan renderer Canvas sedia ada.
7. Rakam dan sediakan MP4 720 × 1280 melalui MediaRecorder serta FFmpeg/WASM apabila diperlukan.

## Privasi dan lesen

Video dirender pada peranti dan hanya disimpan sebagai object URL dalam sesi pelayar. Model suara pertama kali memuat turun kira-kira 114 MB dan kemudian menggunakan cache pelayar. Model MMS-TTS mewarisi lesen CC BY-NC 4.0; gantikan penyedia TTS sebelum penggunaan komersial.

## Gemini: skrip dan suara lebih natural

Salin `.env.example` kepada `.env.local`, kemudian isi API key:

```bash
GEMINI_API_KEY=masukkan_api_key_anda
```

Apabila key tersedia, Mystery Mode menggunakan Gemini untuk menulis skrip berstruktur daripada dakwaan sedia ada dan Gemini TTS untuk suara Bahasa Melayu yang lebih ekspresif. Pemilih narator menyediakan empat gaya mesra pengguna—Lelaki Dokumentari, Lelaki Misteri, Wanita Dokumentari dan Wanita Tenang—berserta pratonton, cache serta pilihan yang kekal selepas halaman dimuat semula. Nama teknikal suara Gemini tidak dipaparkan dalam UI.

API tidak dibenarkan mencipta source ID baharu, setiap ayat fakta mesti mempunyai sumber, dan output tetap melalui quality gate. Tanpa key atau selepas key dibuang, aplikasi kembali kepada enjin lokal secara automatik.

## Pengesahan

```bash
npm run lint
npm run build
```

Ujian regresi utama merangkumi Mystery Mode 30/60/90 saat, penapis Malaysia/Malaya, quality gate 100% sumber, render MP4 Dyatlov Pass, dan carian Fakta Ringkas sedia ada.
