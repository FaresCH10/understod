# Worker Submission History

2026-10-19 S23 receipt/history task85%; overall73% unchanged. Scoped built
history browser acceptance below now supplements the historical HTTP evidence.

## Built Browser Checkpoint

Clean74f4475c-897c-4aef-a76f-21914c4a0249 is the exact tested build:1206tests/
1202pass/0fail/4native skips,locked offline install/build,actual exit0. See
WORKER_SUBMISSION_RECEIPT.md for the same-source immediate receipt implementation.

History fixture14213 used nine explicitly seeded own receipts and six synthetic
attempts. The React screen displayed both bounded pages and all seven projected
states:pending,matched,clarification,unassessable,audio failed,paused and recording
unavailable. Older unavailable audio had no audio element. EN/AR/UR UI labels and
server-localized times were visible while frozen content remained v1/EN. Keyboard
Enter activated next-page controls. These metadata rows do not prove normal
repeated-answer processing, actual recording playback or semantic quality.

503 and malformed reads cleared old rows, exposed no internal marker and
recovered through manual GET refresh. A held read cleared rows while loading;
leaving and opening another own assignment showed no prior private answers.
Context mismatch locked the entire private page and removed history content.
Fixture14213 exited0 with answer/help/other POSTs all0,13history reads,0exact
receipt reads,6list/4detail reads,unchanged6seeded attempts,0cases/0external calls.

The first sandbox fixture1113 could not be reached by the browser and exited0
with0reads/writes; the loopback-accessible fixture14213 was then used. One owned
network-error tab could not be closed because the browser URL policy rejected
operations on its generated data URL; no policy bypass was attempted. Fresh
owned history tab8 was closed, and viewport overrides reset. No user tab changed.

Actual history capture is1280px wide. The browser viewport capability continued
to resize the older tab instead of tab8; an attempted390px file is consequently
not mobile evidence. EN/AR/UR history320/390/768/1440 retest remains open, separate
from the successfully measured immediate receipt matrix. The saved settled
`worker-submissions-page2-ur-1280-2026-10-19.png` is desktop history evidence.

Preservation53b96653-1ad9-4c40-8c78-d19e6e5b6e15 confirms original eight table
fingerprints unchanged,integrityOK/FK0,35saved manifests valid,3277selected files
and0configured-secret matches. No original data/build or cloud/provider/mail/
billing/deployment changes. No required verification process remains running.

## Historical Evidence

## Implemented

The worker history reader captures current session context/expiry,assignment,
published version,assignment language andpage. Both HTTP backends return current
clientContext after existing scoped history authorization; stale supplied headers
remain denied. No DB migration, permission, mutation, private audio URL or provider
behavior change. Legacy bounded submission identifiers remain readable.

Strict DTO whitelist checks version/language/assignment/context,receipt count and
pages,bounded text/timestamps,known states,unique receipts andlatest receipt order.
Unknown fields including private metadata fail closed. History display keys data
by the exact selection before render,clears on refresh/failure,aborts superseded
requests andhas a15second timeout. Authority failures lock the worker session.

Each accepted receipt separates Received frompending/paused/audiofailed/recording
unavailable oractual matched/clarification/unassessable outcome. A retained receipt
without its audio does not falselyremain pending. Exact publication version and
language accompany it; timestamp uses site time zone. No match certifies internal
understanding orpermission to start work. Native own-recording playback remains
unchanged andis not evidence ofgenerated-audio quality orattention.

## Current Evidence

Initial Node test failed on unsupported TypeScript parameter-property syntax;
changed to the repository's explicit readonly-property pattern. Eleven focused
client/layout/state tests pass127.3332ms. Final SQLite HTTP/client9checks pass
524.1822ms,typecheck passes. SQLite HTTP confirms echoed context and409 stale
context while preserving original read-only receipt/audit evidence.

Clean056ee876-0556-49b9-b7aa-4280da7affdf,exec99457 terminal0,
12:14:59.626-12:20:58.282UTC:offline lockedinstall/build,1201tests/1197pass/
zero fail/four native skips,340893.6029ms,43contract/tenpipeline checks,
24scripted/zeroexternalrequests. All847sourcefiles unchanged,SHA
42dd9e65e3370936877d75583b014b4dcb32705dd756b63fea4704951e5b7abf.

Browser attachment timed out twice. Inventory aftereachattempt showed onlythe
user's3196tab,noownedQA tab; existingpreview was notnavigated. Troubleshooting
guidance read,noalternate UIautomation ordiagnostic upload used. Two sandbox
process launches thenfailed withWindows sharing error0x80070020; read-only scoped
escalation confirmed the original clean process stillrunning. No restart.

Original memory-only browser fixture75779 stopped withactualexit0:zeroPOSTs,
zero list/detailreads,sixexplicitlyseeded attempts/zero cases/zeroexternalcalls.
The six attempts are synthetic fixture metadata,notnew worker submissions.

Direct actual PostgreSQL HTTP/production-reader check48518 exited0:
artifacts/worker-submissions-http-5cd9fbea-73a0-46f7-bac4-935aec6fbda1.json.
Nine seeded own receipts exercise both pages andall projected states. Eight
checks prove first/second page,pending versusfailed/paused/missing audio/outcomes,
failed-read rejection,unexpected-field rejection,context rejection,held stale
selection rejection,fresh empty assignment andserver409 stale header. ZeroPOSTs,
sixseeded attempts unchanged/zero cases/externalcalls. Helper ownedserver closed.
These are HTTP/reader results,notReact-rendered/keyboard/responsive acceptance,
normal processing,repeated-answer workflow oractual recording playback evidence.

## Earlier Remaining Work (Superseded By Checkpoint Above)

Preservationf532f481:original8fingerprints/integrityOK/FK0,34savedmanifests valid,
3204selectedfiles/zero configured-secretmatches. No neededtestprocessrunning.
Built React browser paging/failure/session/delay and
three-language responsive/keyboard acceptance remain. Main immediate-submission
receipt screen stillneeds the complete S23/S44 reference-state acceptance;
history improvements do not complete it. Realdevice/AT/native hosted transport,
live assessment quality andgeneral release gates remain separate.

Next S23 source/reference inspection afterthe checkpoint pause: selected image
41(12),740x1600 explicitly shows received/uploaded-versus-checking stages,ownanswer
playback,server submissiontime/exactversion anddirect Help action. Current
main.tsx immediate receipt branch has only received/outcome/back; its normal help
composer is in the alternate branch,although bottom Help navigation stillworks.
Implement the complete receipt presentation withserver-backed exactrequest
evidence (not clientinvented time orlatest-other-attempt status),andrestore a
direct postanswer help destination. Do not infer completed AIcheck fromreceipt.
