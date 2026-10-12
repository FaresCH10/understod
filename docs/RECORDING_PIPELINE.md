# Recorded Answer Pipeline

Migration 063 allows separate immutable provider reservations for answer
transcription (four requests: upload start, upload finish, transcription, cleanup)
and assessment (one request). A failed assessment reuses the persisted transcript
under a fresh bounded lease; it does not upload the recording again. Unknown
provider errors are redacted and counted conservatively against request quotas.

The PostgreSQL awaited worker cycle includes `recording`. It is off by default.
To explicitly enable an isolated LOCAL synthetic credential rehearsal, use
`UNDERSTOOD_RECORDING_ADAPTER=gemini-free`, `UNDERSTOOD_DATA_CLASS=synthetic`,
and `UNDERSTOOD_SYNTHETIC_AUDIO_HASHES` containing only independently identified
synthetic canonical WAV SHA-256 hashes. Global and tenant request quotas must
also be explicitly enabled by the separate operator. Never register real audio
or connect this free-tier runtime to real worker records. No key alone enables
dispatch; hosted staging rejects this setting. The provider handle exposes no
preparation, translation or speech generation methods.

Private object bytes/hash are checked before upload. Allowlist checks also apply
when a cached transcript exists. Claim and each dispatch recheck provider/global
pause, tenant suspension, current worker, recording lease and pending audio
purge. Transcript persistence and final assessment reject obsolete leases,
worker revocation, purge and pause. Already accepted historical answers retain
their original frozen publication rubric and assignment language; withdrawal
does not rewrite their evidence. Cleanup may use its already reserved allowance
after pause or lease loss, without permitting new content dispatch.

Completion creates one attempt and one check audit for the original audio
receipt. A submitted supervisor-requested repeat creates a new attempt but does
not duplicate or automatically resolve its original clarification case. Original
answers, receipt timestamps, assignments and assignment-based counts remain intact.

## Evidence And Limits

Focused tests exercise configuration/privacy rejection, default-off scheduling,
metered mock provider calls, transcript reuse, paused upload with permitted
cleanup, lease/worker/purge fencing, repeated voice evidence and HTTP receipt
replay. Tests run in disposable embedded PostgreSQL and local HTTP fixtures;
no real Gemini, cloud storage, real worker data or saved main workspace is used.
Reticle is unconnected and provides no verdict. Actual PostgreSQL multi-process
concurrency, native microphone/phone, live speech quality, privacy-approved real
data processing, hosted deployment and complete release verification remain open.
