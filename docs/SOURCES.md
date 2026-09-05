# External sources

Hanya provider yang benar-benar dipanggil oleh kod disenaraikan.

| Provider | Tujuan / gaya endpoint | Key | Rate limit & fallback | Lesen |
|---|---|---|---|---|
| Wikidata | Carian REST Wikibase, `wbsearchentities`, EntityData dan label entity | Tidak | Retry untuk 429/5xx; carian REST jatuh ke MediaWiki API | Data berstruktur Wikidata lazimnya CC0; pautan sumber disimpan |
| Wikipedia | MediaWiki Action API untuk discovery dan intro/extract | Tidak | Kegagalan discovery batch menjadi hasil kosong; hydration boleh terus menggunakan fakta Wikidata | Teks berlesen CC BY-SA; aplikasi merumus, bukan menyimpan artikel penuh |
| NLB OneSearch / NewspaperSG | Endpoint JSON carian awam `onesearch/newspaper/index`; metadata artikel sejarah sahaja | Tidak | Timeout, dua retry, pagination cap, concurrency/delay terkawal; hasil terkunci tidak diambil | Tajuk, tarikh, snippet dan URL disimpan untuk traceability; artikel penuh tidak disalin dan access controls tidak dipintas |
| NLB OneSearch Records & Papers | Endpoint JSON carian awam `onesearch/record/index` | Tidak | Partial success; status `FAIL` provider direkod tanpa menghentikan run | Metadata institusi sahaja; hak guna item mesti dinilai pada halaman sumber |
| NLB OneSearch audiovisual/oral history | Endpoint JSON carian awam `onesearch/audiovisual/index` | Tidak | Partial success dan batas sama seperti provider NLB lain | Metadata dan source link disimpan; media tidak dimuat turun |
| Library of Congress | API JSON rasmi `loc.gov/search/?fo=json` | Tidak | Connector tersedia, tetapi runtime audit 2026-09-04 menerima HTTP 403 Cloudflare; sifar rekod diimport | Tiada kandungan LOC dianggap tersedia sehingga request sebenar berjaya; rights metadata perlu diperiksa per item |
| Wikimedia Commons | MediaWiki Action API `generator=search`, imageinfo dan metadata lesen | Tidak | Kegagalan menghasilkan babak programatik/verified fallback jika ada | Hanya Public Domain, CC0 atau lesen CC BY yang melepasi filter; creator, URL lesen dan source URL dikekalkan |
| Google Gemini | SDK `@google/genai`; teks berstruktur dan TTS | Ya, server-side | Dua cubaan TTS; skrip deterministik dan MMS-VITS browser apabila tiada key/kuota | Output tertakluk pada terma Gemini; tiada key dicatat/log |
| Hugging Face model hosting | Fail ONNX MMS-TTS Melayu dimuatkan oleh browser worker | Tidak | Cache browser selepas muat turun; jika gagal render audio gagal | Model fallback dinyatakan CC BY-NC 4.0; had komersial penting |
| jsDelivr | FFmpeg core JavaScript/WASM semasa transcode | Tidak | Hanya digunakan jika MediaRecorder tidak boleh hasil MP4 terus | Pakej FFmpeg/WASM mengikut lesen upstream |

Sumber institusi/primer/akademik seperti MOT Malaysia, ATSB, FBI, Yale, NADMA dan U.S. Air Force masih wujud sebagai URL metadata dalam seed catalog. NLB kini mempunyai connector discovery khusus, tetapi sistem tetap tidak menyalin kandungan penuh.

## Research provenance

Phase 4 reads every persisted source linked to a selected archive candidate. Deterministic extraction stores atomic claims in `story_claims`; near-duplicates retain all supporting source IDs. Research packages label source roles as primary/official, archival newspaper, institutional, or reference. Newspaper evidence supports wording such as “reported”, not automatic objective verification. Garbled snippets are excluded or assigned lower confidence, and publication dates are explicitly marked `PUBLICATION_DATE` rather than inferred as event dates.

No new provider or mass Gemini research call was added. `npm run enrich:stories -- --status=PARTIAL --limit=25` is bounded by default and supports `--category`, `--region`, `--min-sources`, `--concurrency`, and `--delay`. `--status=ALL` exists for controlled re-audits of both PARTIAL and READY archive packages.

Tidak dilaksanakan: Internet Archive API, stock-video provider, map provider, news/current-affairs provider atau database peribadi.
