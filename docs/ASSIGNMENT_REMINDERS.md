# Assignment Deadline Reminders

## Local Contract

Publication accepts `reminderMinutes` of 0 (off/default), 60 or 1440. A positive
value requires an explicit response deadline. The choice is part of the exact
publication request and frozen schedule intent; changing it requires a new
request. Omitted/off values preserve existing publication replay semantics.

Each frozen assignment gets one reminder inside the publication transaction,
never at schedule acceptance. Due time is the later of publication time and
deadline minus lead time. The UI says "Up to" one or 24 hours before deadline:
late publication does not claim a reminder appeared before assignment existed.

The internal worker processes bounded batches. A reminder changes once from
queued to visible or skipped in a database transaction. Current scoped staff
authority, access revision, active worker, published version, unarchived briefing,
future deadline, deletion state and absence of an accepted submission receipt
must all still qualify. An audio acceptance suppresses the reminder before its
assessment finishes. Cookie expiry alone does not cancel accepted server intent.

Visible reminders appear in the authenticated worker's inbox only while the
assignment is current, unanswered and unexpired. English, Arabic and Urdu copy
does not claim delivery/read/understanding. The deadline is rendered in the
session's site time zone. No email, push or AI-provider call is involved.

## Persistence And Privacy

SQLite immutable scope/state guards and PostgreSQL migration 038 preserve intent
and terminal outcomes. PostgreSQL locks one due reminder with SKIP LOCKED and
serializes against assignment submission. Database failure rolls back processing;
there is no external delivery or separate leased reminder retry mechanism.
Backup import maps reminder metadata. Stored fields are opaque IDs, dates and
issuing authority, not answer text/audio/rubrics. Worker DTOs never expose that
authority, internal IDs or private facts.

The populated cutover test now compares every imported column for queued,
visible and skipped reminders and all four schedule states, verifies exact import
replay, then resumes one queued publication/reminder exactly once. This is
synthetic SQLite-to-embedded-PostgreSQL proof, not a real cloud restore or
independent concurrent-session certification. See `SCHEDULED_LIBRARY.md` for
the later full suite/build checkpoint.

## Verification

- Eight focused tests cover both SQLite and embedded PostgreSQL: input bounds,
  exact replay/conflict, publication rollback, scope/privacy, default-off, delayed
  schedule publication, immutable outcomes and answered/disabled/withdrawn/
  archived/superseded/authority-revoked/deadline-expired suppression.
- Full suite 19242 is terminal: 450 tests, 447 passed, zero failed, three external
  PostgreSQL skips (94.223 seconds). Final deadline/copy/icon/CSS and a fixture-only
  evidence-query correction follow that suite; strict rebuild/browser checks follow.
- Disposable built-app fixture 67030: native publication to three synthetic workers
  creates one publication, three assignments and three queued reminders. Two
  processor runs leave exactly three visible reminders and no additional publication.
  Persona bootstrap resets POST counters; the pre-bootstrap publication counter
  was one, final database outcome counts remain one/three/three.
- EN/AR/UR native inbox checks show translated reminders and Beirut deadlines.
  Accepted typed answer removes the new assignment from To do and its reminder
  from Sent answers. No microphone, cloud/provider or existing worker-data action.
- Screenshots: `artifacts/assignment-reminders/english-desktop.jpg`,
  `arabic-desktop.jpg`, `urdu-desktop.jpg`, `answered-desktop.jpg`.
- The read-only fixture evidence query initially used ambiguous `state`; that
  helper was fixed to `r.state`, the disposable memory process was restarted,
  and the entire native publication/processing/answer flow was repeated.
- Final entry index-D-jxVfhN.js is 498.74 kB / 135.28 kB gzip. All 32 shell
  hashes pass. Fixture stopped and QA tabs closed. Main 10426 runs synthetic/
  email-disabled on 3020/3021. Eight selected business hashes, integrity/FKs,
  original 30/25/22/3/5 counts and empty schedules/reminders/read receipts match.

## Remaining Gates

This is not full production readiness. Reminder operational monitoring, retention,
paused-workspace integration, mobile proof, real PostgreSQL concurrent sessions,
cloud restore/deployment and external notification channels remain unverified or
unfinished. No new mobile claim is made from the desktop screenshots. Reticle has
no connected app/verdict. Gemini free-tier usage remains synthetic-only; real
worker content must stay off it. Neon Free remains the selected database target.
