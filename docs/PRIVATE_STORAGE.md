# Private audio storage

The loopback app uses private local files. `server/private-storage.mjs` now also implements a server-only R2 adapter with the official AWS S3 v3 SDK. This is implemented and mocked locally, NOT verified against a cloud account.

R2 references are derived from authorized database rows: `audio/{org_id}/{site_id}/{recording_uuid}.wav`. No caller-supplied URL/path is fetched. Writes are create-only, content-validated WAVs; reads are bounded and verify the saved size and SHA-256 hash. Storage errors are redacted. No browser storage credentials, ACL grants or public URLs are issued.

Pass `r2AudioStore({accountId,bucket,accessKeyId,secretAccessKey,jurisdiction})` as `createAppServer`'s `audioRoot` option and to `processOneRecording` only in an explicitly configured server. The default launcher does not construct it. `jurisdiction` is `default` or `eu`; it must match the provisioned bucket. `.env.example` names the planned private settings, but does not enable cloud access.

Playback is proxied through the authenticated recording route, which rechecks the current worker/staff scope for every request and sends no-store headers. A revoked session cannot start a new playback request. Audio already downloaded or an in-progress response cannot be remotely erased.

Configure bucket-scoped credentials. Keep both public development access and public custom domains disabled. An API credential's presence does not prove this setting: inspect the bucket configuration and test anonymous denial before rollout. See [Cloudflare's SDK guide](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [public bucket controls](https://developers.cloudflare.com/r2/buckets/public-buckets/).

If storage succeeds but the receipt transaction fails, the app attempts compensating deletion and retains a failed database row. A failed compensating delete or process death can leave an orphan. Scheduled object reconciliation/purge, backups and isolated restore are still release requirements, not completed retention guarantees.

Checks: `node --test tests/private-storage.test.mjs tests/recording-reliability.test.mjs tests/app-recording.test.mjs`. They verify private command shape, scoping, bounds, integrity, receipt semantics, stale leases and authenticated local playback. No cloud request is made by these tests.
