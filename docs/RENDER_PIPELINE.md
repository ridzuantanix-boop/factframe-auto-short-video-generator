# Synchronized TTS and video render pipeline

```text
latest READY research package + persisted visual plan
  -> approved final Malay narration
  -> Gemini TTS or explicit local fallback
  -> decode actual audio duration
  -> proportional segment and caption timing
  -> load reusable assets / render OSM map / draw safe cards
  -> Canvas 9:16 + Web Audio stream
  -> MediaRecorder MIME negotiation
  -> MP4 when natively supported, otherwise honest WebM
  -> reload blob, decode and play near end
  -> export manifest + download
```

## Timing and captions

The decoded TTS duration is authoritative. Narration playback rate remains 1.0, so words are never cut or unnaturally accelerated to meet the estimate. Segment weights use word count plus punctuation pauses. Caption chunks contain approximately 3–8 words and exactly cover the approved narration. Timing is labelled `AUDIO_DURATION_PROPORTIONAL`; it is approximate phrase alignment, not word timestamps.

## Container integrity and validation

MediaRecorder checks MP4/AVC/AAC, WebM VP9/Opus, WebM VP8/Opus, then generic WebM. The returned extension is `.mp4` only for actual `video/mp4`; otherwise it is `.webm`. A render is rejected when the blob is under 10 KB, has no duration/dimensions, cannot decode, or cannot play near its end.

The manifest stores story ID, research and visual-plan hashes, narration hash, TTS provider/voice, actual audio and video durations, resolution, MIME type, file size, assets, sources, caption coverage, substitutions, track presence, and playback validation. Hashes invalidate stale cached inputs.

## Nuri browser regression

The recorded audit at `audit/render-manifest.json` used Gemini 3.1 Flash TTS Preview with the `male-mystery` Malaysian Malay preset. Two exports of the same narration/visual hashes succeeded. The actual audio was 19.44 seconds; native MP4 output was approximately 19.3 seconds at 720×1280 with audio/video tracks, 100% caption coverage, zero asset failures, and playback reaching near the end. The video binary is deliberately not committed.
