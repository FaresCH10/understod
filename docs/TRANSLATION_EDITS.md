# Optional translated draft edits

Checkpoint: 2026-10-06. Implemented and locally verified in the synthetic PostgreSQL
rehearsal, not live/production readiness. S11/S18 remain partial.

A separate selected-target regeneration API/worker now retains compatible checked
other-language text/audio; its controls/recovery are not exposed yet. Ordinary
review edits described here still regenerate the whole bundle. See
`TARGET_REGENERATION.md` for that backend extension and remaining gates.

## Contract

The existing scoped `POST /api/briefings/:id/review` accepts an optional `translations`
map containing Arabic (`ar`) and/or Urdu (`ur`) full title/instruction/question values.
Limits are 120/5,000/500 characters. Unknown languages, partial/blank/non-script fields,
private facts, provider metadata, audio IDs/URLs and unknown keys are rejected.
Script presence is only structural validation, not proof of correct language.

Translation values normalize into fixed language/field order before dependency hashing
and receipt comparison. Existing reviews without translations retain their previous
shape/hash. This is a full replacement review request: absent target overrides request
automatic translation. The UI preserves other target and source-review inputs when
editing a target, and preserves target overrides when editing source review inputs.
Source/title changes reset review inputs; glossary invalidation retains them while
updating the draft revision. Accepted historical request receipts remain immutable.

Owner/supervisor authority, active briefing, exact revision, immutable request-ID
replay, audit rollback, readiness invalidation and obsolete-job cancellation use the
existing transaction. Every accepted edit increments the revision and queues new
preparation; it never mutates a publication, audience, worker answer or old audio.
Conflicting replay cannot change the accepted text. Both SQLite and PostgreSQL store
and recover the exact request. SQLite-to-PostgreSQL import preserves translations in
current reviews and receipts across glossary invalidation.

The generated-bundle pipeline skips automatic translation for an overridden target,
but always runs the independent source/terminology translation check before speech.
Unavailable target selection fails before provider calls. Checks and speech retain
current-claim/review/glossary/revision fences; speech uses exact checked target text.
Edited review values bind the existing dependency hash, storage journal, attachment,
publication preflight and draft audio route. Old draft URLs cannot serve the new
revision; immutable publication audio continues to use its exact frozen snapshot.

The deterministic local demo rejects translated edits rather than claiming to check
them. Only explicitly injected synthetic adapters exercise successful generated
edits. Gemini free tier remains synthetic-only; no real worker data or provider call.

## UI and recovery

The language view exposes optional editing for scoped active draft targets with
generated evidence, or retained current-review overrides after a failed preparation.
Published versions, auditors and English source have no target edit control. Arabic/
Urdu fields have exact labels, RTL direction and language attributes. Users can remove
the selected override to request automatic translation again. Saving is explicit,
not an approval prerequisite for publication or a certification of understanding.

Version/target/coverage switches and competing briefing edits are disabled while
editing. Native audio/device speech stop on editing/selection/revision changes.
Uncertain saves lock the original inputs and retain the exact request in tab-local
session storage. Reload recovery reads and compares the accepted receipt without
automatic POST; an unaccepted request permits only explicit original-ID retry.
Both local recovery and only the review HTTP route allow up to 100,000 UTF-8 bytes;
other JSON endpoints retain their 16 KiB limit. Oversize HTTP bodies return 413.
Session storage is not encrypted or a closed-tab/cross-device recovery service.

## Evidence and gaps

- Focused checks cover 22 generated-audio, seven review, eleven bundle-boundary and
  two recovery tests. Additional HTTP/import assertions pass.
- Full suite: 314 tests, 311 pass, zero fail, three external PostgreSQL skips.
  Strict TypeScript/Vite build passes; on-demand language view keeps main output
  490.87 kB (131.88 kB gzip), language chunk 10.50 kB. No size-warning threshold raised.
- Disposable PGlite/private tone fixture: Arabic edit creates a new ready revision
  and exact question/new URLs; injected check failure removes readiness/audio;
  automatic reset repairs; accepted acknowledgement loss locks the original inputs
  and resolves on reload; Urdu save preserves Arabic override. Published/auditor edit
  controls are absent. 320px Urdu fields are RTL/lang=ur, 269px within their parents,
  document width 305px; Cancel restores target selection. Desktop checked at 1440px.
  Screenshot: `evidence/translation-edit-ur-320-2026-10-06.jpg`.
- Bootstrap sessions and synthetic tone/check fixtures do not prove authentication
  UI, spoken-text alignment, linguistic quality, real PostgreSQL contention or full
  accessibility/reference fidelity. Reticle unavailable; no verdict claimed.
- Ten original saved-data hashes match, SQLite integrity OK and no FK violations.

Selective translation/audio regeneration, compatible cross-revision reuse, enabled
target configuration, per-stage progress/errors, requester/tenant/quotas/live fences,
evaluated speech/translation, real storage/DB restore and deployment remain open.
This save currently regenerates the complete bundle; it is not represented as a
target-only/audio-only operation. Main app remains a local synthetic demo. Neon Free
only, no paid database or automatic upgrade; nothing provisioned or deployed.
