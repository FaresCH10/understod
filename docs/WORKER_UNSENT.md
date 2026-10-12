# Worker Unsent Work

Explicit opt-in tab text snapshots now recover exact-version answer/help text
and saved pending receipt IDs after reload. They cannot overwrite newer text or
an unsent recording. Remove is available on briefing/device screens. Plaintext
browser storage is not an encrypted vault or durable audio/offline outbox; see
`WORKER_TEXT_DRAFTS.md`. Historical page-memory-only statements below exclude
this new explicit text snapshot.

Manual request receipt lookup now verifies the last attempted request per kind
without POST or draft clearing; accepted, missing and unavailable states have
built-browser checks. Tracking is page memory unless explicitly included in a
saved text snapshot; neither is a private audio outbox. See `WORKER_REQUESTS.md`.

Request follow-up: bounded opaque-context tab identities now fail closed on
storage corruption/capacity/readback failure. Malformed success receipts retain
text and show a focused localized uncertainty warning; exact retries reuse their
request ID. This stores identifiers only, not recoverable drafts/audio. See
`WORKER_REQUESTS.md` for final tests/browser evidence and outstanding identity gates.

The worker recorder loads on demand behind an English/Arabic/Urdu Suspense and error boundary. A failed recorder download does not remove the rest of the page or the typed-answer controls. Failure wording does not claim that an unsent recording survived an unexpected runtime error. The latest production build has a 495.24 kB main chunk (133.44 kB gzip) and 13.80 kB recorder chunk (5.41 kB gzip), without increasing warning thresholds. Activity history also loads lazily behind the existing view boundary (6.55 kB / 2.14 kB gzip).

Back and End session require a localized confirmation while typed answers, help text or a pending/requesting/recording/preview/upload phase remain unsent. Switching to typing warns only about audio that will be discarded; typed/help text retained in the parent does not cause an unnecessary mode-change warning. Buttons cannot initiate leaving or a mode change during a submission. Cancel/Escape preserve drafts and return focus; the existing dialog focus helper traps Tab. A native beforeunload handler is registered while unsent work or an upload exists, but native dialog behavior varies by browser and is not runtime-certified here.

During a loading refresh, an already loaded exact assignment with unsent work remains mounted. Transient network/5xx refresh failures also retain that exact assignment, with a localized error/manual recheck and disabled answer/help sending and recorder start/send until a successful read. Permission and other 4xx failures do not retain protected detail; session failures still lock through `WORKER_SESSION.md`. Old assignment data is not shown for a different ID. This does not yet cover every successful response-changing refresh or server conflict. Audio remains memory-only: this is not a durable offline outbox or closed-tab guarantee. Session transitions intentionally clear unsent memory rather than preserve it under another identity.

Same-page hash/browser-back changes consult the existing confirmation before changing the mounted worker route. Cancellation retains drafts. Confirmation allows the chosen route once. Busy submissions hold the route without a discard dialog and disable typed answer/help editing, preventing a changed draft from being cleared by an earlier receipt. Logout success leaves the worker route; failure keeps both work and normal leave protection. Hash restoration pushes the protected route into history: this deliberately does not promise exact forward/history-stack preservation. Full-document/external navigation relies on the native beforeunload handler, not this guard. Actual native dialogs, hardware audio, durable offline/resume and complete conflict recovery remain unfinished.

Refresh follow-up verification on 2026-10-07:

- Five focused checks pass. Full suite 61259 terminal: 371 tests, 368 passed, zero failed, three external PostgreSQL skips (101.81 seconds); strict TypeScript/Vite build passes without warning.
- `detail-fail` serves the actual built client, fails only the second synthetic detail GET, then allows manual recovery. EN preserves exact typed answer/help, AR preserves help and observed recorder view, UR preserves its typed answer. Sends are disabled on failure and reenabled after successful refresh; no POST. AR/UR document width 305px at 320px viewport.
- `detail-deny` returns 403: protected headings/recorder/forms are absent until a fresh permitted recheck. No stale-content permission bypass is claimed.
- Evidence endpoint: workerPosts 0, logoutPosts 0, attempts 0, recordings 0. Fixture 58887 stopped, tab closed, viewport reset; main 28667 stays intentionally running. No backend edits/restart, real data, microphone or provider call.
- Screenshots: `artifacts/deletion-ui/worker-refresh-failure-en.jpg`, `worker-refresh-failure-ar.jpg`, `worker-refresh-failure-ur.jpg`. This verifies typed/help and idle-recorder UI, not hardware preview preservation.

Navigation follow-up verification on 2026-10-07:

- Full suite 24265 terminal: 370 tests, 367 passed, zero failed, three external PostgreSQL skips (98.04 seconds). Strict TypeScript/Vite build passes without warnings.
- Pure navigation tests cover same routes, unsent confirmation and busy holds. Worker session validation also rejects malformed mode/expiry/worker identifiers before mounting worker UI.
- Built English browser Back/hash/cancel/confirm and Urdu hash/cancel/confirm checks preserve exact drafts on cancel, then leave once on confirmation. The successful logout hash race found in browser QA was repaired and final-built success/rejection retested.
- An eight-second fixture-held answer is rejected before the API handler: answer/help fields and leaving controls stay disabled; same-page navigation holds; the exact answer remains editable after failure. Final fixture evidence: workerPosts 1, logoutPosts 2, attempts 0, recordings 0. No actual microphone or provider call.
- Named audit-chunk rejection renders Activity view unavailable inside the staff shell; a fresh unblocked document loads real activity filters/events. Screenshots: `worker-browser-back-en.jpg`, `worker-logout-rejection-guard-en.jpg`, `worker-held-rejection-final.jpg`, `audit-chunk-failure.jpg`, `audit-built-success.jpg` under `artifacts/deletion-ui`.
- Fixture 30415 was stopped and temporary tabs closed. Main handle 62307 disappeared after continuation; no listeners remained on 3020/3021. Preview restored as 28667, health synthetic-demo; selected worker/assignment/publication/recording/deletion/notice hashes, integrity and FKs match before/after. Sessions are not included in this unchanged-data claim.

Whole-build estimate approximately 63%, not production readiness. Earlier verification below is historical.

Verification on 2026-10-07:

- Full synthetic suite: 366 tests, 363 passed, zero failed, three external PostgreSQL skips (73.61 seconds); strict TypeScript/Vite build passes.
- `tests/worker-unsent.test.mjs` checks capture phases, leave-versus-mode warning conditions, whitespace and localized text.
- `node scripts/deletion-browser-fixture.mjs --built` serves the actual compiled client over an in-memory synthetic API. Named `recorder-fail` scenarios reject only its recorder chunk. EN/AR/UR errors and fresh successful notice/recorder load are observed; typing remains enabled and no answer is sent.
- Built browser warning checks cover unsent answers/help, Back/End-session cancellation, typed text retained across mode changes, initial focus, Shift+Tab wrap and Escape return. EN/AR fit at 390px; Urdu at 320px (dialog 281px, document 305px). No actual microphone, recording/upload or destructive confirmation was executed.
- Screenshots: `artifacts/deletion-ui/recorder-chunk-failure-en.jpg`, `recorder-chunk-failure-ar.jpg`, `recorder-chunk-failure-ur.jpg`, `recorder-built-success.jpg`, `worker-unsent-en-mobile.jpg`, `worker-unsent-ar-mobile.jpg`, `worker-unsent-ur-narrow.jpg`.

Both disposable fixtures were stopped and QA tabs closed; viewport reset. Main synthetic preview remains at 3020/3021. No existing local data, privacy policy or real provider was used. Whole-build estimate remains approximately 61%, not production readiness.
