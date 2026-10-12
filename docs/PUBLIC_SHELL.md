# Public application shell

## Implemented, 2026-10-07

The optimized build generates `dist/sw.js` from the exact SHA-256 hashes of 23 public build files. Only index HTML, the manifest, favicon, 192/512 PNG icons and emitted JavaScript/CSS are included. Installation fetches anonymously and rejects changed bytes, HTTP failures and redirects before opening a cache. Failed writes remove the incomplete cache.

The service worker handles only same-origin GETs without query strings or Authorization headers. Protected API/audio routes, access-link queries, external URLs and writes bypass it. Root navigation is network-first with public HTML fallback for network/5xx failures, not 4xx responses. Runtime misses do not add cache entries. Activation removes only earlier `understood-shell-v1-` caches. Updates wait for existing clients rather than forcing a reload that could discard unsent work.

The worker device view includes EN/AR/UR connection and public-shell status, exact session expiry, native install availability and explicit public-cache removal. Removal unregisters only this application's root worker and deletes its public-cache namespace; the current document may remain controlled until it is reloaded or closed. It does not delete private recordings, sign out, uninstall an OS app or remotely erase a device. Installation is offered only when the browser emits its native install event. Development does not register a service worker.

## Executed evidence

- Eight focused Node/VM checks execute the generated worker: anonymous verified installation, partial-install cleanup, HTTP/redirect failures, scoped activation, private-route bypass, network/5xx fallback, 4xx preservation, runtime no-write and manifest restrictions.
- Strict TypeScript/Vite build passes without a chunk warning. Main chunk 499.71 kB / 134.71 kB gzip; device chunk 5.78 kB / 2.39 kB gzip. Independent readback verifies every generated manifest hash against final output.
- Disposable built-browser EN/AR/UR device views report the shell ready. 320px views fit at 305px content width without horizontal overflow; RTL is present for Arabic/Urdu. A two-row small-screen worker header fixes the additional device-button overflow.
- During a fixture-only root/API 503 outage, the cached app opens the generic session-unavailable state and exposes no worker workspace. This is an HTTP outage check, not a physical airplane-mode or OS installation certification.
- A rejected device JavaScript download stays inside the localized error boundary. Back reaches the actual inbox; a fresh successful load reaches the device view. Public-cache removal displays its reload limitation. Fixture counters remain zero for worker/logout POSTs, attempts and recordings. No microphone or provider operation occurs.
- Final regression run 81955: 379 tests, 376 passed, zero failed, three external PostgreSQL skips, 105.15 seconds. Fixtures 92016/94263 stopped, temporary tabs closed, viewport reset and main synthetic staff preview 28667 restored.

Screenshots: `artifacts/deletion-ui/worker-device-en.jpg`, `worker-device-ar.jpg`, `worker-device-ur.jpg`, `worker-device-final-desktop.jpg`, `worker-device-download-failure.jpg`, `public-shell-outage.jpg`.

## Remaining gates

This is not private offline functionality. No protected briefing, answer or recording is persisted by this cache. Opt-in bounded private storage/outbox, same-worker/session/version/expiry isolation, reconnect authorization and conflict recovery, shared-device choices and real device/install/background behavior remain required. The browser can evict caches; prepared status is not a guarantee of future storage or connectivity. Full S25/A07/M4 readiness remains partial.

The deployment must serve the exact public files and `/sw.js` at root over HTTPS, with correct MIME types, no personalized HTML and no immutable caching for the worker script. Preserve old hashed assets through rolling deployments and test updates without losing drafts. Subpath deployments are rejected by the build helper. No cloud hosting has been provisioned or certified.

Lifecycle/install behavior follows the primary documentation: [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [MDN PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), and the [Vite build plugin hooks](https://vite.dev/guide/api-plugin.html).
