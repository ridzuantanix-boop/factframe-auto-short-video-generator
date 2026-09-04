# TTS

Model server default ialah `gemini-3.1-flash-tts-preview`; ia boleh dioverride melalui `GEMINI_TTS_MODEL`. Model teks default ialah `gemini-3.7-flash`. Key hanya dibaca dalam `src/lib/gemini/client.ts` yang mengimport `server-only`.

| Label UI | ID | Gemini voice | Gaya |
|---|---|---|---|
| Lelaki — Dokumentari | `male-documentary` | Gacrux | tenang, investigatif, yakin, tidak seperti iklan |
| Lelaki — Misteri | `male-mystery` | Charon | suspens terkawal, jeda sebelum reveal, tidak teatrikal |
| Wanita — Dokumentari | `female-documentary` | Kore | jelas, yakin, neutral dan conversational |
| Wanita — Tenang | `female-calm` | Sulafat | hangat, terkawal, mudah diikuti |

Server meminta audio Bahasa Melayu Malaysia, delivery natural, dan output PCM 24 kHz mono yang dibungkus sebagai WAV. TTS dicuba dua kali. Blob mesti boleh didecode oleh `AudioContext`, tidak kosong dan lebih 0.5 saat. Untuk 30/60/90 saat, durasi luar 75–125% daripada julat 25–35/50–70/75–100 ditolak. Renderer kemudian mengehadkan playback-rate kepada 0.88–1.18 untuk menghampiri sasaran.

Tiada script-shortening TTS automatik selepas durasi gagal; kegagalan membawa kepada fallback lokal. Cache in-memory berasingan untuk preview/final menggunakan text, voice, tone dan duration sebagai key. Preview menghantar perkataan “pratonton”; server juga mempunyai cache preview kecil. Pilihan voice disimpan dalam localStorage.

Fallback menggunakan MMS-TTS Melayu dalam Web Worker melalui ONNX Runtime Web. Model kira-kira 114 MB dicache browser. Ia menjana ayat dan WAV; lesen dinyatakan CC BY-NC 4.0. Demo mode atau tiada Gemini key menggunakan fallback ini secara terang.
