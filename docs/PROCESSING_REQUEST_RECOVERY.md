# Processing Request Recovery

2026-10-14. Requirements: S09/S10/S17/S39/S42 and A06/A08.
Locally implemented and exercised; broader production acceptance remains open.

## Contract

- Migration 085 and equivalent SQLite schema retain immutable metadata-only
  receipts: original actor/site, briefing revision, job, request ID, queue
  generation and acceptance time. No source, rubric, credentials or audio.
- New context/POST/receipt routes are
  `/api/briefings/:id/preparation-requests[/:requestId]`. All require captured
  page-session headers and normal authenticated owner/supervisor authority.
- Admission locks current revision/job and compares the expected generation.
  A distinct stale request cannot retry a later failure. An accepted ID returns
  its original acceptance without requeueing, resetting attempts or adding audit.
- Original-actor receipt reads survive source edits/archive and describe
  acceptance, never current generation success.
- Internal `queuePreparation` and legacy `/process` stay compatible; no historical
  receipts are fabricated. Current draft/job UI uses the receipt-aware route.
- Tab recovery stores only original metadata intent, scoped to actor/site and
  briefing. Matching ACK plus immutable receipt are required before cleanup.
  Missing/failed reads, changed storage/authority and earlier uncertainty survive.
  Reload/check never auto-POST; retry requires explicit interaction.
- Competing source/review/language/archive/copy controls lock during unresolved
  processing. Accepted processing never edits published versions or prior answers.

## Verified Evidence

- Five-file related regression: 32 pass, zero failures/skips, 2121.9984 ms.
  Nine-file migration/import/runtime-role integration: 32 pass, zero failures/
  skips, 18640.6403 ms. Embedded PostgreSQL is not native.
- Pre-key-update full suite: 966 tests, 962 pass, zero fail, four native skips,
  264676.6713 ms, terminal exit 0. Log:
  `artifacts/processing-recovery-verified-suite-2026-10-14.log`.
  Earlier five failures were explicit migration-list/count expectations; failed
  log retained and 085 added without loosening assertions. Final full suite after
  key compatibility edits: 967 tests, 963 pass, zero failures, four native skips,
  255519.1153 ms, terminal exit 0; log
  `artifacts/processing-key-verified-suite-2026-10-14.log`.
- Populated SQLite backup/import preserves receipts/replay after revision edits.
  Immutable UPDATE/DELETE, generation/actor/scope conflicts and both HTTP context
  denials are covered. No DDL applied to the original database.
- Strict build: 2060 modules, 638.79 KB entry; existing warnings remain. All 56
  shell hashes and eight original fingerprints match, integrity OK/FK zero.
- Built memory-only 3234 fixture: two lost ACKs, two precommit 503 responses,
  outage/missing receipt, reload, explicit original retry, read-only recovery,
  edit locks and retained failed outcome. A 503 is client-side uncertain, not a
  definitive denial; known-denial retention has separate helper coverage.
- Keyboard Enter checks receipts; at 320px, document scroll width 305px and
  recovery buttons 224/229px fit. Screenshots are local PNGs under
  `artifacts/preparation-recovery-*`. One native input/screenshot attempt failed;
  documented DOM screenshot/keyboard APIs subsequently worked. No external
  diagnostic or Reticle verdict; not full reference/a11y acceptance.
- Fixture graceful timeout confirmed terminal: five POSTs, exactly three new
  receipts (two retry generations/one fresh job), four processing audits including
  initial fixture queue. Seven protected inventories unchanged, failed retry job
  still failed, zero external calls. Tab closed and viewport reset.

## Remaining

- Wider native concurrency/process-termination, authority-loss/account-transition,
  Strict Mode and real-device acceptance. All-job-kind queue coverage and full
  S17 reference/localization/accessibility acceptance remain separate work.
- Receipts do not prove provider correctness or successful generation. Native
  deployment, approved real-data AI and production release remain incomplete.
  Processing recovery task estimate: 80%, not release readiness.
