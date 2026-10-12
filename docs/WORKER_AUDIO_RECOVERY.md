# Worker Audio Recovery

Checkpoint: 2026-10-07. One opt-in encrypted browser recording now survives a
reload in the same verified session and exact assignment/publication/version.
This is not a general offline outbox, background uploader or production sign-off.

## Cleanup Boundary Follow-Up

Cross-tab follow-up, 2026-10-08: successful audio replacement/removal broadcasts
only the literal `changed` on a native BroadcastChannel. No worker identity,
context, key or recording bytes are sent. The saved-panel listener immediately
invalidates its preview/status and rereads storage; revision checks reject
obsolete asynchronous reads. Unsubscribe closes the channel, and unavailable
BroadcastChannel degrades without breaking storage. This signal never uploads.

Disposable native synthetic-tone fixture 6140 used real IndexedDB, nonextractable
AES and two same-session tabs. One original audio POST committed before its
acknowledgement was lost and the publication withdrawn. Both tabs restored the
saved preview. Explicit Remove in the second tab cleared the untouched first
tab's preview and disabled Send/Check receipt. Evidence stayed one POST, one
recording and one receipt, with the publication withdrawn. No extra upload,
hardware microphone or optimized/native-capture certification is claimed.
Screenshot: artifacts/audio-recovery/cross-tab-removed-ur.jpg. Two channel tests
pass; suite 14763 passed 415 of 418 tests with three external PostgreSQL skips.
Later notification suite 15586 supersedes it: 420 of 423 passed, no failures.

Fixture 6140 stopped, both native tabs closed, 3188/3189 verified empty, and its
exact disposable temporary audio root was removed after shutdown. Eight selected
main business hashes/integrity/FKs remain unchanged. General cross-browser,
hardware, shared-device race and complete offline-outbox gates remain open.
Earlier service IDs and evidence below are historical.

Credential evidence added 2026-10-08: disposable optimized fixture 10359 ran with
`--built --credential`, memory-only seeded accounts/grants and disabled email.
Switching from an authenticated Urdu worker to an unused synthetic worker link
confirmed logout, then stopped on denied IndexedDB cleanup. The link remained
unredeemed: zero sign-in/worker POSTs, attempts or recordings. Restoring storage
and explicitly removing local data preserved the original token; one subsequent
redemption opened the intended new worker. Signed-out staff login after reload
also sent no authentication request while cleanup was denied, then succeeded
once after explicit removal using disposable synthetic credentials.
Screenshots: `credential-worker-switch-denied-320.jpg` and
`credential-login-reload-denied-320.jpg`. The first credential fixture launch
failed before listening because demo auto-seeding does not run in credential
mode; explicit in-memory seeding fixed the harness without changing production
seeding behavior. The final application/build is unchanged from suite 45004.

Fixture cache was removed, QA tab closed and viewport reset. Its later process
handle was missing; authoritative port inspection confirmed it was stopped, not
an observation timeout. Main 32358 was also stopped, so it was restored as 66921
on 3020/3021 with synthetic AI and email disabled. Eight selected saved business
hashes, integrity/FKs and all 29 public build hashes were reverified. Credential
cleanup paths now have browser evidence; hardware, cross-browser storage and
general shared-device race certification remain open. Earlier runtime identities
below are historical.

2026-10-07 20:35 UTC: failed local cleanup now blocks all new sign-in actions
until explicit removal succeeds. Both synthetic-profile and credential sign-in
recheck local cleanup before authentication, including after reload when the
page warning is no longer present. An in-flight authentication guard also covers
logout/removal. Confirmed logout preserves the previous interface language for
its cleanup warning and does not display the generic Saved toast.

The optimized fixture 85523 injects an explicit, disposable IndexedDB-open denial
before the real built application loads. This intentionally modified QA HTML is
not a production asset. Final entry `index-C0SrhwjA.js` showed persistent Arabic
and Urdu RTL warnings at 320px, disabled profile sign-in, failed-removal warnings
and no misleading logout success toast. After reload an attempted sign-in still
caused zero authentication POSTs, zero worker POSTs, zero attempts and zero
recordings. Restoring storage through the visible QA control did not itself
clear the warning; explicit Remove did. Only then did one synthetic sign-in
open Worker 029. Screenshots: `cleanup-denied-ar-320.jpg`,
`cleanup-denied-ur-320.jpg`, `cleanup-denied-reload-320.jpg` in the artifact folder.

Final suite 45004: 416 tests, 413 passed, zero failed, three external PostgreSQL
skips, 78.05 seconds. Strict final build passes: main 499.26 kB / 135.06 kB gzip;
all 29 public hashes match. Earlier 42381 had the same totals before only the
logout-toast correction. Fixture 85523 is stopped, its public cache was recovered
then removed through the device UI, QA tab closed and viewport reset. Main 32358
remains live, selected business hashes/integrity/FKs unchanged. This checks the
synthetic-profile failure path, not credential-mode browser sign-in, hardware
capture, cross-browser storage or general shared-device race certification.
Earlier checkpoint evidence below remains historical.

## Storage And Authority

