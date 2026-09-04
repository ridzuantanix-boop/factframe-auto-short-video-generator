# Pawarna P0 fixes

Based on audited commit `4dd939e7474c08558d2a9335de31e96672ab8a2f`, same branch `codex/pawarna-production-audit`. Not deployed; `GENERATION_ENABLED=false` remains unchanged. No real Google/Nexabot generation or Search calls in verification.

- **Prompt rules:** `src/lib/pawarna/locks.ts` is the sole source of global execution, product, visual, camera and language/audio locks. Settings compiler and compatibility adapter both include them. Old exported rule names are aliases. Voice OFF excludes spoken script/CTA; four scene beats and factual review remain.
- **Customer credits:** temporary Kredit Pawarna page and neutral review notice; no balance, estimates, payments or top-up. Public local/cloud factory responses no longer include the operational usage ledger. Private admin records retain it; historical financial errors are sanitised for customers.
- **Conditional research:** `src/lib/pawarna/research.ts` decides from confidence, uncertainty, variant/required facts, selected angle and explicit notes. Clear visual-led products save `observation_only`; unavailable Search remains `unverified`. Saved products are rechecked before planning when context requires new evidence; identical unavailable contexts are not replayed automatically. No extra research toggle or screen added.
- **Speech:** `src/lib/pawarna/speech.ts` targets 18–23 words including the exact CTA `Klik link kat bawah.` Natural/Soft Sell prefer 18–22 (cap 23); Energetic/Direct cap 24. Shorter natural scripts accepted without padding. Validation rejects repeated/altered/truncated CTA; retry feedback uses the same policy.
- **Copy only:** requested Home sentence, Gaya Video, Creator & Suara, Semak, Disyorkan, Pilih angle, Malay voice/aurat labels, Produk, Kredit, Saya. Internal IDs, CSS, cards, navigation structure and controls unchanged.

## Verification

- Unit tests: `node --import tsx --test tests/*.test.ts tests/pwa.test.mjs` (24 tests).
- Isolated local Cloudflare DO/R2 integration: `npm run test:cloud-integration`; mock Search skips clear identity, runs for uncertain identity; owner/idempotency/media/settings and no automatic paid replay checks retained.
- Type checks: `npm run check:cloud`, `node node_modules/typescript/bin/tsc --noEmit`.
- Builds: `npm run build:cloud`, `npm run build`. Changed-file ESLint check.
- Capture: `node scripts/audit-capture.mjs --p0` with external Playwright/Chromium/FFmpeg paths as in audit harness. Loopback-only API fixtures, all generation controls paused; no generate request sent by this screenshot run.

## Mobile screenshots — 390 × 844

| Screen | Capture |
| --- | --- |
| Home | [Home](audit/p0/01-home-fixture.png) |
| Gaya Video | [Gaya Video](audit/p0/04-video-style-fixture.png) |
| Angle | [Angle](audit/p0/05-angle-fixture.png) |
| Creator & Suara | [Suara](audit/p0/06-creator-voice-fixture.png), [Syariah/aurat](audit/p0/06b-subject-shariah-aurat-fixture.png) |
| Semak | [Semak](audit/p0/07-review-fixture.png), [details](audit/p0/07b-review-details-fixture.png) |
| Kredit | [Kredit](audit/p0/12-credits-fixture.png) |
| Produk | [Produk](audit/p0/10-projects-fixture.png) |

27 captures including full-page/extra states; [manifest](audit/p0/capture-index.json). Fixtures demonstrate UI, not AI video quality. No P1, bulk generation, billing or provider changes.
