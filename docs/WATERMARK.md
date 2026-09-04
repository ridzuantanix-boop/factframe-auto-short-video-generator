# Watermark

Watermark default dimatikan. Pengguna boleh hidup/matikan, memasukkan maksimum 40 aksara satu baris, memilih sembilan posisi, saiz kecil/sederhana/besar dan opacity 50/75/100%. Konfigurasi disimpan dalam `localStorage` dengan key `factframe-watermark`.

Preview menggunakan CSS; output akhir menggunakan Canvas. Posisi atas sekitar y=135, tengah y=690 dan bawah y=925. Caption biasanya berada lebih bawah, jadi posisi bawah dinaikkan; UI memaparkan nota khusus untuk `BOTTOM_CENTER`. Ini mengurangkan collision tetapi bukan layout solver.

Safe area TikTok/Shorts ialah koordinat heuristik. Aplikasi tidak mengetahui overlay sebenar mengikut platform/peranti, tidak menguji panjang teks mengikut lebar dan tidak memindahkan watermark secara automatik berdasarkan caption selain koordinat tetap. Teks putih mempunyai stroke gelap dan alpha pengguna.
