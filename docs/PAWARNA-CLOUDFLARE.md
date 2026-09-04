# Pawarna Cloudflare deployment

Public URL: https://pawarna-video-factory.ridzuantanix.workers.dev

The owner explicitly requested public access without login, after being warned that an unknown URL is not access control. Search indexing is discouraged, but anyone with the URL can generate at the owner's provider expense. This is a bounded public MVP, not a multi-user billing SaaS.

## Runtime

- The existing React PWA is built with Vite for Cloudflare static assets; the original local Next app remains available with `npm run studio`.
- `cloud/worker.ts` handles secure cookie sessions, same-origin writes, security headers and forwarding to the private Durable Object binding.
- `cloud/factory.ts` uses SQLite-backed Durable Object storage for metadata, atomic idempotency/rate counters and durable alarms for generation phases. No local daemon, filesystem, D1 database or external VPS is required.
- Private R2 bucket `pawarna-video-factory-media` stores inputs, thumbnails and MP4s. No public bucket access was enabled. Media endpoints verify the hashed session owner and support HEAD/byte ranges.
- Gemini model is `gemini-3.1-flash-lite`; API keys are Worker secrets. The new local Gemini key was confirmed to access the model through its read-only metadata API. This does not prove its Google Search quota.
- The original prompt rules and Nexabot i2v adapter are shared with the local app. Automatic paid retries are now disabled, including for explicitly failed provider jobs. An ambiguous/crashed submission cannot automatically replay. The `submitting` checkpoint is persisted before the paid request.

## Operational limits

The video result screen includes **Salin info job** with app job ID, Nexabot ID, status, UTC creation/update times, retry count and research status. It copies only an explicit allowlist (no keys, cookie, images or prompt). A selectable-text fallback and visible IDs support standalone iOS PWA troubleshooting. This UI update does not resubmit or modify existing jobs.

- 3 active jobs globally, 20 new jobs and at most 20 Nexabot submissions per UTC day (including automatic retries). These are configurable guards, not authentication or a monetary billing cap; Gemini calls and infrastructure storage also have their own costs.
- 10 submission attempts/minute/IP; resetting the browser cookie cannot bypass global counters.
- 1–5 product images plus optional avatar; 5 MB/image, 12 MB total in cloud to bound Worker memory. 40 megapixels maximum per image. Inputs are not resized. Cloud validation checks file signatures/dimensions; Gemini can still reject a malformed image payload.
- MP4 downloads are bounded to 32 MB in cloud; larger outputs are not saved and the job ultimately reports an uncertain timeout instead of submitting again.
- Metadata/media are retained until an explicit retention feature or deletion is implemented. Watch R2 storage and provider usage. No automatic deletion of user media was configured.
- Cloud/local browser histories are separate. Old local photos, videos and session cookies were not migrated. Clearing browser site data loses access to that session's history; there is no account recovery/login yet.

## Commands

```text
npm run build:cloud
npm run check:cloud
npm run test:cloud
npm run test:cloud-integration
npm run secrets:cloud
npm run deploy:cloud
```

`scripts/cloud-secrets.mjs` reads only GEMINI_API_KEY and NEXABOT_API_KEY from `.env.local` and pipes them directly to Wrangler. It does not create a secret file or log their values. The Vite build uses an explicit public-asset allowlist; legacy WASM, local SQLite/media, `.env` and testing outputs are excluded. GENERATION_ENABLED is currently `false` at the owner's request. This rejects new jobs and stops queued, not-yet-submitted jobs before provider submission. Already accepted provider jobs continue status polling/download and can still incur provider charges. Local worker was also stopped.

`scripts/cloud-audit.mjs` provisions a random server-only PAWARNA_ADMIN_TOKEN, retrieves a read-only allowlisted job/attempt report, then rotates the credential. The public admin URL returns 404 without the token. The report excludes session owner tokens, photos, prompts and storage paths. There is no public reset/resume/delete endpoint.

`GEMINI_API_BASE_URL` exists solely for isolated local mock testing. Never set it in production unless intentionally changing the Gemini API destination. The integration script disables dotenv loading and uses only test keys on loopback addresses.

## Verified

- 11 unit tests: cloud image validation, ranges, private-field filtering, request bounds, existing local idempotency/provider/prompt tests and service-worker cache policy.
- Cloud Worker type check, targeted lint, Vite production build and Wrangler dry run.
- Real local Cloudflare runtime, SQLite Durable Object alarms and R2 with mock Gemini + Nexabot: image/avatar analysis, grounded evidence, script audit, MP4 storage/download/ranges, duplicate concurrent POST, changed-input conflict, ownership isolation and uncertain POST no-replay. No paid calls during this test.
- No real paid video was generated as part of deployment verification. Actual provider availability, credit balance and research quota remain dependent on the configured accounts.

Cloudflare services may bill usage after plan allowances. R2 subscription was activated by the user in the dashboard; the agent did not accept billing terms or enter payment details.