`worker-audio-draft.ts` uses native IndexedDB and nonextractable AES-GCM keys.
The envelope binds an opaque session context and revision as authenticated data;
encrypted metadata binds the original submission ID, capture time, session
expiry, assignment, publication, version and language to canonical mono 16 kHz
PCM WAV bytes. Strict bounded metadata and WAV validation precede restoration.
The key is stored alongside ciphertext: this limits accidental plaintext exposure,
not same-origin script access. Browser storage is not a secure vault.

Saving requires explicit consent, an active unchanged session and a device the
worker controls. The single slot cannot overwrite another request or briefing.
Transactional compare-and-replace and decrypted readback must succeed before
the UI claims a saved copy. Storage denial, corruption, discarded writes and
competing writes fail closed. Saving never submits a response.

Expiry is the earlier of the original session expiry and capture time plus
24 hours. Restore and send reject expired records; a mounted timer hides the
preview and rechecks expiry. This is a logical access limit, not a promise of
scheduled physical erasure on a closed, offline or backed-up device.

Changed worker/context/language/session expiry cannot restore the old copy.
Human Remove clears the device slot, including foreign or corrupt copies.
Confirmed logout cleanup is scoped to the old context so a late operation cannot
erase a new worker's copy. Text and audio cleanup are attempted independently;
failure leaves a persistent localized warning and an explicit removal action.

## Foreground Controls

The optional native disclosure offers consent, preview, explicit Send, GET-only
Check receipt, Recheck and Remove in English, Arabic and Urdu. Object URLs are
revoked on replacement, unmount and session lock. New unsent text/help/recording
blocks sending a restored copy; it is never silently replaced.

Send uses the existing checked foreground retry helper: reauthorize, read the
original exact receipt, then verify the current assignment before any new POST.
An accepted receipt returns without reposting after withdrawal. Uncertainty keeps
the original ID and bytes; delivery and assessment remain separate states.
There is no service-worker private cache, automatic retry or provider call.

Recorder previews have a separate consent-gated Save action. Failed saving keeps
the current preview. The optional panel has its own load-failure boundary; device
cleanup imports the storage core rather than the panel, so its failed bundle
does not disable cleanup or the normal answer path.

## Executed Evidence

- Seven storage tests cover native WebCrypto encryption/nonextractable keys,
  immutable copies, exact scope, expiry, tampering, storage/CAS failures and
  complete localized privacy copy. Independent cleanup and recording-notice
  checks also pass. Canonical audio and foreground retry tests remain covered.
- Native browser fixture 69625 used a generated tone, actual AudioContext decode,
  actual IndexedDB/CryptoKey persistence, verified readback and the actual local
  API. Lost accepted acknowledgement followed by withdrawal reconciled with one
  decode, one POST, one recording and one immutable receipt. UI reload restored
  the same copy, manual receipt lookup worked and explicit removal hid it.
  This uses Vite source modules, not hardware capture or the optimized recorder.
- Final optimized entry `index-B9vXrPK7.js` was checked at an observed 320px in
  EN/AR/UR. Consent/removal, localized privacy controls and visible control bounds
  were inspected. Screenshots: `artifacts/audio-recovery/final-built-*-320.jpg`.
  Native saved-preview screenshot: `final-native-ur-320.jpg`; native harness:
  `final-native-retry.jpg`. Final native console had no error/warning, after fixing
  an empty audio source attribute that previously triggered a React warning.
- Built fixture 96148 deliberately returned 503 for the saved-panel bundle.
  The failure stayed local; typing was editable without submission and independent
  device removal reported success. Two blocked chunk requests and zero notice
  writes corroborated the scenario. Screenshot: `built-panel-failure-device-320.jpg`.
- Final full suite 14030: 416 tests, 413 passed, zero failed, three external
  PostgreSQL skips, 80.84 seconds. Earlier 7844 failed one obsolete notice-copy
  assertion, subsequently corrected. Interrupted 58214 has no claimed outcome.
  Final strict build 41957 passed: main 498.92 kB / 135.01 kB gzip, saved-panel
  3.45 kB, storage core 10.82 kB; all 29 public asset hashes were verified.
  The standalone browser harness also passed explicit TypeScript checking.

Disposable fixtures are stopped, QA tabs closed, viewport reset and their public
cache removed through the UI. The native temporary audio directory was verified
and removed after termination. QA ports 3168/3169/3188/3189 are closed. Main preview
32358 runs on 3020/3021, synthetic and email-disabled; restored only after its old
handle was missing and ports were confirmed empty. Eight selected saved business
table hashes match, SQLite integrity is OK and there are zero foreign-key errors.

## Remaining Gates

Approximately 66% planned implementation, not a measured production-readiness
percentage. Actual microphone capture through preview/Save/reload, interrupted
phone recording, browser-specific crypto/storage behavior, shared-device races
and wider accessibility/reference coverage still need executed evidence.
Authenticated offline private briefing/capture, a complete outbox and general
reconnect/shared-device conflicts are not implemented or certified here.

Live Neon Free PostgreSQL wire/TLS/concurrency and restore, private cloud storage,
deployment and synthetic Gemini evaluation remain external rollout gates. No
real worker data is permitted on Gemini free tier; no paid database upgrade,
provider request, cloud deployment or real-worker onboarding occurred.
