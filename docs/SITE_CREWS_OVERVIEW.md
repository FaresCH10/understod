# Team-First Site Crews

2026-10-15. S27 implementation work, with A05/A09/A14/A15/A17 coverage at the
specific scopes below. This does not close full visual, language, device, native
cloud or release acceptance.

## Application

`#people/crews` adds the team-first view while keeping the existing worker
directory and its management controls. It is reached from the directory's Site
crews command. The screen includes the current site's crews with bounded literal
search/status/pagination, selected current active members with independent paging,
configured primary/deputy contacts, recent directory activity, latest-publication
response metrics and exact-version navigation. English and Arabic presentation
reuse the directory language preference and surrounding RTL shell.

Create-worker and create-crew commands open the existing forms at
`#people/new` and `#people/new-crew` with the relevant input focused. Membership
management opens the existing selected-crew directory. Rename/archive/restore use
the same CrewActions component, not an independent implementation. Its mutation
response now validates crew ID, original organization/site, field types and
private-field exclusion before reporting completion. Existing captured-session
fences, server permissions, request bodies and immutable history remain.

The new read endpoint is `GET /api/people/crew-overview`, implemented in SQLite
and PostgreSQL. It accepts only the existing bounded crew filters and rejects
duplicate query parameters. Authorization remains owner/supervisor in the actual
current site; this does not broaden administrator/auditor/worker permissions.
Contact fields are names/roles of active configured site contacts only, not email
addresses, credentials or invented per-crew supervisor assignments. Deactivated,
out-of-site or no-longer-eligible contacts are unavailable.

## Metrics And History

Response counts use the latest published version and its frozen
`publication_report_audience` assignment IDs, with the established current
typed/audio response precedence. Current active member counts are separate.
Moving, renaming or archiving a crew does not rewrite historical assignment
membership or response counts. An existing complete snapshot can give a new crew
zero assigned recipients; an absent/incomplete historical snapshot instead gives
null per-crew metrics and an explicit unavailable state. A missing publication
does not fabricate zero metrics. No GET creates tables or backfills old evidence.

The shared server projection emits an explicit allowlist of fields. Activity is
the latest six current-site crew create/rename/archive/restore and worker
create/membership-change events, not arbitrary audit payloads. It does not infer
an old move's destination from current membership. Item names are current labels,
not reconstructed historical names. Worker labels are omitted once deletion is
requested. If a legacy SQLite database has no deletion-request schema, worker
item labels are unavailable rather than exposed on an assumed privacy policy.
Normal retention's cleared actor/object IDs cannot rejoin identities.

The browser validates exact DTO keys, original site/crew selection, bounded
pages, unique IDs, contact roles, timestamps, denominator/completion arithmetic,
snapshot/null consistency and page-group sums before showing results. It rejects
private extra fields and impossible cross-site or cross-selection results.
Old reads are aborted and fenced on refresh, selection or authority changes.
PostgreSQL reads use the existing repeatable-read repository helper; SQLite reads
use one existing transaction. This is not native multi-connection acceptance.

## Local Evidence

- TypeScript and a separate ignored production build pass.
- Twenty-five focused tests pass: five new DTO/projection tests, four new
  dual-backend repository/HTTP tests, and existing directory/localization/HTTP
  regressions. Embedded PostgreSQL is PGlite, not a new cloud test.
- Tests publish a real synthetic version through each backend, verify typed
  outcomes, then move/rename/archive crews. Frozen per-crew response counts stay
  unchanged while current member counts change. Scope, paging, contacts,
  queued-deletion label minimization, repeated parameters, no-store headers,
  malformed DTOs and non-mutating GET behavior are covered.
- The first smoke test found missing legacy `publication_report_audience`.
  The read now reports unavailable crew evidence without DDL/backfill; its
  canonical overall counts remain 30/24/21/3/6. A first dual-backend test attempt
  passed PostgreSQL but failed SQLite setup because the synthetic Tripoli site
  was absent. That fixture was corrected; the unchanged acceptance assertions
  pass on the final 25-test group. Earlier failures are not passing evidence.
- The disposable fixture's new `--site-crews` mode explicitly constructs three
  synthetic crews (18/8/4 current members), configured contacts and a canonical
  frozen publication audience in memory. It suppresses unrelated extra fixture
  assignments so the canonical denominator stays 30. This fixture construction
  is not proof of a production legacy migration or naturally captured history;
  the repository tests separately exercise normal publication capture.
- The built fixture started on3190/3191,session31530. Supported browser automation
  failed to start with Windows process-security-environment HRESULT0x80070020.
  One supported kernel reset also failed. No visual/browser verdict or current
  screenshot is claimed. Raw browser automation and external Reticle diagnostics
  were not used as workarounds. The owned fixture was stopped,terminal interrupt.
- Fresh clean verification
  `.clean-check/a7f72d68-e42e-41b9-a420-377d2265983c/result.json` passed,terminal0,
  12:04:23-12:10:14UTC:locked offline install/build,1101tests/1097pass/zero fail/
  four native-prerequisite skips,327018.7588ms;43mocked contract and ten scripted
  pipeline checks,809unchanged source-file hashes. No cloud configuration or
  original data copied. This is not browser/native/cloud/live accuracy proof.
- Original eight table hashes,integrity/FK and eleven55-file public-shell
  manifests match the preservation checkpoint;1660selected files contain no
  current configured credentials. Owned3190/3191 listeners are absent after stop.

## Open Acceptance

The earlier browser-startup limitation above is historical. Supported Cua access
recovered on2026-10-15. The current optimized source snapshot
0dc72f84-7c89-4cd7-8a76-ef61fc51ce17 was served by a separate in-memory fixture
on3192/3193,without original data/provider/mail access. Visible UI journeys passed:
crew creation with focused name input,moving Worker001,rename,archive,restore,
member selection and keyboard-activated save/paging. Morning current membership
changed18to17;frozen assignments stayed18/matches17/clarifications1;the new crew
had one current member and zero frozen assignments. Header30/24/21/3/6 stayed
unchanged. Restoring did not issue new assignments. These are UI observations;
native/deployed and naturally captured publication history have separate gates.

Browser observations found English heading mid-word wrapping and320px contact
name fragmentation. Scoped CSS now keeps table words intact and gives mobile
contacts full rows with44px buttons. Contact/activity forward arrows use the
existing RTL transform on their parent controls;Arabic greeting uses its comma.
Observed widths320/390/768/1440/1586 have no page horizontal overflow. The crew
table retains its own scroll region on narrow viewports. Screenshots are saved
as artifacts/site-crews-*-fixed-2026-10-15.jpg and the1586workflow capture.
The390check measured layout only,not a saved screenshot. A row-text locator
timed out because aria-label text is not rendered row text;the actual archive
success was then inspected without repeating the mutation. No Reticle verdict
or external diagnostic upload is claimed. Owned tab closed,viewport reset and
fixture69203 interrupted;OS query confirmed zero listeners3192/3193.

Delayed/outage/authority-transition behavior, complete keyboard/AT and matched
reference acceptance remain open. Independent Arabic/pluralization/font review, complete
S27 controls/role interpretation and native/hosted concurrency remain open. The
existing English private-link/deletion/assignment-history destination subpanels
remain part of the broader localization backlog. Production readiness is false.
