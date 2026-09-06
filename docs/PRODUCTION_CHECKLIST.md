# FactFrame production checklist

Do not deploy until every required item is checked in the target environment.

## Database

- [ ] `DATABASE_URL` points to the production PostgreSQL instance; never commit the value.
- [ ] TLS is required with `DATABASE_SSL=require` and the provider certificate policy is understood.
- [ ] `DATABASE_POOL_SIZE` is within both application and provider connection limits (start at 5 for serverless).
- [ ] Migrations `001` through `006` complete against an empty database.
- [ ] Browse/search, source, claim, research-package, asset and visual-plan indexes exist.
- [ ] Automated backups, retention, restore test and incident owner are configured.
- [ ] Connection limits and pooling behaviour are monitored under concurrent requests.

## Required configuration

- [ ] `DATABASE_URL`
- [ ] `DATABASE_SSL=require`
- [ ] `DATABASE_POOL_SIZE`
- [ ] `GEMINI_API_KEY` (server-only; optional only when the large local voice fallback is acceptable)
- [ ] `GEMINI_TEXT_MODEL` and `GEMINI_TTS_MODEL` if overriding tested defaults
- [ ] `CRON_SECRET` for scheduled indexing; use a high-entropy secret
- [ ] `DEPLOYMENT_URL` for `npm run smoke:production`
- [ ] No secret uses a `NEXT_PUBLIC_` prefix

## Providers and jobs

- [ ] Wikimedia Commons, Wikidata/Wikipedia, Nominatim and OpenStreetMap tile access work from production.
- [ ] TTS quota, latency, budget alerts and provider failure fallback are tested.
- [ ] Discovery/indexing cron remains bounded to one category, one page/query, ten records and concurrency two.
- [ ] Follow-up verification is run in bounded batches only.
- [ ] Gemini mass enrichment is not enabled as an unattended production job.

## Security and cost control

- [ ] Expensive TTS, script and visual-planning endpoints return `429` after their documented limits.
- [ ] A shared production rate-limit store is configured if deployment uses multiple instances; the in-memory limiter is only per instance.
- [ ] Repeated identical TTS requests hit the server/client hash cache.
- [ ] Render asset URLs are restricted to approved HTTPS Wikimedia/OpenStreetMap hosts.
- [ ] API responses and logs contain no keys, authorization headers, full prompts or sensitive payloads.
- [ ] Dependency, secret and history scans pass before release.

## Product readiness

- [ ] The public catalog exposes READY packages only and reports the real count.
- [ ] Nuri golden path completes select → preview → generate → replay → download → sources.
- [ ] A second evidence-backed READY story is retrievable and generatable.
- [ ] 390×844, 430×932 and desktop layouts have no horizontal overflow.
- [ ] Chrome/Chromium and Edge/Chromium playback/container behaviour is recorded.
- [ ] Safari/iOS is not advertised until directly tested.
- [ ] OSM and Wikimedia attribution remains visible in export/source credits.
- [ ] `npm run smoke:production` passes against the intended deployment.

## Observability and rollback

- [ ] Structured events for research, follow-up, TTS and visual failures reach the production log sink.
- [ ] Alerts cover elevated 5xx/429 rates, database saturation and TTS quota failures.
- [ ] A rollback release is identified and the database migrations are additive/forward compatible.
- [ ] Production deployment protection and public access settings match the launch decision.
