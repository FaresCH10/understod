# Worker Playback

2026-10-16 S21 playback controls/primary-first layout locally verified, task85%; overall73% estimate.
Not full S21 reference/device/AT/speech/hosted or production acceptance.

Implemented native HTMLMediaElement-backed play/pause, finite elapsed/duration,
range input, replay, speed0.75/1/1.25/1.5/2, localized EN/AR/UR controls and errors,
body/question exclusivity and unmount pause. Read text now uses native details/
summary instead of toggling a hidden sibling imperatively. No playback outcome
or attention is inferred. No provider/storage/permissions change intended.

Focused8 tests andtypecheck pass. First clean snapshot e48e8105-4be9-4df3-9d29-
ac8b82571a39 passed,exec61397 terminal0,11:46:39.802-11:51:51.735UTC:
1193tests/1189pass/zero fail/four native skips,294124.2113ms,offline build and
both evaluations; source842 SHA75c1d5854d876944bd9729fb891d1f1bcbd9df3784db33bb8f53ed4e048a3069.
This does NOT pass functional seeking; the browser defect below remains part of
its historical result. Root source subsequently changed for the repair.

Built memory-only generated-audio fixture8254 exposed a real playback defect:
actual12second body tone starts/pauses andrate1.5 applies, but seekable is[[0,0]].
Keyboard End/ArrowRight andReplay do not seek. Current native speech endpoint
ignores Range; current UI also enables controls for a zero-length range. This
candidate fails seeking and is not done. Fixture stopped with actualexit0,
audioReads2/writes0/attempts0/externalCalls0; briefing andpublication inventories
unchanged. Owned QA tab closed; original preview/data untouched.

Next repair: authenticated worker body/question WAV single-byte-range responses,
always after existing scope/storage/integrity checks; disable seeking until a
positive actual native seek range exists. Add partial/suffix/bounds/privacy
regressions, rerun isolated build andactual media checks before acceptance.

Repair implemented after that snapshot: private worker speech calls
sendPrivateWav only AFTER complete existing scope/storage/integrity authorization.
Single bounded/open/suffix byte ranges return206/exact bytes; unsatisfiable416
is empty, unsupported units/multipart and unverifiable If-Range return full200.
No ETag, public caching, signed URL or bypass path is added. Each request reads
and verifies the complete object before slicing; not storage-range optimization.
UI rejects zero-length actual seek ranges. Five focused helper/player checks
pass103.3996ms,typecheck passes andactual scoped HTTP regression passes2688.4086ms.
Fresh clean5b3c6dbb-7d19-4c6c-95c0-e3cfbaa4b496,exec11196 running;844files SHA
cddc523e3a1a7146c754a5ac0f59c2f9642b6af5408b5905898b602671cc78e1.
Repaired browser fixture24792 passed the scoped browser checks andstopped with
actualexit0:audioReads12/writes0/attempts0/externalCalls0; briefing/publication
inventories unchanged. Owned tabs6/7 closed andviewport reset. Evidence:

- Real browser seekable range[[0,12]], End reaches12seconds, ArrowRight reaches
  0.1seconds, Replay restarts at0.52seconds andactual playback is unpaused.
- Rate1.5 applies; starting question pauses body, question Pause changes its
  actual paused state. No fake elapsed counter or playback event is stored.
- Enter opens native Read text disclosure and exposes the exact public text.
  The AX button role did not map to Playwright's role selector for summary;
  the observed semantic summary selector worked. This is a tooling difference.
- Fixed storage read failure produces truthful error/disabled seek and replay.
  Explicit reload after restoration clears body error, restores duration12 and
  actual playback. The failed question stays failed until its own reload.
- Navigating away removes both media elements. Unmount pause is implemented;
  this is not acoustic-output or mobile-background interruption evidence.
- Each of EN/AR/UR at actual320/390/768/1440 has no document or player overflow;
  native controls/labels follow UIlanguage while assignment content staysEN.
