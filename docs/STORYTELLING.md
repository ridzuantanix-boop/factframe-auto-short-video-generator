# Storytelling

## Enjin deterministik

Mystery seed memetakan priority claim kepada `HOOK`, `CONTEXT`, `ESCALATION`, `TWIST`, `THEORY`, `COUNTERPOINT` atau `PAYOFF`, kemudian menyisip `OPEN_LOOP`. Prefiks Bahasa Melayu membezakan `REPORTED`, `THEORY`, `DISPUTED`, `FOLKLORE` dan `EXPLAINED_LATER`. Nada suspens hanya menambah satu lead terkawal pada twist; ia tidak mengubah fakta.

Sasaran minimum deterministik ialah 65/130/190 patah perkataan untuk 30/60/90 saat. Jika kurang, enjin menambah evidence bridge bersumber sebelum payoff. Ini boleh menyebabkan filler atau pengulangan; detector semantik khusus belum ada. Untuk explainer, maksimum ialah 90/170/240 dan ayat panjang dipendekkan secara heuristik.

Skor mystery maksimum 14: kewujudan hook, open-loop, escalation, bilangan segmen, twist/theory, payoff/counterpoint dan struktur asas. Quality gate: liputan sumber 100%, skor ≥10, hook/open-loop/payoff dan `unsupportedClaims=0`.

## Prompt Gemini sebenar

Route `/api/gemini/script` menghantar arahan Bahasa Melayu berikut secara dinamik: penulis dokumentari misteri pendek; gunakan hanya claims dalam JSON; jangan cipta fakta/motif/saksi/teori; kekalkan source IDs; ayat 5–14 perkataan; buka persoalan dalam tiga saat; beri maklumat progresif; tamat dengan payoff; bezakan fakta/laporan/teori/pertikaian/unresolved; tiada CTA atau drama palsu. Target Gemini ialah 65–90, 130–170 atau 190–240 perkataan.

Output mesti mengikut JSON schema role/claim type/visual intent. Source ID asing, segmen fakta tanpa source, panjang salah atau kegagalan quality gate ditolak. UI kembali kepada skrip deterministik jika Gemini gagal.

## Mystery claim handling

- `VERIFIED`: disebut sebagai fakta direkodkan.
- `REPORTED`: didahului “Menurut laporan ketika itu”.
- `FOLKLORE`: didahului “Menurut cerita rakyat”.
- `THEORY`: dilabel sebagai teori.
- `DISPUTED`: dinyatakan masih dipertikaikan.
- `EXPLAINED_LATER`: memperkenalkan pembetulan/penjelasan kemudian.
- `UNRESOLVED`: tidak dinaikkan menjadi fakta dan biasanya mengakhiri persoalan.

Nota sumber boleh ditambah sebagai scene akhir. Tiada disclaimer generik paranormal; ending setiap seed sepatutnya membawa classification sebenar. Bahasa disasarkan kepada Bahasa Melayu Malaysia yang pendek dan percakapan. Tiada model formal repetition/filler selain had ayat, dedupe fakta asas dan pilihan template.
