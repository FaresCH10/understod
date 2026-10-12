# Clarification Routing

2026-10-10 synthetic checkpoint, partial S14/S15/S24. SQLite and PostgreSQL
migration 057 route newly created help and assessment cases. This is not the
translated follow-up conversation or production readiness.

## Contract

- Case creation and routing share the caller's transaction. Each new case gets
  a separate deadline 24 hours after case creation, independent of the answer
  deadline. The scoped active primary owner/supervisor is preferred; an eligible
  deputy is the fallback. Missing contacts leave the case unassigned.
- Original assignment, answer, assessment, help text and resolution notes are
  unchanged. Exact help replay does not route again or create an answer receipt.
- One overdue open case per worker stage may move to the current eligible
  deputy. Ownership, escalation timestamp and metadata-only audit commit
  atomically. Repeated worker cycles do not repeat the escalation.
- Manual owner changes permanently suppress automatic escalation, including
  moving ownership back to the original contact. Resolved cases, inactive
  workers, missing/inactive deputies and archived sites are excluded. PostgreSQL
  also obeys tenant/global dispatch pause controls and rechecks locked authority.
- Existing cases are not backfilled with invented contact/deadline history.
  Legacy cases retain their assignment-deadline filtering fallback. New cases
  use their separate deadline in queue filters and detail.
- Routing identity and the initial deadline are immutable. SQLite backup/import
  preserves populated routing rows; old backups without this table remain valid.
  This checkpoint does not add editable deadlines or escalation configuration.
- Routing/escalation notification metadata contains no answer or private note.
  Worker help history retains its existing own-case owner/status-only contract.

## Evidence

Four paired SQLite/PGlite checks cover eligible routing/fallback, exact replay,
independent deadline, one-time escalation, audit rollback, immutable identity,
manual ownership, resolution, inactive worker/deputy and PostgreSQL tenant pause.
The final combined focused regression run passes 90 tests, zero failures/skips,
56.677 seconds. It includes clarification/domain/audio/notifications/runtime,
site lifecycle and populated SQLite-to-PostgreSQL import. Import explicitly
compares saved deadlines and verifies legacy cases have no invented deadline.
Strict optimized build passes: entry 513.42 kB / 138.11 kB gzip. The size warning
remains a final performance gate, not a passing result.

Built memory-only credential browser fixture verifies fresh primary assignment,
the separate next-day deadline, overdue-only filtering to one case, deputy and
escalation time after reload. Existing recent-answer text remains visible.
Desktop screenshot inspected; no saved screenshot/mobile proof claimed.
The disposable identity was signed out, its tab closed and fixture stopped.
Reticle is unconnected and returned no verdict; feedback was recorded.

## Still Open

Translated text/voice conversation, delivery, repeated follow-up response,
explicit disagreement, editable deadlines, full mobile/RTL/accessibility and
reference verification, actual PostgreSQL wire concurrency, Neon/cloud runtime
and privacy-approved live processing. Gemini Free remains synthetic-only.
