# Repeat And Review Recovery

Local implementation, 20 October 2026, S15/S24 and A13 slices. PostgreSQL
repeat/review domain behavior remains separate from the dual-backend root
clarification actions. No new migration or service grant is introduced here.
This is not a production-readiness declaration.

## Contracts And Intent

- New paged history reads use repeatable-read snapshots, explicit page/pageSize,
  scoped metadata, bounded exact DTOs and current captured staff context.
  Failed or malformed reads never mean empty history. Legacy no-query array
  reads remain available for already-saved frontend builds.
- Repeat availability distinguishes an earlier submitted answer, another active
  repeat on the assignment, closed case, unavailable publication/worker, archived
  workspace and expired private content. A stored pending record is not proof
  that the worker can still submit. Existing answer/assessment records stay intact.
- Review history projects the effective current follow-up deadline and separate
  deadline/disagreement capabilities. Human resolution blocks deadline edits,
  but authorized disagreement with an existing original assessment is separate.
- All reads, writes and receipt lookups use the captured account/site/role/context
  and bounded transport. Late results or returned-context mismatches cannot
  update a different session. No automatic write retry occurs.
- Repeat recovery retains only the exact UUID and UTC deadline in the existing
  session/case key. Review v2 retains only UUID, kind and canonical content hash,
  never the private reason. Existing legacy review hashes are recognized without
  silently replacing their recovery record. Ambiguous/corrupt storage fails closed.
- Review receipts include the frozen request hash. Retired private text is not
  reconstructed. Legacy reason-only hashes whose text is retired cannot be
  verified and their recovery metadata is not erased.
- GET-only receipt recovery is possible without authorizing a fresh write.
  Changed drafts cannot substitute for the original pending command. A confirmed
  receipt clears only matching local metadata and matching draft content;
  newer text, a different deadline and an unrelated review draft remain.
- A known rejection may release metadata created by that first attempt only.
  It never releases an older uncertain request, a context fence, an unknown
  transport outcome or an absent receipt. Server audit/domain validation remains
  authoritative.

## Drafts And Deadlines

Unsent repeat deadlines now participate in the root navigation/unload guard,
along with review, conversation and resolution drafts. Same-case root/history
refreshes retain drafts, including readonly/selectable content during failure.
History paging is blocked while its own draft is dirty; refresh remains possible.

Native datetime input explicitly uses the site's IANA timezone, not the device
timezone. The existing Temporal-based civil-time parser rejects invalid calendars
and DST gaps and requires an explicit occurrence for repeated hours. Rendered
history includes the UTC offset. Native input and change events preserve the
controlled date value without resetting an unchanged occurrence on blur.

Deadline edits retain the effective deadline observed when editing began. A
competing change is rejected. Explicit rebasing acknowledges the new baseline
without erasing the desired local date. Repeat-answer and case follow-up deadlines
remain different concepts; neither modifies the original assignment deadline.

Local clearing uses a Cancel-first trapped dialog with captured draft identity
and focus restoration. It does not cancel a server request or remove pending
receipt metadata. Clearing all root drafts removes the stale navigation warning.

## Verification

Focused client/domain coverage includes exact metadata, hash-time authority and
storage races, legacy/retired review receipts, strict page/receipt DTOs, fresh-only
known rejection release, civil-time conversion, actual paged histories and
original-answer preservation. Actual loopback HTTP tests cover captured-context
read/write/receipt fences, original actor and role, strict queries and legacy
no-query compatibility. Full clean results and saved browser evidence are
recorded in BUILD_STATUS.md and the production checkpoint artifact.

Built English synthetic browser checks cover paged histories, unsent navigation,
failed/malformed reads, malformed post-commit acknowledgments, GET-only receipt
recovery, changed-draft retry denial, newer/unrelated draft preservation,
competing repeat rejection, stale-deadline rejection and explicit rebase,
Cancel/focus clearing and returned-context lock. Both repeated-hour choices were
saved as distinct UTC instants in the corrected-input build. A malformed reply
is not evidence of an actual network-disconnection event.

The initial layout check found a 320/390px overflow in the rebase notice. Scoped
grid/wrapping controls fixed it; final visual checks also shortened occurrence
labels and separated adjacent forms. Case/time code is lazily loaded instead of
adding the Temporal parser to initial worker load. Existing main-chunk warnings
remain, so this is not complete performance acceptance.

## Still Open

SQLite repeat/review parity, all reference states, full staff localization,
independent language and assistive-technology review, real phones and microphone
lifecycles, wider held mutations/account transitions, current-policy native
concurrency, privacy-approved real-worker AI, hosted operation and release gates.
PGlite/browser fixtures do not prove native PostgreSQL or production behavior.
No cloud migration, provider/mail call, microphone permission, billing change or
deployment is part of this checkpoint. Reticle's prior external-egress refusal
remains respected; local CUA evidence is not Reticle proof.
