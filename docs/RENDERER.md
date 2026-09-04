# Renderer

Render berlaku sepenuhnya dalam browser. Canvas 2D berukuran 720×1280 pada 30 fps melukis foto/video, gerakan pan/zoom, gradient, label intent, caption, progress bar dan watermark. Audio WAV/Gemini didecode dengan Web Audio dan digabungkan ke stream Canvas.

`MediaRecorder` memilih MP4 H.264/AAC jika browser menyokong `video/mp4;codecs=avc1.42E01E,mp4a.40.2`. Jika tidak, ia merakam WebM VP9/Opus kemudian memuat FFmpeg core/WASM 0.12.10 daripada jsDelivr dan transcode kepada H.264 yuv420p/AAC MP4 dengan `faststart`.

Imej dimuat sebagai `ImageBitmap`. Video termasuk WebM dimuat melalui `<video crossorigin=anonymous>`, muted dan playsInline; klip gagal/timeout 20 saat jatuh ke thumbnail atau latar grafik. Klip tidak dipotong sebagai fail berasingan: renderer memilih `currentTime`, memainkan hanya sepanjang scene dan merakam Canvas.

Caption dipecah maksimum 11 perkataan bagi chunk dan dilukis maksimum tiga baris berhampiran bawah. Watermark akhir dilukis selepas caption pada setiap frame. Safe areas ialah koordinat tetap, bukan metadata TikTok/Instagram dinamik.

Had: render mengambil masa hampir real-time, memerlukan RAM/CPU tinggi, dan FFmpeg download menambah kos pada browser tanpa direct MP4. Safari/iOS/telefon lama mungkin mengehadkan MediaRecorder, WASM memory, autoplay/Web Audio atau background tabs. Tiada server render, resumable job, GPU/WebCodecs path, 1080×1920 option, bitrate UI atau automated codec compatibility matrix.
