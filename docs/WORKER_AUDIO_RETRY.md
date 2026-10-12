# Worker Audio Retry

Historical foreground foundation. The newer opt-in encrypted browser recovery,
final 416-test suite and actual 320px optimized checks are documented in
`WORKER_AUDIO_RECOVERY.md`. Earlier evidence and outstanding gates below describe
this foundation's original checkpoint, not the current build totals.

Checkpoint: 2026-10-07. This implements foreground retry checks for page-memory
recordings, not a durable private outbox or authenticated offline workspace.

## Payload And Authority

`createRecordingSubmission` fixes a nonempty recording and v4 submission ID.
The first successful decoding/PCM encoding produces one canonical mono 16 kHz
WAV. Concurrent preparation and later retries reuse it; upload callbacks receive
separate byte copies. Failed decoding/encoding is not cached as a usable payload.
Discard, replacement, receipt confirmation and recorder unmount clear the page
reference. AudioContext is closed after decoding. Reload can still lose audio.

`sendWorkerRecording` copies the original bytes and assignment/publication/version/
language before awaiting anything. It checks the current unexpired page session,
reauthorizes with a no-store session GET, then reads the exact original audio
receipt. A verified acceptance ends the retry without another POST, including
when the publication has subsequently closed or assessment failed after receipt.

If no receipt exists, a fresh no-store own-assignment GET must prove the same
publication/version/language, published state, future or absent deadline, and a
response state that permits a new answer. Revocation, expiry, changed identity,
version, deadline, pending/completed response, unavailable reads or malformed
receipts cannot proceed to upload. GETs have 15-second bounds; POST has 45 seconds.
The server still rechecks authority/deadlines and fingerprints immutable bytes;
a client preflight is not an acceptance guarantee or a replacement for those checks.

An uncertain POST retains its preview and original ID. The localized EN/AR/UR
conflict/verification message does not claim an unverified upload succeeded.
A missing receipt is not proof that a prior request never ran. Retrying the
same ID/bytes relies on the existing server idempotency/fingerprint contract.
There is no background retry, new ID on uncertainty, provider call or AI claim.

## Executed Evidence

- `tests/audio.test.mjs`: canonical byte reuse, concurrent preparation, callback
  mutation isolation, failed decode/silence, unchanged ID and server-valid PCM.
- `tests/worker-audio-retry.test.mjs`: seven checks cover read/POST order, exact
  scope, locks, expiry, malformed identities/receipts, conflicts and lost receipt.
- `tests/app-recording.test.mjs`: disposable actual local API accepts a generated
  recording, loses its acknowledgement, withdraws the publication, and reconciles
  with one decode/one POST/one recording/one immutable audio receipt.
- Native browser fixture `scripts/audio-retry-browser-fixture.mjs`, session 86966:
  the actual browser AudioContext decoded a generated tone. UI reported PASS,
  identical retry bytes, one decode/POST/recording/receipt, original receipt and
  withdrawn publication. This uses Vite source modules, not the optimized bundle
  or a hardware microphone. No microphone permission, speech quality, recording
  interruption or phone capture is certified. Screenshot:
  `artifacts/audio-ui/native-retry-synthetic.jpg`.
- Final optimized fixture 5984: entry `index-DhaEqd-K.js`, loaded recorder/site
  notices and corrected browser-restore privacy copy in EN/AR/UR. Actual observed
  AR/UR viewport was 1280px; attempted override did not take effect. Only desktop
  bounds/no-overflow checks are claimed for this follow-up. Screenshot names use
  `final-recorder-*-desktop.jpg` (English uses `final-recorder-en.jpg`).
- Final full suite 8766: 407 tests, 404 passed, zero failed, three external
  PostgreSQL skips, 90.70 seconds. Earlier 38809 had the same totals before final
  localized error/privacy wording. Strict build passes without chunk warning:
  main 495.16 kB / 134.10 kB gzip; all 27 public hashes independently verified.
  The standalone browser check TypeScript also passes explicit type-checking.

Both fixtures stopped; their browser tabs closed; viewport override reset.
Fixture-owned public cache was removed via device UI. Windows process termination
left the native fixture temporary audio directory, which was then explicitly
verified and removed; Test-Path returned false and four fixture ports were empty.
Main preview 98032 remained live, with eight selected saved business-table hashes,
integrity check and foreign keys unchanged. Main browser restored to Maya overview.

## Remaining Gates

Approximately 65% planned implementation, not production readiness. Durable
opt-in private audio recovery, reconnect conflicts, authenticated offline behavior,
actual microphone/phone/interruption tests, final narrow copy verification and
broader reference/accessibility work remain. Live PostgreSQL/Neon wire/TLS,
private storage, Gemini synthetic evaluation and deployment gates remain open.
Real worker data must stay off Gemini free tier.
