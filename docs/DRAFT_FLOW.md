# Connected Drafting Steps

2026-10-12: Source / AI processing / Languages / Publish navigation now connects
the existing persisted drafting controls. New briefing capture shows Source as
the current step, with later steps unavailable before save. Saved draft steps
focus the actual source/preparation/language/publication regions. Keyboard Enter
activation and focus were checked in the built browser.

The status model uses stored draft state and exact prepared-source matching, not
visiting a step or human approval. Processing/failed/not-ready and pending
languages are distinct. Publish navigation and the form require a current ready
draft; missing/stale/archived/expired preparation cannot enable it. The server
remains authoritative for actual publication, recipients, versions and deadlines.
Language inspection is optional: technically ready drafts may go directly to
Publish. No approval or translator signoff requirement was added.

Source/review/language edits and unresolved mutation recovery disable step
switching through the existing editing guards. Existing exact creation/review/
publication recovery paths are retained. Publication returns the step indicator
to Source for the next draft without changing the frozen published version.
Step selection is in memory and returns to Source on reload. This checkpoint does
not add closed-tab recovery or persistence for an unsent recipient selection.

## Evidence

- Eight-file drafting regression: 34 passed, zero failed/skipped, 6.358 seconds.
  Final combined search/drafting/authority fifteen-file regression: 70 passed,
  zero failed/skipped, 15.197 seconds, terminal exit 0.
- Strict build: 2024 modules, existing entry-size/mixed worker-offline warnings.
  All 66 shell hashes match. Eight original SQLite business fingerprints match,
  integrity is ok and foreign-key violations are zero.
- Two memory-only PGlite fixtures each recorded one draft POST, one preparation
  POST and one publication POST: one briefing, one ready job, one publication,
  two assignments, zero attempts, zero external calls. Both stopped with exit 0.
  Synthetic preparation used the real local preparation worker, not a browser mock.
- Built flow: source save, publish-disabled-before-readiness, keyboard continuation,
  actual preparation, source/question/rubric and Arabic language inspection,
  continuation to explicit recipient selection/confirmation/publication, next-draft
  state and published history after reload. Source editing locks step navigation.
- 320px inspection caught a new Continue-button overflow; scoped wrapping/min-width
  fixes were rebuilt and replayed. Final page width equals available client width
  at 320/390/768 pixels; desktop checked at 1440. No captured console warnings/errors.
- Final screenshots: `artifacts/draft-flow-desktop-2026-10-12.jpg` and
  `artifacts/draft-flow-mobile-2026-10-12.jpg`.

No real microphone, live speech/model, native Neon Free, cloud deployment, full
44-reference comparison or complete accessibility/release verdict is claimed.
Original previews were not restarted/migrated. The prior register's public-shell
removal/outage bug is historical: WORKER_OFFLINE.md already records its separate
repair; different-build update, physical offline/capture and reconnect gates stay
open. Reticle remains unconnected and diagnostics stay local at the user's request.
