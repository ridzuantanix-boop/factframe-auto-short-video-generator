# Discovery and catalog truth

## Jawapan terus

- **Adakah katalog hardcoded/seeded?** Ya. `src/lib/mystery/catalog.ts` mempunyai 10 `StoryRecord` manual.
- **Adakah discovery dinamik?** Ya, tetapi hanya calon entity/article. `/api/discover` menjalankan query Wikipedia secara live pada request.
- **Adakah indeks cerita disimpan?** Tidak. Tiada database, fail indeks hasil crawl atau scheduled job.
- **Di mana katalog?** Dalam TypeScript source tersebut dan dibundle semasa build.
- **Berapa calon tersimpan?** 10.
- **READY/PARTIAL/HIDDEN?** 10/0/0 berdasarkan status audit terbitan: READY memerlukan sources+claims, `sourceCoveragePotential=good`, research ≥0.90 dan visual ≥0.80; PARTIAL ialah kandungan sah yang belum mencapai semua threshold; HIDDEN jika tiada source/claim, research <0.60 atau visual <0.50. Status ini belum menjadi field persisten.
- **Malaysia/Malaya/global?** 4/6 dalam katalog tersimpan.
- **“1,000+”?** Anggaran keluasan ruang carian live, bukan kiraan READY atau indeks yang telah dinormalisasi.

## Cara calon baharu ditemui

`DISCOVERY_CATEGORY_QUERIES` mempunyai 14 kategori. Setiap request mengambil empat query, meminta sehingga 25 halaman Wikipedia bagi setiap query, menapis list/category/disambiguation dan beberapa bentuk fiction/noise, kemudian dedupe menggunakan Wikidata Q-ID. Pagination mengubah kumpulan query dan offset. Mystery search manual cuba katalog seed dahulu; jika tiada, ia menghidrat calon Wikidata/Wikipedia dan membina auto-mystery generik.

Tiada crawler arkib. “Archive” pada source atau visual ialah label/query teks, bukan integrasi archive provider. Dedupe hanya dalam satu respons menggunakan Q-ID; tiada clustering semantik atau dedupe antara request. Category assignment untuk feed berasal daripada kategori/query yang dipilih, bukan classifier. Auto-hydrated entity type menggunakan regex pada label/description/property.

## Qualification dan rejection

Seed dianggap render-ready apabila skrip mempunyai liputan sumber 100%, skor storytelling ≥10, hook/open-loop/payoff dan sifar claim tanpa sumber. `/api/media` seterusnya memerlukan satu visual bagi setiap segmen, repetition ≥0.8, relevance ≥0.35, sekurang-kurangnya dua jenis visual dan sekurang-kurangnya satu aset bukan programatik.

Calon live boleh ditolak kerana tiada fakta/extract, entity ID tidak sah, noise filter, upstream failure atau visual readiness gate. Source strength seed ialah skor manual `researchScore`; provider live tidak menjalankan ranking silang sumber. Visual availability seed juga skor manual `visualScore`; semasa runtime, asset diberi skor padanan query/topic, resolusi, tahun dan penalti duplikasi.

Jalankan `npm run export:catalog` dan `npm run audit:discovery`. Export membezakan angka tersimpan daripada data live yang tidak kekal.
