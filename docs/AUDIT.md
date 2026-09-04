# Pawarna — current implementation audit

> Baseline audit below describes commit `4dd939e7474c08558d2a9335de31e96672ab8a2f`. The branch now includes [P0 fixes](P0-FIXES.md), **not deployed**. Updated local mobile captures are in [audit/p0](audit/p0); original production captures remain unchanged.

## Production snapshot

- Live: https://pawarna-video-factory.ridzuantanix.workers.dev
- Source branch: `codex/pawarna-production-audit`. Cloudflare is deployed manually through Wrangler, not linked to a Git production branch. Remote `main` contains separate FactFrame work and was not overwritten.
- Deployment checked: `f6a4747b-e16c-4460-b3c1-cf8b37e41a98`. Live HTML/JS/CSS match the local cloud build byte-for-byte; asset and source hashes are in [capture-index.json](audit/capture-index.json). This is UI equivalence evidence, not an independent hash comparison of deployed server source.
- Audit prep changes only documentation/capture tooling. No redesign, copy changes, deployment, or paid generation.

## Routes

| Route / screen | Contents |
| --- | --- |
| `/#home` | Home and recent videos |
| `/#create` | Product upload/analysis → Style → Angle → Creator & Voice → Review (component state, not separate URLs) |
| `/#video-{jobId}` | Processing / result |
| `/#projects` | Products and selected product project |
| `/#credits` | Recorded request estimates |
| `/#profile` | PWA/install information |
| Legacy `/#videos`, `/#app` | Projects, Profile |

API entry points: `/api/factory`, `/api/products`, `/api/products/:id/corrections`, `/api/products/:id/media`, `/api/generate`, `/api/factory/jobs/:id/media`. Cloud also exposes `/api/health`.

## Important Source Files

| Area | Path |
| --- | --- |
| Home UI / create flow / all screen controls | `src/components/PawarnaGenerator.tsx` |
| Mobile layout | `src/components/pawarna-native.css` |
| Cloud / local entry | `cloud/main.tsx` / `src/app/page.tsx` |
| Style definitions / angle definitions | `src/lib/pawarna/settings.ts` |
| Voice / Hand / Creator / Shariah / Aurat settings | `src/lib/pawarna/settings.ts`; UI above; prompt modules in `src/lib/pawarna/director.ts` |
| Product Intelligence | `src/services/pawarna/intelligence.ts`, `cloud/products.ts` |
| Prompt Builder / Product Lock | `src/lib/pawarna/prompt.ts` |
| Pawarna Visual Master Lock | `src/lib/pawarna/director.ts` (`PAWARNA_VISUAL_MASTER_LOCK`) |
| 10-second Director | `src/lib/pawarna/director.ts`, `src/services/pawarna/intelligence.ts` (`scene_plan`) |
| Provider / Nexabot integration | `src/services/nexabot/provider.ts`, `cloud/factory.ts`; local `scripts/factory-worker.ts` |
| Credit records (not billing) | `cloud/factory.ts`, `src/lib/pawarna/store.ts`; Credits UI above |
| Project persistence / public fields | `src/lib/pawarna/projects.ts`, `cloud/products.ts`, `cloud/utils.ts` |
| PWA | `src/components/usePwa.ts`, `public/sw.js`, `src/app/manifest.ts` |

## Current Status

- Implemented: mobile PWA, five-step flow, saved product projects/corrections, product analysis, settings validation, modular prompts, provider pipeline, processing/result/download UI and session-isolated storage.
- Research depends on Gemini Search access/quota; fallback is explicitly unverified and image-observation-only. Product analysis can consume Gemini quota even while video generation is paused.
- Voice, creator, Shariah/aurat and timing are prompt controls, not deterministic voice/compliance engines or guaranteed output. Style recommendation is category-based ranking.
- Not connected/implemented: actual provider balance/refund reconciliation, payment/top-up system, account login/cross-device sync, separate custom voice engine.
- Paid generation remains disabled in production (`GENERATION_ENABLED=false`); automatic paid retries are disabled. No real Gemini/Nexabot generation requests were made for this audit.
- Mock only in audit harness: product/analysis/research/job/credit records and labelled local video. Mock captures demonstrate current UI states, not successful AI output or live credit deductions.

## Screenshots

All primary captures are **390 × 844**. `-full.png` companions are full-page at width 390. `06b/06c`, `08b`, `09b` show lower controls/stages/actions. Source and failures are recorded in [capture-index.json](audit/capture-index.json).

| Screen | Capture |
| --- | --- |
| Home (live) | [01](audit/01-home-live.png) |
| Upload/Create Product (live, no upload submitted) | [02](audit/02-create-upload-live.png) |
| Product Analysis (fixture) | [03](audit/03-product-analysis-fixture.png) |
| Video Style (fixture) | [04](audit/04-video-style-fixture-full.png) |
| Angle (fixture) | [05](audit/05-angle-fixture.png) |
| Creator / Voice / Shariah / Aurat (fixture) | [06](audit/06-creator-voice-fixture-full.png) |
| Review (fixture) | [07](audit/07-review-fixture-full.png) |
| Processing (fixture) | [08](audit/08-processing-fixture-full.png) |
| Result (fixture) | [09](audit/09-result-fixture-full.png) |
| Projects / Product Project (fixture) | [10](audit/10-projects-fixture.png), [11](audit/11-product-project-fixture.png) |

Capture harness: `scripts/audit-capture.mjs` (Playwright; set `AUDIT_PLAYWRIGHT_MODULE`, `AUDIT_CHROMIUM` and `AUDIT_FFMPEG` for external installations). FFmpeg encodes a silent, labelled still-image fixture locally. Live browsing permits same-origin GET only; fixture browsing permits loopback only. No live upload, research or generation submission.
