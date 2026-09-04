# Current-aware research

Pelaksanaan semasa adalah minimum. `/api/topic` menetapkan `currentAware=true` untuk person, organisation, place dan event serta `lastVerifiedAt` kepada tarikh request. Ia mengambil entity data Wikidata dan intro Wikipedia dengan cache/revalidation 6–24 jam.

Tiada provider berita, official-office registry, company filing, sports feed, knowledge-diff job atau scheduled freshness audit. “Current-aware” bermaksud topik berpotensi berubah telah ditandai, **bukan** bahawa setiap claim disahkan terhadap sumber terkini berbilang provider.

Recency datang daripada request semasa dan cache Next.js: search 1 jam, Wikipedia/discovery 6 jam, entity/labels 24 jam. Aplikasi tidak menyimpan timestamp source upstream, sejarah versi atau expiry per claim. Jika Wikipedia gagal, fakta Wikidata boleh digunakan; jika data keseluruhan terlalu lemah, topic hydration mengembalikan ralat. Seed mystery menggunakan tarikh `accessedAt` statik 2026-09-03 sehingga dikemas kini melalui commit.

Risiko stale tertinggi: ahli politik hidup, CEO/syarikat aktif, atlet, teknologi, hal semasa dan siasatan aktif. Reviewer harus menganggap output tersebut perlu semakan manusia. Pencegahan stale yang lebih kuat—provider rasmi, timestamp claim, invalidation dan scheduled refresh—belum dilaksanakan.
