# Worker Entry Recovery

2026-10-12 checkpoint. S19/A06/A09 local synthetic evidence, not production acceptance.

Before an explicit worker-link POST, the client saves only the link's SHA-256
digest, chosen interface language, format version and creation time in tab
storage. It verifies the stored value before sending. The token remains volatile.
Malformed, altered, overbounded or expired recovery state blocks another login
until the user explicitly chooses another link.

After an uncertain acknowledgement, recovery uses only GETs: current session,
exact redeemed-grant proof under that session context, then current session again.
Both SQLite and PostgreSQL proof queries bind the current active worker session
to its exact unexpired, unrevoked, redeemed grant and tenant/site authority.
Another worker, another grant, an unrelated staff cookie, a missing cookie or
changed session cannot confirm entry. Proof returns no grant identifier or token.
It does not redeem again, log out the uncertain accepted session or create audit
events. Responses are no-store. The selected UI language does not alter the
assignment language or server identity.

Explicit new-link recovery first reads current authority and attempts all local
cleanup stores; it opens no new link automatically. Failed verification/cleanup
keeps recovery blocked. Errors are bounded EN/AR/UR messages, never raw exception
or provider/database text. Keyboard focus starts at the recovery heading.

## Verification

- Seven-file focused regression: 25 passed, zero failed/skipped, 12.219 seconds.
- Full local synthetic suite: 826 tests, 822 passed, zero failed, four native
  database prerequisite skips, 251.210 seconds, terminal exit 0. Native database
  URLs were explicitly removed from the test environment. This is not native
  PostgreSQL concurrency, cloud, live provider or physical-device evidence.
- Strict production build: 2026 modules; existing entry-size and mixed
  worker-offline import warnings remain.
- Backend HTTP tests cover acceptance followed by lost acknowledgement, exact
  GET recovery without another redemption/logout/write, rejected-before-acceptance
  requests, stale context, foreign grants, disabled workers, expired grants and
  sessions, paused sites, suspended tenants and redacted database failures.
- Built memory-only browser fixture: Arabic 320px lost acknowledgement and two
  failed proof reads, reload, localized failure and Enter recheck to Worker 001's
  Arabic inbox with its English assignment unchanged. Urdu 320px rejected-before-
  acceptance, reload and Enter recheck remain unconfirmed; explicit another-link
  action returns to empty-token entry with Continue disabled. Urdu desktop framing
  is centered at 560px within 1440px, without horizontal overflow.
- Inspected screenshots: `artifacts/worker-entry-recovery-ar-2026-10-12.jpg` and
  `artifacts/worker-entry-recovery-ur-2026-10-12.jpg`. A clipped screenshot API
  result was rejected and replaced with the inspected viewport capture.
- The browser runtime reset interrupted an earlier fixture; its session handle
  disappeared and its port was confirmed absent before restarting. Final owned
  fixture PID 26256 was verified by exact executable/command line and stopped
  after checks because its stdin was closed. Its terminal exit was 1 from that
  forced stop, not a successful graceful counter report. Browser viewport reset
  and temporary QA tab closed. No original preview restart or migration.

The two audit-suite failures were stale fixtures: the provenance upgrade expected
only migrations 067-072 despite later migrations, and UI-language cleanup omitted
the now-required briefing-store stub. The upgrade now checks the exact remaining
migration-file inventory while retaining historical-row preservation/provenance
constraints; cleanup verifies both store callbacks and language removal.

Private delivery, full expired/revoked/access-state/reference comparison,
independent native-language review, physical-device/browser accessibility and
native/cloud production gates remain open. Gemini Free remains synthetic-only.
