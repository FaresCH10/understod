# Archived Briefing Content Retention

Migration 079 adds a separate, default-disabled site policy. Owner and
administrator changes require confirmation, the current revision and an exact
author/site-bound receipt. The credential PostgreSQL settings UI supports
receipt-only recovery after a lost acknowledgement; it does not resend a change.

The scheduled worker expires only archived briefings whose archive, latest
answer and case resolution have aged beyond the policy. Published versions,
pending preparation/publication/assessment work, fresh answers and open or
recently resolved cases prevent expiry. Generated bundles must first be cleaned
under their separate lifecycle, with actual removal receipts. This policy alone
does not retire generated or source audio bytes.

One transaction records hashes of eight owned content projections, physically
redacts them and writes the completion audit. These are briefing title/source/
prepared content, publication snapshots, draft reviews, review command payloads,
regeneration baselines, cleaned generated manifests, copy command titles owned by
the expired copy, and linked source-audio request titles. Independently created
copies have their own lifecycle. Deferred checks prohibit a completion marker
unless every owned projection is actually redacted. Failed audit rolls everything
back. Exact tombstones and unchanged non-content fields are enforced; ordinary
updates, reparenting, deletion and content restoration remain forbidden.

Version identities, audiences, response outcomes and original content hashes
survive. History displays an expiry notice and cannot offer a new copy. An old
review/copy request can replay only when its original content hash matches.
Expired review recovery uses a read-only verification route rather than returning
the erased request or resubmitting it. Disabling cleanup cannot restore content.

The isolated restore maintenance sweep executes the same due checks and worker,
while quarantine and activation prohibitions remain. Privacy-ledger v4 captures
the current policy and historical content-purge proofs and reports unapplied
briefing redactions. **Historical briefing replay is not yet implemented**;
changed publication hashes still fail closed. Do not activate an older restore.

Evidence: focused backend/HTTP/review/restore run, 21 passed with no failures or
skips; earlier broader regression, 67 passed. Built desktop lost-ack/reload and
320px disable/history journeys were exercised on an in-memory synthetic fixture.
Saved images are in `artifacts/briefing-retention-*-2026-10-11.jpg` and
`artifacts/expired-briefing-mobile-2026-10-11.jpg`. No horizontal overflow was
observed at 320px; expired history had zero copy buttons. The fixture process was
confirmed absent after its timeout, but final shutdown counters were not
retrieved across the environment transition. Reticle had no connected browser
session and later became unavailable; no Reticle pass is claimed.

These checks do not prove native concurrency, hosted storage, device copies,
customer wording/legal review, every reference screen or complete release
readiness. Existing preview/database were not migrated or restarted, and no
external provider, email, account provisioning or deployment was performed.
