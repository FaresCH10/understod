# Gemini Synthetic Checkpoint

Date: 2026-10-14. Goal remains the full production build. This checkpoint is not
production approval, an independent language review or an enabled real-data path.

## Progress

| To-do | Progress | Evidence or next gate |
| --- | ---: | --- |
| [x] Local key containment and credential availability | 100% | Ignored `.env`; blank tracked example; Google model list HTTP 200 |
| [x] Fixed synthetic text preparation connection | 100% | Validated structured preparation, HTTP 200, hashed output only |
| [x] Fixed Arabic and Urdu translation technical checks | 100% | Structured outputs plus automated comparisons in final six-request run |
| [x] Fixed English and Arabic speech technical checks | 100% | Actual provider WAVs converted and validated as mono PCM16/16 kHz |
| [ ] Complete live synthetic pipeline and independent quality | 40% | Full metered workflow, transcription, assessment/evaluation, disagreements and independent language/audio review |
| [ ] Urdu speech path | 0% | Current model's checked language table does not list Urdu; no inferred or fallback readiness |
| [ ] Privacy-approved real-worker AI | 0% | Real worker content remains forbidden on Gemini Free |

Overall reassessment: about **64%** (57-70% uncertainty). Using the existing
weighted basis, only live AI/audio moves from 27% to 40%: 32.8 + 15.2 + 7.95 +
6.0 + 2.0 = 63.95. Other areas are unchanged. These are engineering estimates,
not test percentages or release certification.

## Implementation

- The user supplied the key locally. Its first saved value was not a valid Google
  key; no credential-bearing generation was sent until it was corrected. The
  relocation utility keeps its value out of output, preserves unrelated config,
  refuses conflicting/ambiguous input, and leaves provider modes unchanged.
- The real API exposed an incorrect text-format value: `generateContent` uses
  the `APPLICATION_JSON` enum. Structured requests now have bounded output tokens
  and `store:false`. This logging choice does not make Free-tier real-data use
  approved or override Google's data-use terms.
- Speech uses the documented Interactions request/response schema, with no stored
  interaction. In this live run Google returned 24 kHz WAVs with trailing metadata
  despite the requested 16 kHz. A pinned `wavefile` 11.0.0 resampler converts actual
  samples using filtered sinc interpolation. Bounded metadata is discarded; corrupt
  lengths, duplicate audio/format chunks, unsupported formats/rates, silence and
  excessive duration remain rejected. Playback speed is not changed by relabeling.
- Known HTTP status is journaled once; it is not overwritten with transport
  uncertainty after an HTTP refusal. Protocol provenance is now
  `gemini-generation-v3`; stage fixture/config fingerprint is v2, so earlier
  protocol verification is not silently reused.
- `gemini-synthetic-smoke.mjs` accepts only explicit live-synthetic invocation,
  fixed inputs and supported modes. A connection/speech run allows one request;
  the four-stage run allows six, stops on failure and never automatically retries.
  It records metadata/hashes only, not keys, translation content, audio or private
  provider messages. Its local journal is developer smoke evidence, not the
  production PostgreSQL operator receipt/allowance system.

## Actual Evidence

- Google model-list inspection: HTTP 200, all three configured models available.
- Successful preparation: `artifacts/gemini-synthetic-connection-1791957769332.json`.
- Final stage run: `artifacts/gemini-synthetic-stages-1791958166499.json`, six
  accepted HTTP-200 requests, two translation and two speech results. English
  audio: 233004 bytes/7.28 seconds; Arabic: 250924 bytes/7.84 seconds. Both outputs
  pass canonical WAV validation. Automated comparisons are not independent review.
- Across retained development attempts: 17 generation requests and one read-only
  model-list request. Earlier failures are preserved, not replaced with passing
  evidence. No billing, paid service, cloud provisioning or deployment was enabled;
  the key's account billing status was not independently inspected.
- Secret containment: 1226 tracked files checked, zero current-key matches;
  zero current-key matches in built public assets; tracked example key blank.
- Focused six-file regressions: 44 pass before final normalization/rehearsal fix.
  Final affected five-file regressions: 29 pass, zero failures, 3825.2561 ms.
- Strict build passes, 2057 modules. All 56 shell hashes match. Eight original
  SQLite table fingerprints/counts remain unchanged; integrity OK, zero FK errors.
- Initial full sandbox run failed on denied disposable localhost connections.
  Permitted run: 954 tests, 949 pass, one old scripted-speech mock failure, four
  native skips. Mock request assertions were updated exactly, with business
  assertions retained; the focused complete rehearsal then passed. Final full
  suite rerun passes: 176 files, 954 tests, 950 passes, zero failures, four native
  skips, terminal exit 0, 220901.3975 ms. Log:
  `artifacts/gemini-live-adapter-verified-suite-2026-10-14.log`.

No original database migration or preview restart. No external diagnostic upload.
The only external credential use was the authorized Google synthetic testing.

## Next Gates

Complete a live fixed-input metered pipeline including actual private playback,
source/response transcription and positive/negative assessment fixtures. Resolve
quality disagreements independently. Choose and verify an Urdu speech route,
without pretending the present model supports it. Native PostgreSQL, real phones,
all-reference/localization/accessibility acceptance, clean CI, authorized Neon
Free/private storage/application hosting and a privacy-approved real-data path
remain separate open gates.

Current primary documentation checked: [Google generate-content reference](https://ai.google.dev/api/generate-content),
[speech generation and language table](https://ai.google.dev/gemini-api/docs/speech-generation),
[free Standard model pricing](https://ai.google.dev/gemini-api/docs/pricing),
[wavefile resampling documentation](https://github.com/rochars/wavefile).
