# External sources

Hanya provider yang benar-benar dipanggil oleh kod disenaraikan.

| Provider | Tujuan / gaya endpoint | Key | Rate limit & fallback | Lesen |
|---|---|---|---|---|
| Wikidata | Carian REST Wikibase, `wbsearchentities`, EntityData dan label entity | Tidak | Retry untuk 429/5xx; carian REST jatuh ke MediaWiki API | Data berstruktur Wikidata lazimnya CC0; pautan sumber disimpan |
| Wikipedia | MediaWiki Action API untuk discovery dan intro/extract | Tidak | Kegagalan discovery batch menjadi hasil kosong; hydration boleh terus menggunakan fakta Wikidata | Teks berlesen CC BY-SA; aplikasi merumus, bukan menyimpan artikel penuh |
| Wikimedia Commons | MediaWiki Action API `generator=search`, imageinfo dan metadata lesen | Tidak | Kegagalan menghasilkan babak programatik/verified fallback jika ada | Hanya Public Domain, CC0 atau lesen CC BY yang melepasi filter; creator, URL lesen dan source URL dikekalkan |
| Google Gemini | SDK `@google/genai`; teks berstruktur dan TTS | Ya, server-side | Dua cubaan TTS; skrip deterministik dan MMS-VITS browser apabila tiada key/kuota | Output tertakluk pada terma Gemini; tiada key dicatat/log |
| Hugging Face model hosting | Fail ONNX MMS-TTS Melayu dimuatkan oleh browser worker | Tidak | Cache browser selepas muat turun; jika gagal render audio gagal | Model fallback dinyatakan CC BY-NC 4.0; had komersial penting |
| jsDelivr | FFmpeg core JavaScript/WASM semasa transcode | Tidak | Hanya digunakan jika MediaRecorder tidak boleh hasil MP4 terus | Pakej FFmpeg/WASM mengikut lesen upstream |

Sumber institusi/primer/akademik seperti MOT Malaysia, ATSB, FBI, Yale, NADMA, NLB dan U.S. Air Force wujud sebagai URL metadata dalam seed catalog. Kod tidak mempunyai connector/API khusus kepada laman tersebut dan tidak menyalin kandungan penuh.

Tidak dilaksanakan: NewspaperSG/NLB API, Internet Archive API, stock-video provider, map provider, news/current-affairs provider atau database peribadi.
