# Briefing library checkpoint

Both SQLite browser API and isolated PostgreSQL rehearsal return `{items,total,page,pageSize}` from a single SQL statement snapshot. `/api/briefings` is now a paged contract; the only browser caller and repository tests were updated.

Search is a bounded literal title substring, not a SQL wildcard. Draft status and latest-publication status are independent: a ready v4 can coexist with published v3. Latest-publication filtering does not match every historical version; history remains on the detail screen. Scheduled publication is not implemented or offered.

Page defaults to 1, size 20; size is 1-100 and page 1-5000. Unsupported parameters/states/sorts are rejected. Sort choices are recently updated, oldest updated, title; each has an ID tie-breaker. Counts and rows stay site-scoped; library rows omit source, rubric, prepared content, withdrawal reason and private answers. Auditor read remains allowed; workers denied.

UI has native search/select controls, icon paging, loading/error/empty states and page recovery after concurrent list changes. Filters/sort reset to page 1. At 320px the full title and version labels wrap instead of truncating to an unusable fragment; row status has its own grid row. Document widths: 305 at 320, 1440 at 1440. Browser checked ready/published result, ready/withdrawn empty state, sort and reset; persistent data not modified. Captures: `evidence/briefing-library-320-2026-10-04.jpg`, `evidence/briefing-library-1440-2026-10-04.jpg`.

Isolated SQLite/PostgreSQL fixtures check paging across 125 matches, stable title boundaries, out-of-range pages with retained counts, literal `%`, independent publication state, foreign-site exclusion, auditor/worker authority and invalid HTTP filters. Full suite: 126 tests, 124 pass, two external PostgreSQL skips. Strict build passes. Fixture publication/assignment/attempt/receipt/case/audit hashes unchanged. Dev session 73959 replaces stopped 82737.

Not production ready: archive/duplicate, schedules/reminders, response drilldown, live artifacts, cloud runtime and real concurrency/TLS, full reference/accessibility coverage remain.
