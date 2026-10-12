# Artifact Review Views

2026-10-12 checkpoint: S18.1/S18.4 local synthetic implementation and verification.
The entire S18/A17/production scope is not complete.

The existing exact-version/language inspector now has Text, Audio, Question and
Glossary tabs, with associated panels, one keyboard tab stop, wrapping arrow-key
navigation and Home/End. Optional editing/regeneration disables view and language
changes and copy actions. The existing revision/receipt/dependency controls remain;
published versions do not acquire edit or regeneration controls.

Text compares English source/facts with target title/instruction and instruction
audio. Question compares the frozen questions and offers question audio. Audio
retains both players, exact text and mutually exclusive playback. Changing tab,
language, version or revision cancels device preview and pauses old native players.
Native private-audio failure offers reload, never substitute device speech.

Copy icons have descriptive labels/tooltips. They copy exactly the selected text
or the selected same-origin, authenticated private audio URL, not audio bytes,
public sharing access, tokens, rubric or grading evidence. Every copy rechecks the
current staff cookie/context/role/expiry. Invalid/stale inputs, changed views,
disconnected buttons and denied clipboard access cannot start a stale write or
report success. A browser/OS clipboard write already started cannot be recalled;
context changes during that write do not produce a copied acknowledgement.

Glossary separates the selected artifact's recorded dependency revision/hash
from current site terminology. It does not invent historical term contents or
claim current terms were used by an immutable version. Existing scoped EN-to-
target active-term reads support literal search, 20-row pages, effective-override
copying and real term/company-glossary navigation. Unknown projection fields,
wrong pair/page and invalid/duplicate rows are rejected. Failed reads remove
stale rows. A full frozen historical term-content reconstruction remains a gap
where only the dependency hash was retained.

## Correctness Repair

The first built fixture could not publish its failed preparation. Inspection
found an actual schema mismatch: glossary storage permits an effective company
override with a null suggestion, but bundle validation required a string
suggestion. `glossaryContent` now accepts that valid nullable suggestion while
still requiring nonempty effective terminology, exact snapshot hash, bounds,
scope/language and revision. Stored null values are not changed to synthetic
empty strings. A positive hash/payload-preservation and negative empty/malformed
regression test was added. The existing fixture also now supplies the required
explicit publication `nextVersion`, rather than weakening publication checks.

## Evidence

- Initial markup typecheck failed on one missing keyboard-handler brace; it was
  corrected before the passing build. No initial failure is counted as a pass.
- Ten initial helper/inspection checks passed. Six-file artifact/glossary/audio/
  regeneration/language regression: 50 passed, zero failed/skipped, 183.502 seconds.
  This run began before the nullable-suggestion fix; it is not its new proof.
- After that fix, bundle/helper regression: 22 passed, zero failed/skipped,
  674.1349 ms. Final full synthetic suite: 157 files, 839 tests, 835 passed, zero
  failed, four native-database prerequisite skips, 256.583 seconds, terminal 0.
  External database URLs were explicitly disabled. No live provider calls.
- Final strict build: 2032 modules; existing entry-size/mixed offline-import
  warnings remain. All 61 generated public-shell hashes match. Eight original
  SQLite table fingerprints, integrity and foreign-key checks match.
- Built browser proves exact Arabic text and selected private URL copying, Urdu
  question copying, keyboard navigation and associated panel IDs, current glossary
  25-row paging/search/effective override copying, failed-read stale-row removal,
  and genuine Urdu term drill-down. Clipboard contents were restored; its original
  empty state required the browser API's empty-text restoration, not an empty
  clipboard-item array.
- Native synthetic-tone playback reached readyState 4. A batched check observed
  instruction paused at 0.165/3 seconds while question played at 0.137/3 seconds,
  proving exclusion before natural completion. View changes leave new players
  paused. Forced private read failure exposes reload and zero device fallbacks.
- Owner draft editing/regeneration locks were opened and canceled without POST.
  Published v1 has no editing/regeneration controls and copies its publication-
  bound audio URL. Auditor UI has zero native players, private-link copy, rubric
  or edit controls; permitted text copying works. This UI check is not a new
  claim about all server permission paths.
- 320/390/768/1440 widths have no page overflow; RTL questions and fixed compact
  tab dimensions inspected. Final 320px tabs use 13px text, four 64.25px tracks
  and 4px gaps. Tables remain contained horizontal regions.
- Two built memory-only runs stopped gracefully, terminal 0, with 5/1 glossary
  reads, zero HTTP POSTs, unchanged briefing prepared content/publications and
  zero external calls. The initial failed fixture terminated with exit 1 and
  did not become a live browser server. Final temporary tab closed and viewport
  reset. No original preview restart, migration or data mutation.

Inspected images: `artifacts/artifact-review-text-1440-2026-10-12.jpg`,
`artifacts/artifact-review-ur-320-2026-10-12.jpg`,
`artifacts/artifact-review-glossary-ur-320-2026-10-12.jpg` and
`artifacts/artifact-review-private-audio-failure-2026-10-12.jpg`.

Remaining: full reference/accessibility comparison, full historical version
catalog beyond the current 100-version briefing DTO, frozen glossary contents
where unrecorded, independent native-language/live-speech quality, real devices,
native PostgreSQL/cloud/release gates. Free Gemini remains synthetic-only and
Neon Free remains the database target. No Reticle verdict or external diagnostic.
