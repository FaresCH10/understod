# Isolated Backend Pipeline Rehearsal

Checkpoint: 2026-10-11. This is a repeatable application-workflow check, not a
live-provider, native-language, hardware, browser or production-release verdict.

Latest preparation checkpoint: migration 069 adds immutable accepted stage links
with exact root/argument/provider hashes and model/prompt/schema. The current report
includes eight bounded stage records, without raw arguments or credentials. See
PREPARATION_PROVENANCE.md for the new preserved artifact and executed checks.

Latest follow-up checkpoint: migration 068 adds exact input/provider evidence and
immutable accepted delivery links. The report includes both generation models,
voice and prompt/schema versions. English uses one accepted speech request, Arabic
three accepted translation/check/speech requests. See FOLLOWUP_PROVENANCE.md for
the new preserved artifact, 54 focused checks and limits. Earlier evidence below
is historical where explicitly labeled; it is not overwritten.

## Run

```powershell
npm run evaluate:rehearsal
npm run evaluate:rehearsal -- --output artifacts/new-pipeline-report.json
node --test tests/pipeline-rehearsal.test.mjs
```

Every run creates an in-memory PGlite database and a generated isolated test schema,
runs the real migrations, then closes the database. No connection URL, existing
database, provider credential or transport is accepted from environment variables
or command arguments. The script never starts a server or worker loop, and never
opens the existing SQLite database. Private objects use a scoped in-memory store;
this does not verify R2, filesystem persistence or hosted PostgreSQL concurrency.
Output creation is exclusive; existing checkpoint reports are not overwritten.
Invalid CLI options exit 2, failed checks exit 1, successful checks exit 0.

## Application Paths

Nine workflow checks use normal domain/authentication entry points:

1. Confirmed synthetic workspace bootstrap, owner password authentication, actual
   cookie-session lookup, worker creation, grant issuance/redemption and one-use denial.
2. Private original/canonical source upload, exact receipt replay, scoped access,
   paused dispatch denial and asynchronous transcription creating one real draft.
3. Automatic fact/question preparation, grounding check, Arabic title/body/question
   translation/check and four private English/Arabic speech tracks.
4. Ordinary customer publication, replay, private assignment playback, other-worker
   denial and preservation of the published snapshot after a later draft edit.
5. Four typed answers through asynchronous assessment jobs: English/Arabic matches,
   missing fact and injection. Exact published question/rubric/version/model evidence
   is read through the existing read-only evaluation reader, without extra dispatch.
6. Private recorded Arabic answer, allowlisted transcription, assessment against the
   original publication and replay without duplicate attempts.
7. Independent help after a match, translated/checked private follow-up speech,
   delivered-message replay, other-worker denial and unchanged original outcomes.
8. Exhausted global/tenant request budgets block generation of the later draft,
   with no additional provider reservation/request and no change to the publication.
9. Revoked worker grants invalidate both new session lookups and captured credentials
   attempting to read private assignment speech.

There are no manually inserted ready publications, completed assessment jobs,
matching attempts or delivered follow-ups. Maintenance setup inserts only isolated
provider policies/control configuration. Business results come from application paths.

The final report has five assignments/responses, three matches, two clarification
outcomes, zero pending, and 100% response completion. Independent help creates a
third clarification case without changing those response metrics. This five-worker
fixture is separate from the canonical 30-worker design data and the existing demo.

## Provider Evidence And Limits

The actual configured Gemini adapters use a fixed strict scripted transport. It
verifies stage order, URLs, models, exact inputs and upload bytes. Unplanned requests
never reach a network transport. The regression replaces global fetch with a failing
guard; the workflow still completes. Twenty-four scripted requests are accepted
through sixteen real immutable provider operations, with exactly twenty-four
reserved slots under matching global/tenant caps:

- Source transcription: four requests, one operation.
- Preparation/check/translation/check/private speech: eight requests, eight operations.
- Typed assessment: four requests, four operations.
- Recorded transcription and assessment: five requests, two operations.
- Arabic follow-up translation/check/speech: three requests, one operation.

Synthetic audio consists of generated tones, not spoken instructions or microphone
recordings. Authored transcripts, translations, checks and assessment labels are
scripted. A perfect observed semantic result is constructed, not measured model
accuracy. The report carries these limitations and productionReady=false.

Typed jobs and, since migration 067, source/recorded operations persist exact
input/model/prompt/schema provenance and immutable completion links. The reader
verifies recorded transcription and assessment against the effective frozen
publication inputs. A separate recorded report completes one Arabic observation,
leaving three cases not run. Unknown legacy history stays unknown. See
AUDIO_PROVENANCE.md for current evidence; the earlier report below honestly marks
its then-incomplete source/recorded linkage and remains preserved.

## Versioned Localized Fixtures

`evaluation/pipeline-v1.json` uses dataset schema v2 to freeze the effective English
and Arabic questions independently. Version pipeline-rehearsal-2026-10-11-v1 binds
canonical hash 1021a1fa6d1ca5c2ae630a7d998382e4f6434690d96ed0c8fa7fd77229fcc69c.
Changed translations/questions/labels require a new version, not relaxed runtime
matching. The original 43-case dataset and its English questions remain unchanged.

The CI workflow now includes the named rehearsal command. No fresh hosted CI run
was performed. This checkpoint ran 34 focused tests with zero failures/skips and
passed the strict TypeScript/build command. All 62 shell file hashes match. Existing
bundle-size/offline import warnings remain. A first fixture pause lacked its control
row; later fixture corrections supplied the required revision and correct follow-up
request/draft-language fields. Failed runs were corrected, not counted as passes.

`artifacts/pipeline-rehearsal-2026-10-11-final.json` was generated successfully:
SHA-256 27761e16e15eeffbec6d0ffa95625a1eb6710d5c2937c5ffee2a710a97a04a9c.
The existing eight SQLite business-table hashes still match the prior preview
checkpoint, integrity is OK and foreign-key violations are zero. That comparison
does not cover all tables, sessions or audit history.

Live provider calls, real data, cloud provisioning/deployment, browser workflows,
native-language QA, microphone hardware, release security/accessibility/performance,
restore/concurrency and pilot acceptance remain separate open gates. Free Gemini
remains synthetic-only. This command neither authorizes nor performs a live rollout.
