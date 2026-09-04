# Pawarna native creator revision

## Implemented

- Existing logo, warm green/coral palette, mobile-first canvas, safe-area navigation with central Create, and sticky step action.
- Home, Projects, Create, Credits and Profile. Legacy `#videos`, `#app` and video links still resolve.
- Five-step product/style/angle/creator-and-voice/review flow. Eight style cards and eleven separate angle choices.
- Saved product projects: private original images, analysis, research, corrections, associated videos, used styles and angles. Existing video inputs can seed a project without another upload/research.
- Analysis is a separate explicit action before any paid video submission. Cloud product analysis is processed by the existing Durable Object alarm; local development uses a Next after-response task. Interrupted local analysis is marked failed after ten minutes, not silently replayed.
- Product function/audience are shown only when supported by readable packaging. Unknowns stay unverified. Editing identity invalidates earlier web evidence instead of treating user changes as verified facts.
- Versioned public-only PWA offline cache; no private images/videos, API responses or POST replay. Waiting app updates require explicit reload.
- Persisted `GenerationSettings`: product, style, angle, voice ON/OFF, gender/delivery, hands/creator, compliance/aurat and ten-second format. Invalid combinations rejected server-side.
- Modular master look, product lock, style, angle, voice, subject, compliance, aurat, timed scene plan, facts and notes. Voice OFF omits spoken script. Compliance OFF omits Shariah/aurat modules. No-hands omits anatomy/clothing instructions and prohibits people/reflections.
- Four concrete director beats (0–2, 2–6, 6–8, 8–10) validated before submission, plus factual review of script and scenes.
- Generate Lagi sheet changes actual settings and returns to Review. Reused avatars remain owner-checked and are used only for supported full-creator styles.
- Credits displays estimated recorded requests for the current session's recent jobs, not a fabricated account balance or confirmed net billing.

## Deliberate limits and safety

- Production `GENERATION_ENABLED=false` remains unchanged. No automatic paid retries. Existing accepted jobs can still finish without a new submission.
- Voice gender/delivery, ten-second direction, anatomy and clothing are prompt controls supported through the existing image-to-video request. They are not a separate deterministic speech/compliance engine or a guarantee of model output.
- Gemini Search access/quota issues remain external configuration limits. Fallback is explicit observation-only content, never fake successful research.
- Style recommendation is a category-based ranking using the AI product analysis, not an additional paid recommendation call.
- Public app with session isolation, no account login or cross-device sync. Unknown URL is not access control. Existing global video and analysis limits reduce abuse but do not replace authentication.
- Product analysis may use Gemini quota even while video generation is paused. Maximum 20 new product-analysis/project reservations per rolling day globally; no paid Nexabot call for analysis.
- No custom voice or dialect generation, advanced project management, retention cleanup or production video-render quality certification added.

## Verification

- Next production build, cloud Vite build, TypeScript and ESLint checked.
- Nineteen unit tests cover legacy pipeline, structured settings, modules, evidence invalidation, private fields, media ranges, idempotency and PWA cache behavior.
- Isolated Cloudflare Durable Object/R2 integration uses local fake Gemini/Search/Nexabot endpoints and test-only credentials. Verifies analysis before video, duplicate/owner protection, settings persistence, cached research reuse, avatar inputs, silent/no-hands/compliance-OFF prompt, MP4 transport/ranges, failed/uncertain submissions with no automatic replay.
- Browser checked at 360, 390, 430 and desktop 1280 widths: upload with a local test asset, saved product after reload, style recommendation, angle, voice/compliance OFF, review, mock completion, Generate Lagi sheet and changed-angle review, identity correction and invalidated research status.
- Mock MP4 is a transport fixture, not a visually rendered AI video. No real Nexabot credit was used for this revision's tests.
