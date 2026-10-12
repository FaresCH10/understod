# Draft and publication contracts

## Current Publication Checkpoint

New requests require current `revision` and explicit matching `nextVersion`.
Stale confirmations reject before publication; historical versionless receipt
replay remains supported only for the exact original request. See
`PUBLICATION_VERSION.md` for final tests and native two-tab/mobile evidence.
Site-civil/UTC deadlines and publication scheduling, explicit DST choices,
durable schedules and opt-in in-app reminders are now implemented; see
`SITE_CIVIL_TIME.md`, `PUBLICATION_SCHEDULES.md` and `ASSIGNMENT_REMINDERS.md`.
Publication/schedule exact tab-local receipt recovery is now verified in
`PUBLICATION_RECOVERY.md`. Closed-tab mutation recovery remains incomplete.
Sections below are historical.

## Crew Recipient Checkpoint

2026-10-08: owner/supervisor may explicitly add a current active crew's members
to the publication selection. The crew catalog uses existing bounded search and
20-row pages, retaining the chosen crew across catalog pages. The new
`GET /api/people/crews/:id/recipients` revalidates current staff/site/session and
active crew, reads members in one scoped statement, returns only worker ID,
code, assignment candidate language and crew name, and rejects more than 5,000
active members without truncation. SQLite/PostgreSQL HTTP reject all query
overrides, use no-store and sanitize internal failures. No migration is needed.

Adding members is a read, not publication or a dynamic crew subscription. It
merges explicit IDs without duplicates, preserves other selected recipients,
clears confirmation, and rejects an oversized combined selection without
changing it. While reading, native fieldset disabling freezes recipient edits,
deadline and confirmation; publishing is disabled. Unavailable reads preserve
the prior selection; explicit refresh and add recover it. The original publish
contract revalidates active recipients, revision, language readiness and due
date before freezing the final audience. Subsequent crew transfers/new members
do not silently change that explicit audience. Entry remains UTC; scheduling
and reminders are still absent. Selection is not restored across reload.

Five focused `tests/crew-recipients.test.mjs` checks pass in SQLite, embedded
PostgreSQL and credential HTTP: 125 members, inactive/foreign/offsite denial,
metadata-only read, authority/revocation, zero audit writes, query bounds,
empty/archive/overflow, frozen explicit audience after membership changes,
exact publication replay and sanitized failures. The full suite 13893 is
terminal: 433 tests, 430 passed, zero failed, three external PostgreSQL skips
(78.917 sec). Final 44px icon/max-width CSS follows the suite; strict build and
final optimized desktop browser checks follow it. Main bundle 495.99/134.43 kB
gzip, 31 public hashes verified, final entry `index-IoGnr29v.js`.

Disposable optimized `--publish-crews` fixture 20171 proves two catalog pages,
crew search, 125 selected despite a one-worker individual filter, duplicate
addition/reconfirmation, individual removal to 124, held-read controls and
failure-preserved selection, manual recovery to 125 and final 44px icons.
`artifacts/crew-recipients/final-built-desktop.jpg` is desktop evidence only.
The viewport override repeatedly measured 1280px, not 320px; it was reset and
mobile proof remains required. An initially misleading screenshot filename was
corrected to `initial-desktop-selection.jpg`. Backend counters after final
cleanup bootstrap show zero publications/assignments for the fixture draft;
no browser publication was submitted. Counters reset on bootstrap, so no exact
total crew-read claim is made. Fixture cache/tabs are cleaned and service stopped.
Verified-live main 4576 intentionally restarted as synthetic/email-disabled
46295 on 3020/3021. Eight selected business hashes, integrity/FKs and zero
notification read receipts remain unchanged. Approximately 67% planned
implementation, not readiness. No cloud/provider/email/real-data action occurred.

## Existing Publication Contract

Both SQLite and PostgreSQL accept the same bounded, exact-key draft and publication payloads. Creation requires a UUID requestId, title and source. Draft PATCH requires the current revision; a changed source/title increments revision, clears prepared content and invalidates obsolete preparation. Processing requires that revision and replays an already queued job.

Publication requires a UUID requestId, current revision, explicit unique active workerIds in the current site, and optional future ISO dueAt. Readiness validates the source, facts, rubric, recipient language coverage and synthetic provenance. Publication freezes evidence and assignments atomically with its audited request record. Exact retries return the original publication, even after a subsequent draft edit or withdrawal; changed payloads conflict. Retained requests also migrate from modern SQLite backups into PostgreSQL.

The browser starts with zero selected recipients. Search/language filters and paged selection never implicitly select all workers. Selection/deadline changes clear confirmation. Deadline entry is explicitly UTC, not a completed site-timezone scheduling UI. Unsaved draft editing disables processing and hides publication. Request IDs survive in-component retries, not a browser restart/offline queue.

New typed and voice answers reject expired deadlines; already accepted exact retries retain their receipt. Voice uploads recheck publication, deadline, worker and credential grant after private storage before accepting an answer, compensating stored objects if acceptance fails.

Earlier verification: tests/preparation.test.mjs and tests/recording-reliability.test.mjs cover scope, revision changes, selected audience, replay, language readiness, immutable evidence, audit rollback, deadlines and storage races. PostgreSQL domain/HTTP tests passed after shared validation. Historical full suite: 107 tests, 106 pass, one external PostgreSQL skip. The current checkpoint above supersedes this suite.

Browser evidence is synthetic only: draft edit/cancel, unsaved-edit guard, preparation of existing v4, recipient filter/selection, confirmation and keyboard deadline change. No v4 publication was performed; v3 remains 30/25/22/3/5. Live generated artifacts, scheduling/reminders, quotas, physical audio and real PostgreSQL concurrency remain unverified.
