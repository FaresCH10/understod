# Notification Request Fencing

Estimated task progress: **85%**. Overall production estimate remains **60%**.
This checkpoint completes local request/recovery behavior, not release readiness.

## Task Checklist

- [x] 100%: captured, bounded staff list/read/receipt transport and server context
  enforcement on SQLite and PostgreSQL; native download boundaries unchanged.
- [x] 100%: exact original-event metadata, actor-only receipt, immutable read
  timestamp and saved-intent cleanup. An already-marked event can be recovered
  outside the recent list window without exposing an unread historical event.
- [x] 100%: interruption recovery requires a read-only check before explicit
  unchanged retry; later rejection cannot discard earlier uncertainty.
- [x] 100%: strict privacy DTO validation, bounded unread pagination and separate
  personal owner/auditor read records.
- [x] 100%: local synthetic regression/build and built-browser recovery evidence.
- [ ] 40%: wider expiry/revocation/cross-tab and keyboard/assistive acceptance.
- [ ] 30%: actual devices and native PostgreSQL concurrency/permission acceptance.

## Evidence

- Final focused five-file regression: 33 passes, zero failures/skips,
  5101.8118 ms. Full suite: 926 tests, 922 passes, zero failures, four native
  prerequisite skips, terminal exit 0, 242645.4589 ms. Full-suite log:
  `artifacts/notification-controls-suite-2026-10-14.log`.
- Strict TypeScript and production build pass: 2052 modules, 634.64 KB entry.
  Existing chunk-size and mixed offline-import warnings remain. All 55 public
  shell hashes match. Eight protected SQLite table fingerprints match;
  integrity OK and zero FK violations.
- Disposable built fixture on 3212: lost acknowledgement followed by receipt
  outage, fake missing receipt, rejected retry and reload recovers the first
  accepted help-read timestamp. Export-read failure before commit requires an
  explicit unchanged retry and exact acknowledgement plus receipt.
- Owner finishes with 24 unread; unread page two contains four items with next
  disabled. Auditor starts with its own 26 unread, no owner recovery record,
  then marks help independently and finishes with 25 unread.
- 320px DOM width is 305px. Recovery fits at 390px; private credential-event
  object text is absent. Local screenshots: `notification-recovery-mobile-2026-10-14.jpg`
  and `notification-personal-read-2026-10-14.jpg` in `artifacts`.
- Fixture terminates gracefully: five explicit POSTs, three personal read rows,
  original publication/audit fingerprints unchanged and zero external requests.
  Temporary tab closed; viewport reset. Existing user tab and 3020/3021 previews
  were not restarted. No original database migration occurred.

Marking read is not delivery, follow-up, understanding or email/push acceptance.
No native-device, Reticle, live-provider or hosted-release verdict is claimed.
