# Pawarna — Controlled Test Plan

Status: **prepared, not executed**. Owner manually selects real products and submits each video. No bulk run or automatic real generation.

Reference Preprocessing V1: Nexabot's request contract has no crop/mask field, so high-confidence screenshot crops are prepared before submission with Cloudflare Images `trim`, using original pixels only. Clean, uncertain, overlapping-UI, invalid-region and transform-failure cases retain the complete original. Sanitized references are stored separately, auditable by hash, and sent instead of—not alongside—the screenshot. No generative redraw is used.

Approved P0 commit `7782cdd6bca562b309787fb233e58589198b2688` was deployed first as Worker version `7f26ddcd-d922-441d-b968-1731e64c316a`. Controlled-mode deployments carry the implementation Git commit in their Worker version tag/message. Live verification script: `scripts/verify-controlled-live.mjs` (auth, public denial, UI, offline PWA, asset hashes; no authorized generation request).

## Access and safety

- Current owner-approved production configuration is `GENERATION_ENABLED=true`; Controlled Test Mode remains available separately for owner diagnostics and its permanent capped counter.
- Open `/owner-test` (also linked from Saya) in the same browser/PWA session as the product library. Enter the server-configured token, never in a URL. It issues a fresh `__Host-` HttpOnly, Secure, SameSite=Strict test cookie bound to the existing product-library session for 12 hours; the public cookie alone cannot inherit testing privileges. Token is never stored in client JS/localStorage. Logout revokes that session; rotating the Worker secret revokes every grant, including queued jobs not yet submitted.
- Production token lives in Worker secret `PAWARNA_TEST_TOKEN`. The owner's local, Git-ignored access file is `.pawarna/owner-test-access.json`. Never commit/share it. `scripts/provision-test-access.mjs` provisions it without printing its contents.
- Permanent hard limit: **10 provider attempts total**, shared across owner sessions. Pending reservations also consume available slots. No daily reset, counter reset endpoint, hidden retry or failed-attempt refund. A submission checkpoint is counted before network I/O; a crash at that boundary conservatively consumes a slot even if delivery cannot be confirmed.
- Validation/planning failures before submission do not consume an attempt. Failed/uncertain provider submissions do. No automatic paid retries. Same idempotency key returns the same job, including at the cap.
- New AI product analysis is also owner-only while public generation is disabled; public image previews remain available. No public Gemini/Search quota backdoor. Owner analysis still uses Gemini quota independently of the video-attempt cap; do not submit analysis until ready.
- Emergency stop: set `PAWARNA_TEST_GENERATION_ENABLED=false` and deploy; keep `GENERATION_ENABLED=false`. Already accepted jobs can finish via status/download, without new submission.
- Owner-only JSON log: `GET /api/test/jobs`. Evaluation: `POST /api/test/jobs/{job-id}/evaluation`, same-origin authenticated session, JSON scores 1–5 or null, notes up to 4,000 characters. Only completed test jobs accept ratings. No analytics/payment dashboard.

## Suggested ten manually selected cases

All use 10 seconds / 9:16. Confirm style compatibility and visible evidence first; replace unsuitable cases, do not force a demonstration.

| # | Product | Style | Angle | Voice | Subject | Syariah / aurat | Primary check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Book | Close-Up Detail | Curiosity | Female Malay / Soft Sell | Female hands | ON / full | Closed book, exact cover/title, no invented pages |
| 2 | Bottle/supplement packaging | Product Motion | Discovery | Male Malay / Natural | No hands | ON / full (no person) | Bottle/cap proportions, no medical claims |
| 3 | Beauty/skincare | Real-Life Use | Ciri → Manfaat | Female Malay / Soft Sell | Female creator + adult avatar reference | ON / full | Avatar identity, exact packaging, only verified usage |
| 4 | Gadget/accessory | POV Demo | Mudah | Male Malay / Terus | Male hands | ON / standard | Supported mechanism only, scale and grip |
| 5 | Kitchen product | Satisfying Demo | Situasi guna | Auto / Bertenaga | Female hands | ON / full | Physically plausible handling, no invented performance |
| 6 | Cleaning product | Problem → Solution | Masalah | Male Malay / Natural | Male creator | ON / standard | No fake before/after or unverified results |
| 7 | Fashion/bag | Mini Commercial UGC | Relatable | Female Malay / Natural | Female creator | ON / full | Smartphone look, material/colour and clothing |
| 8 | Small handheld product | Doodle UGC | Cadangan | Auto / Bertenaga | Male hands | OFF / null | Correct fingers, only simple doodle lines, no text |
| 9 | Very readable label | Close-Up Detail | Auto | **OFF** | No hands | OFF / null | Observation-only, immediate motion, silence/no spoken CTA |
| 10 | Less certain identity | POV Demo (closed showcase if use unverified) | Keraguan | Male Malay / Terus | Male hands | ON / full | Conditional Search, uncertainty preserved, no guessed claims |

Manfaat may replace case 3's angle if exact-product benefit evidence exists. Ten cases cannot cover all eleven angles; product suitability takes priority. Avatar is used only in a compatible creator style, as the final reference, within the existing provider image limit.

## Evaluate every output

- Product: exact shape, packaging, proportions, label/logo; no elongation, widening, oversizing or invented surfaces/parts.
- Opening: actual motion immediately, no uploaded still, screenshot or slideshow intro.
- Visuals: bright, clean, sharp flagship-smartphone UGC; no yellow cast, grey wash, AI softness, heavy bokeh or fake studio look.
- Anatomy: correct fingers/grip, realistic product scale, no floating/deformed limbs.
- Voice ON: Malaysian Malay without Indonesian drift, natural pace/gender/delivery; script exactly once, full words, no extra lines or truncation.
- CTA ON: clearly completes **“Klik link kat bawah.”**, never “Klik pautan.”, before ending. Voice OFF: no dialogue/singing/lip movement/captions; mark spoken-script/CTA scores null.
- No generated subtitles, random letters, CTA graphics or fake UI; physical label printing stays faithful.
- Style/angle visibly match the selected controls. When Syariah ON, verify clothing/aurat and no inappropriate accessories/exposure.
- Record actual clip duration manually in notes if available; `actual_duration_seconds` remains null unless measured. Requested duration is not proof of rendered length. Elapsed processing time is logged separately.

## Evaluation JSON

```json
{
  "product_fidelity": null, "product_scale": null, "first_frame": null,
  "ugc_realism": null, "brightness_sharpness": null, "hands_anatomy": null,
  "voice_naturalness": null, "script_completion": null, "cta_completion": null,
  "shariah_aurat": null, "style_accuracy": null, "angle_accuracy": null,
  "overall": null, "notes": ""
}
```

Use 1 = unusable, 3 = needs improvement, 5 = strong; null = not applicable/not reviewed. Log defects with timestamps. After each failure, inspect the same job before deciding whether to spend another slot. All ten checklist items remain **not run**.