- Inspected captures inartifacts/:worker-playback-en-390-2026-10-16.png,
  worker-playback-en-1440-2026-10-16.png,worker-playback-ar-390-2026-10-16.png,
  worker-playback-ur-390-2026-10-16.png. These show real controls, not reference
  pixel matching. No manufactured waveform was introduced.

Historical layout follow-up: optional private saved-work controls preceded
and push the primary player below the first viewport. Move their existing
controls after the primary listen/question section without hiding recovery
warnings or changing saved work,then compare the selected S21 reference.
The player slider focus outline crowded its time label; repaired below.
Repaired clean5b3c6dbb,exec11196 terminal0,11:52:33.471-11:57:45.402UTC passed
locked offline install/build,1195tests/1191pass/zero fail/four native skips,
294312.5675ms,43contract/ten pipeline checks,24scripted/zeroexternal requests.
All844source files unchanged,SHA cddc523e3a1a7146c754a5ac0f59c2f9642b6af5408b5905898b602671cc78e1.
Preservationaff05c1b:original8fingerprints/integrityOK/FK0,32savedmanifests valid,
3069selectedfiles/zero configured-secret matches. No complete/release verdict.

## Primary-first Layout

Moved the same three always-mounted saved-work components afterlisten/question/
help,before history,without hiding recovery notices orchanging keys/props/guards.
Native player time/slider gap8px keeps focusoutline clear. Fourteen focused
checks pass124.7212ms andtypecheck passes.

Clean947bfe0f-12f9-4d38-9e7b-c5037bc94646,exec4153 terminal0,
12:00:51.172-12:06:03.394UTC:lockedoffline install/build,1196tests/1192pass/
zero fail/four native skips,294630.701ms,43contract/ten pipeline checks,
24scripted/zeroexternal requests. All845sourcefiles unchanged,SHA
25d3e9a8540d9704f211464d5aa2d735d2b5df5d02f46865d56405e1c9bebe18.

Builtfixture1182 actualexit0,audioReads8/writes0/attempts0/externalCalls0;
briefing/publication inventories unchanged. Explicit private-device confirmation,
synthetic unsentanswer/saveconsent/save,cleareditorcopy/reload/explicitrestore
recovers exacttext with Nothing was sent. Test snapshotremoved,editorcleared and
sharedmode explicitlyrestored. No recording/microphone/answer/helpPOST.
One dynamic textlabel locator failed afterits label included theenteredvalue;
observed question-textarea selector worked. A read-only DOM adapter lacked
compareDocumentPosition; geometryreadback confirmedorder instead. Neither was
counted as a functional failure or hidden DOM mutation.

EN/AR/UR actual320/390/768/1440 fit withplayer top424.67px mobile/378.75px wide,
question top638.67/546.75; English821x1600 selectedreferenceviewport alsoinspected.
Sliderlabelgap8px andArrowRight actual0.1seconds verified. Savedtools remainbelow
theprimaryflow,notcollapsed. Ownedtabclosed andviewportreset. Userpreview not
navigated orrebuilt. Captures:worker-primary-first-en-390-2026-10-16.png,
worker-primary-first-en-reference821-2026-10-16.png,
worker-primary-first-ar-390-2026-10-16.png,
worker-primary-first-ur-390-2026-10-16.png inartifacts/.

This improves the S21 task-first composition but does not claim pixelmatching:
synthetic tone/duration/text/fixture labels differ, no fake waveform, header/
typography/control geometry andfull record-mode reference comparison remain.
Preservation9cb5251e:original8fingerprints/integrityOK/FK0,33savedmanifestsvalid,
3135selectedfiles/zero configured-secretmatches. Wider limitsabove remain.

Native media behavior references inspected2026-10-16:
[play promise](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play),
[playback rate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate),
[HTTP ranges](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
Playback mechanics/tone evidence is not actual speech, listening-device, phone,
assistive-technology, full-reference or hosted acceptance.
