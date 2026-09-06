# Phase 7 UX audit

## Baseline recorded before changes

The browser baseline exposed several production frictions:

- the default Story catalog showed 48 mixed live/indexed candidates, including irrelevant and unresearched entries;
- unverified live candidates looked selectable and were not separated from READY stories;
- cards exposed Wikidata Q-IDs, database UUIDs, internal source/visual scores and the phrase "persistent candidate";
- the preview exposed provider names, fallback implementation, quality internals, raw export JSON and hashes;
- loading messages named providers and implementation details instead of explaining the user-visible stage;
- the archive section said 67 items were loaded while only two persisted stories were genuinely READY;
- the footer promised "no paid API" although an optional metered TTS service is used;
- refreshing the preview lost the selected story and browser Back had no deliberate state handling.

## Remediation

- Public catalogs now return persisted READY research packages first and do not mix live discoveries into a configured production catalog.
- Cards use `Boleh dijana`, `Bahan belum cukup`, or `Sedang disemak`; raw status constants and IDs are hidden.
- Cards show title, summary, category, supported duration and historical/current context only.
- Generation cannot start from PARTIAL or DISCOVERED results.
- Loading uses: `Semak cerita`, `Sediakan suara`, `Cari visual`, `Susun video`, `Siapkan video`.
- Preview/download show human-facing format, resolution and duration; technical manifests remain audit artifacts, not normal UI.
- `Sumber & kredit` shows source title/publisher and visual attribution without printing large URLs.
- The selected persisted story is restored after refresh, Back returns to the catalog, and narration/voice/visual changes clear stale output.

## Post-change browser audit

- Chromium desktop completed the Nuri flow from catalog to preview, generation, playback, download and source inspection. Refresh restored the same sourced package, returning home cleared the state, and re-entry loaded the same Nuri narration without stale output.
- Mobile Chromium at 390x844 and 430x932 had no horizontal overflow in the catalog audit. In the selected-story view the generate action, narration and `Sumber & kredit` remained present and reachable at both sizes.
- Edge/Chromium opened the catalog successfully with the same labelled controls and READY-only archive behavior. A full second browser-engine render was not performed; container choice therefore remains capability-driven and honest (`.mp4` when AVC/AAC recording is advertised, otherwise `.webm`).
- Keyboard focus is visible, interactive controls have accessible labels, story imagery has alternative text, and native buttons/radios/checkboxes remain keyboard-operable.

## Nuri render measurements

The production default is 720x1280. Two measured Chromium renders completed with playable MP4 AVC/AAC output:

| Run | Visual plan | TTS | Render | Video duration | File size | Browser memory snapshot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 720 A | 1,466 ms | 492 ms | 31,043 ms | 29.61 s | 1,912,102 bytes | 29.9 MB |
| 720 B | cached plan | 133 ms | 31,144 ms | 29.63 s | 1,444,224 bytes | 18.4 MB |

An additional real 1080x1920 audit render completed in 31,247 ms, produced a playable 29.50-second MP4 of 2,076,464 bytes, and recorded a 17.8 MB browser-memory snapshot. Two remote visual assets failed and were replaced by labelled programmatic fallbacks, so 1080 remains experimental rather than the production default. Memory is a practical browser snapshot, not an operating-system peak measurement.

The final post-fix 720 run completed visual planning in 1,170 ms, cached TTS in 392 ms and rendering in 30,679 ms (31,071 ms from TTS start through render), producing a playable 2,280,102-byte MP4. Research loaded before generation and is measured separately in the audit manifest on fresh selection/restore.

## Honest launch state

- The product includes ten curated, locally packaged mystery examples.
- The configured persistent archive exposes exactly one independently researched READY package: Nuri. A legacy row carrying a stale READY label is excluded because it lacks the required duration and verification decision.
- A second archive golden story was not manufactured. The public UI states the actual persistent READY count.
