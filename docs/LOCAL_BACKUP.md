# Local backup and restore

This utility backs up the current SQLite database and local private WAV files. It is not the Neon PostgreSQL or Cloudflare R2 backup solution. A passing isolated restore test is not cloud disaster-recovery evidence.

Use Node 24.5+ from `D:\understod`. Quiesce web/worker writes and any purge process first so audio cannot disappear while the database snapshot is copied. Never reset or seed over the source as a recovery shortcut.

```powershell
node scripts/local-backup.mjs backup --db data/understood.sqlite --audio data/private-audio --to D:/understod/backups/NEW_BACKUP
node scripts/local-backup.mjs restore --from D:/understod/backups/NEW_BACKUP --to D:/understod/restores/NEW_RESTORE
```

The output directory must be new. Existing targets are never overwritten or deleted. Restore targets must be outside the backup. Path/symlink checks, exclusive file copies, database integrity/foreign-key checks, SHA-256 checks and actual WAV validation fail closed. Missing or corrupt referenced audio rejects restore.

Backup uses Node's [native SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options) for a consistent DB snapshot. Only received recording references are copied. The manifest is bounded to 1 MB and 10,000 recording references; large workloads need a different backup strategy. If an operation fails, it leaves any partially created new directory unused; source data is unchanged. Do not start the app against a partial output.

Restore verifies the source and copied evidence before opening the new database for writes. Restored sessions and worker access grants are revoked, interrupted preparation/export jobs are queued, received processing recordings become retryable, and interrupted storage without a receipt is failed. A restore audit event is recorded per site. No source session or source DB row is changed.

The backup is sensitive and **unencrypted**: it includes worker responses, audio and authentication records. Checksums detect corruption, not authenticity; the manifest is unsigned. Use trusted storage, restrict Windows ACLs explicitly, and adopt an approved encryption/retention/off-device copy policy before real data. POSIX mode bits do not establish Windows ACL protection. Never put backups in `public` or serve them through Vite.

Test: `node --test tests/backup-restore.test.mjs`. The isolated temporary test preserves publication relationships and exact recording bytes, verifies source sessions remain active while restored sessions are revoked, and rejects existing destinations, path traversal, missing and corrupt audio. It does not start restored services or exercise a physical device/provider/cloud recovery.
