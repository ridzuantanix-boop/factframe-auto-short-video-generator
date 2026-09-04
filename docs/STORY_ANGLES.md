# Story angles

`generateStoryAngles()` memilih tiga template berdasarkan `entityType`. Jenis disokong: `BIOGRAPHICAL_JOURNEY`, `TURNING_POINT`, `ORIGIN_STORY`, `TIMELINE`, `HOW_IT_CHANGED`, `WHY_IT_MATTERS`, `MAJOR_MOMENTS` dan `HISTORICAL_OVERVIEW`.

Sudut bukan hasil model generatif dan bukan rekod seed per entiti. Tajuknya dinamik daripada nama entity, tetapi struktur dan ringkasan ialah template. Sebagai contoh Anwar Ibrahim menerima “Perjalanan panjang Anwar Ibrahim”, “Detik yang mengubah kisah Anwar Ibrahim” dan “Momen terbesar Anwar Ibrahim”. Contoh lebih khusus seperti “The Rise of Reformasi” belum dihasilkan sebagai sudut berasingan.

`buildExplainerScript()` menyusun fakta mengikut heuristik. Untuk tokoh, regex memberi keutamaan kepada tarikh lahir/permulaan, 1998/krisis, penjara, Reformasi, 2018 dan kedudukan semasa; `TURNING_POINT` menaikkan keutamaan fakta krisis. Setiap segmen mewarisi source ID.

Validasi source berlaku pada skrip, bukan semasa penciptaan tajuk angle. Angle yang lemah/clickbait tidak dinilai semantik; aplikasi hanya menggunakan template neutral dan tidak menyediakan input bebas untuk tajuk angle. Tiada scoring angle, clustering angle atau pemeriksaan sama ada setiap angle mempunyai bukti unik. Ini ialah batas semasa.
