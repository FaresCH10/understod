# Onboarding Request Fencing

Estimated task progress: **85%**. Overall production estimate remains **60%**.
This is verified local setup recovery, not full production readiness.

## Task Checklist

- [x] 100%: captured bounded metadata, briefing search, save and receipt requests;
  server context fencing on SQLite and PostgreSQL and original-identity navigation.
- [x] 100%: exact confirmed revision/step/selection acknowledgement and original
  actor receipt before clearing. Legacy saved setup records remain readable;
  scope/expiry/corrupt/changed-storage records cannot be silently replaced.
- [x] 100%: original uncertain acceptance survives later rejection; reload only
  checks read-only status. Retry stays explicit and unchanged, not a new save.
- [x] 100%: bounded setup DTO/choices and truthful synthetic technical readiness.
- [x] 100%: local regressions/build and built first-briefing persistence/recovery.
- [ ] 40%: wider expiry/revocation/cross-tab, keyboard and assistive acceptance.
- [ ] 30%: actual devices and native PostgreSQL permissions/concurrency acceptance.

## Evidence

- Focused five-file regression: 29 passes, zero failures/skips, 5533.2915 ms.
  Full suite after final source/HTTP snapshot changes: 931 tests, 927 passes,
  zero failures, four native prerequisite skips, terminal exit 0, 224558.2563 ms.
  Local full log: `artifacts/onboarding-controls-suite-2026-10-14.log`.
- Strict TypeScript/build pass: 2054 modules, 631.24 KB entry. Existing chunk-size
  and mixed offline-import warnings remain. All 56 public-shell hashes match;
  eight protected SQLite fingerprints match, integrity OK and zero FK violations.
- Built memory-only fixture on 3213: accepted Supervisor step loses its ACK;
  reload encounters receipt outage, fresh lookup reports missing, explicit retry
  rejects, and another lookup recovers the original revision one. No new request
  replaces it. Next Languages change fails before commit, survives reload and
  explicitly retries to revision two. First-briefing step and selection persist
  through reload at revision four, without publishing or claiming AI readiness.
- Supervisor owner-only setup route is denied. Narrow recovery fits: at 390px
  notice client/scroll widths both 337px; at 320px both 267px and page width 305px.
  Screenshots: `artifacts/onboarding-rejected-recovery-mobile-2026-10-14.jpg` and
  `artifacts/onboarding-first-briefing-2026-10-14.jpg`.
- Fixture terminal: six explicit POSTs, four accepted immutable receipts and four
  setup audit events. Eight protected fixture tables unchanged. No external
  requests. Initial fixture launch failed because no supervisor was seeded;
  corrected only the disposable in-memory fixture and reran successfully.
- Temporary tab closed, viewport reset and all owned processes terminal. Existing
  user tab and previews on 3020/3021 unchanged. No original DB migration/restart,
  real worker data, provider/mail/cloud operation or diagnostic upload occurred.

No native-device, Reticle, live-provider or hosted-release verdict is claimed.
