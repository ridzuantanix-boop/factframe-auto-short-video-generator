# Pawarna local video factory

This implementation is a working local studio workflow, not a launched multi-user SaaS. It replaces the earlier demonstration screen. No fake Pawarna balance or non-functional login is shown.

## Run

Use Node 22.18+ with built-in SQLite. In this project directory:

1. `npm install`
2. Put `GEMINI_API_KEY` and `NEXABOT_API_KEY` in `.env.local`, not `.env.example`.
3. `npm run studio` starts the app (port 3100) and worker together. Or run `npm run dev` and `npm run worker` in separate terminals.
4. Open http://localhost:3100. Upload 1–5 product photos and optionally one creator avatar. Click Generate Video.

The worker is a separate process. It keeps processing when a browser tab closes. Restart the worker after environment changes. The Next development server reloads its own environment automatically.

Google Search quota (HTTP 429) or temporary unavailability (503) triggers an explicitly labelled observation-only fallback: no search sources are invented, and only visible features may enter the script. The app displays the failed-research reason outside the collapsed source panel. To enable complete web research, the Gemini account needs available Google Search quota. Vision and text calls retry transient failures at most twice.

## Pipeline

Product vision → grounded Google Search → 20–26 word Malay plan → claim audit → modular video prompt → Nexabot i2v → polling → private MP4 storage → player/download/history.

All product images go to Gemini vision unchanged. Product identity ambiguity is recorded. Unsupported search claims are not treated as verified facts; scripts must pass an AI claim audit. This reduces, but cannot guarantee elimination of, misidentification or AI errors.

The optional avatar goes to Nexabot as the final reference, never to product recognition or web research. Nexabot accepts 1–3 i2v images: up to 3 selected product references, or up to 2 plus avatar. The analysis chooses reference indices from uploaded photos. No image compositing or product alteration is performed.

## Nexabot contract checked from https://nexabot.id/api-docs

- POST `/api/v1/api`; `x-api-key` auth; JSON `mode: i2v`, `prompt`, `ratio: 2`, `media: [base64 data URIs]`.
- HTTP 202 + `job_id`; GET `/api/v1/jobs/:id`; queued / processing / done / failed.
- GET `/api/v1/jobs/:id/download` with same API key; MP4 stored privately.
- No documented model/duration/audio fields or webhook support: those are not invented. Duration and speech are prompt instructions, so actual length, audio quality and avatar likeness remain model dependent.
- Documented cost 0.5/request and refund on failure; configurable estimate, actual accepted request cost stored. Retry only once after an explicitly failed external job.
- Ambiguous submission or a 25-minute timeout never automatically repeats a paid POST. Check provider job before manual retry. Temporary status/download errors retain the same external job.

## Persistence and access

`.pawarna/factory.sqlite` stores jobs, product analysis, reference photos, research sources, content plan, external IDs, estimated/request cost and stage log. `.pawarna/*.mp4` stores results. This folder is ignored by git. Back it up to preserve data. A private HTTP-only cookie scopes history and downloads to the local browser session (90 days); clearing cookies loses access to that session's history. This is not email/password authentication.

Client supplies only input and a per-action idempotency key; scripts/prompts and provider mappings are built on the server. Private media routes enforce ownership. Image MIME and decoded format/size are validated. Duplicate requests with the same key reuse a job; input mismatch is rejected. Regenerate reuses the validated plan; Another Angle keeps product analysis/research but requests a new hook and approach.

## Before public SaaS deployment

Email auth, PostgreSQL/Supabase migration, shared object storage, admin, atomic customer-credit ledger/refunds, account rate limiting and hosted worker supervision from the original brief remain separate unfinished work. Do not expose this local version as a public paid service. The local durable worker/SQLite setup assumes a single machine, not stateless serverless replicas.

No production result or cost claim should be made solely from fixture tests. Use `npm run test:factory`, `npx tsc --noEmit`, then a real image generation to validate provider availability.
