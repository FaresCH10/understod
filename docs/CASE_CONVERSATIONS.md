# Case conversation text foundation

Later checkpoint: PostgreSQL migration 059 now adds synthetic-only queued,
checked translation and private generated-audio delivery, plus worker Follow-up
inbox discovery and metadata-only staff message notifications. See
`CASE_FOLLOWUPS.md` for current evidence and remaining limits. The text-only
SQLite restrictions and historical checkpoint evidence below still apply.

Migration 058 adds scoped, append-only two-way case messages in SQLite and
PostgreSQL. Staff owner/supervisor can send English follow-up to English
assignments; workers reply in the immutable assignment language. Arabic/Urdu
supervisor delivery fails explicitly until translation is connected. No fake
translation, speech generation or AI reassessment is claimed by this checkpoint.

Each command carries a UUID and trimmed-text SHA-256 digest. Exact actor/case
replays return the original receipt, including after resolution; changed text or
scope conflicts. New messages require an open case, active worker and published
assignment. Auditor access is read-only. Archived sites reject writes. HTTP POSTs
require the exact client session context and same-origin cookie authority.
Unexpected database errors are redacted.

Both screens page original messages and expose GET-only receipt recovery.
Session storage retains only the command UUID/hash under the exact client context
and case, never message plaintext. Uncertain sends are not automatically retried.
Reload recovery checks the receipt; an explicit resend requires the same text.
Unsent text blocks in-app navigation; browser unload receives an unsaved warning.
Resolution/owner changes cannot discard an unsent supervisor conversation draft.

Messages do not overwrite assessment, attempts, submission receipts or human
resolution notes. Worker deletion redacts text to `[Deleted]` while preserving
immutable receipt metadata. Backup/import carries normal and redacted messages,
without reintroducing deleted text or credentials.

Focused evidence (2026-10-10): seven conversation/recovery/HTTP checks pass, zero
failures/skips (2.948 seconds). Populated synthetic cutover and paired repository
checks pass in a separate 14-test run (10.614 seconds). Strict optimized build
passes. Native built memory-only credential UI proves lost acknowledgement,
failed receipt read, reload reconciliation without another POST, supervisor text
in the worker thread and a worker reply. Counters: two POSTs/messages/audits and
two receipt reads. Desktop screenshot inspected; no saved screenshot, mobile,
Reticle verdict, actual PostgreSQL wire/cloud or speech-quality proof claimed.

Final rebuilt native check confirms original response/facts remain above the
thread and unsent supervisor text prevents navigation/resolution until sent or
cleared. Disposable sessions signed out and fixtures stopped. Main synthetic
preview 11528 refreshed on 3020/3021; selected business/settings hashes unchanged,
message ledger empty, integrity ok/FK errors zero and original 30/25/22/3/5 metrics.
Final entry is 522.95 kB; performance warning remains for the final pass.

Remaining: translated/generated private follow-up audio, notifications/inbox
delivery, voice replies, repeated assessed attempts, explicit disagreement and
editable deadlines. S15/S24 remain partial; this is not production readiness.
