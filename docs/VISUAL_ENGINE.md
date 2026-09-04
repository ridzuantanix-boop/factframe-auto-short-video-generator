# Visual engine

Visual dicari **setiap segmen**, bukan sekali bagi seluruh topik. Setiap claim/script segment membawa `visualIntent`; `buildVisualQueries()` menggabungkan query khusus cerita/segmen, dua seed term, judul, region, tahun dan istilah intent. MH370 mempunyai query khusus untuk pesawat berlepas, laluan radar, arc satelit, operasi carian, serpihan dan lautan.

Satu-satunya media provider ialah Wikimedia Commons. Action API mencari `filetype:video` dan `filetype:bitmap`; video Wikimedia/WebM disokong jika browser boleh memainkannya. Renderer memuat klip sebagai muted, memilih offset berdasarkan scene, dan jika video gagal ia cuba thumbnail. Audio asal sentiasa muted.

Calon diberi skor padanan query (46%), topik (30%), resolusi (16%), bonus tahun dan baseline kecil. Source URL atau ID yang telah digunakan menerima penalti 0.65. Lesen mesti Public Domain, CC0 atau CC BY-compatible yang dikenali. Creator, license, license URL dan Commons description URL kekal pada objek visual dan dipaparkan sebagai sumber.

Intent `MAP`, `TIMELINE`, `DOCUMENT`, `NEWSPAPER`, `EVIDENCE`, `FACT_CARD` dan `THEORY_CARD` menghasilkan babak Canvas programatik, kadangkala di atas foto terakhir. Ia bukan peta geografi sebenar atau keratan akhbar arkib; ia ialah representasi grafik. Bila media relevan tiada/skor <0.3, planner menggunakan babak programatik. Jika semua segmen programatik, ia cuba query fallback; Villa Nabila mempunyai satu fallback Commons Danga Bay yang telah disahkan.

Readiness endpoint memerlukan repetition ≥0.8, relevance ≥0.35, sekurang-kurangnya dua visual kinds dan satu media bukan programatik. Diversity ialah bilangan `visualKind` unik. Tiada semantic image embedding, perceptual-hash duplicate detector, face matching, archive connector, shot-boundary analysis atau license cache.

Pengulangan satu subject image bukan aliran yang disengajakan, tetapi masih boleh berlaku jika Commons hanya memulangkan satu calon kuat atau programmatic scenes menggunakan foto terakhir sebagai backdrop. `npm run audit:visuals` mendedahkan setiap segmen MH370 dan query yang sepatutnya mempelbagaikan aircraft, map, radar/search evidence, debris dan ocean; concrete result kekal bergantung pada Commons live.
