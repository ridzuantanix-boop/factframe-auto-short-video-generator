# Pawarna mobile-first PWA

Implemented September 2026 on the existing local studio. Start with `npm run studio`, then open http://localhost:3100.

- Cipta, Video saya and App bottom navigation, hash-based deep links and browser Back support.
- Upload form stays mounted across screens; unsent files and instructions remain in memory. Refresh/closing the app still discards the draft.
- Mobile fixed Generate action, safe-area spacing, accessible touch targets, 16px form fields, reduced-motion support and responsive desktop layout.
- Next manifest with standalone display, Android icons, maskable icon, Apple touch icon and shortcuts. Rebuild icons with `node scripts/pwa-icons.mjs` after editing `public/icons/pawarna.svg`.
- Install prompt only when supported and requested by the user; otherwise Android/iOS installation guidance under App.
- Service worker caches only public icons and the static offline page. API responses, uploaded images and generated videos are not put in Cache Storage. No background sync, paid request replay or push notification permission.
- Updates wait for the user to choose reload; the app warns if an unsent draft exists. Polling pauses while hidden/offline; new generation requires internet.

## Checks

`npm run build`, targeted ESLint, `npm run test:factory` (4 tests), and `node --test tests/pwa.test.mjs` (3 tests). PWA tests execute the worker in an isolated VM, covering the public cache allowlist, explicit update activation, private/API/POST bypass and offline navigation fallback. These are not a substitute for real-device installation tests.

Browser verification: mobile Cipta/App screens, collection-to-result navigation and service-worker ready status; no paid generation submitted for PWA testing. Manifest, service-worker, offline page and icon endpoints return HTTP 200 locally.

## Installation / deployment

Android: Chrome menu → Install app / Add to Home Screen. iOS: Safari Share → Add to Home Screen (enable Open as Web App where offered). Availability depends on the browser and OS. Actual phone installation has not been verified.

Localhost is trusted for development but refers to the device opening it. A phone cannot reach this computer using its own localhost. Real phone use needs an accessible HTTPS deployment. This change does not publish the app, add SaaS authentication, migrate session history, or set up a public server. Browser and installed-app cookie storage can differ, especially on iOS; history may appear as a separate session. Do not clear site data expecting history to remain accessible without the original session cookie.

Production requires a persistent worker + private persistent SQLite/media storage, secrets set server-side, access control and rate limits before public launch. Gemini research quota limitations remain independent of PWA support.
