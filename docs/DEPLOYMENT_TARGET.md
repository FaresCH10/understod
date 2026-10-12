# Deployment target (not deployed)

The database target is **Neon Free PostgreSQL**, as requested on 6 October 2026. The remaining target is a Render Node web service, a Render background worker, and a private Cloudflare R2 bucket for audio. Select compatible EU regions for the services/database and an R2 EU-jurisdiction bucket, subject to a privacy and residency review. Render documents [background workers](https://render.com/docs/background-workers) and [Frankfurt availability](https://render.com/docs/regions). Cloudflare documents [R2's S3 API](https://developers.cloudflare.com/r2/get-started/s3/) and [EU jurisdiction controls](https://developers.cloudflare.com/r2/reference/data-location/).

Do not provision paid PostgreSQL or automatically upgrade Neon. Free database hosting does not make Render compute or R2 usage free. No account, payment, bucket, database, DNS record, or public endpoint has been created, and this target is not verified production readiness.

## Neon connection and capacity gates

- Use the existing `pg` client and `UNDERSTOOD_POSTGRES_URL`. Set `UNDERSTOOD_POSTGRES_TLS=true`; certificate verification stays enabled. Remove URL `sslmode`, `sslcert`, `sslkey`, and `sslrootcert` parameters because this application configures TLS separately and rejects conflicting URL overrides. Never print the secret connection URL or commit it.
- Neon supports [standard PostgreSQL connection strings and pooled endpoints](https://neon.com/docs/get-started/connect-neon). Use a direct endpoint for migrations, cutover and backup/restore checks; validate a pooled runtime endpoint against the real concurrency suite before selecting it. Repository advisory locks and search paths are transaction-local. The existing pool is bounded to eight connections per process.
- The [2 October 2026 free-plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project) describes 1 GB storage per project and a six-hour instant-restore window. Recheck actual project quotas in the console before launch. A short provider restore window is not a substitute for independent encrypted backups and a tested restore.
- Prove startup after scale-to-zero, request latency, worker compute consumption, connection limits, storage/transfer headroom and safe quota-exhaustion behavior with synthetic data. Pause admission and alert an operator when capacity is exhausted; never claim availability or enable billing automatically.

Before deployment:

An explicit synthetic-only hosted web/worker launcher now exists with optimized static delivery, TLS-proxy validation and Secure cookies. See [HOSTED_RUNTIME.md](HOSTED_RUNTIME.md) for commands and unverified proxy/cloud gates. This does not enable production or real-data processing.

1. Replace the local SQLite repository with versioned PostgreSQL migrations and transactional tenant/site constraints. Prove concurrent publish, job claim/replay, and authorization with a real PostgreSQL integration suite.
2. Replace local audio files with private R2 objects, server-authorized reads, short-lived access where needed, scoped credentials, lifecycle deletion, and restore checks. Never make the bucket public.
3. Run the API and worker as separate services with secrets in Render environment settings, health/readiness probes, structured audit logs, bounded queues, backups, and a tested restore.
4. Finish invitation/recovery, retention/export/deletion, cost controls, accessibility, real-device testing, the remaining selected screens, and a security review before live workers.
5. Keep free-tier Gemini limited to synthetic evaluation. Real worker content needs a separately privacy-approved provider/data policy. No production mode may silently fall back to the synthetic processor.

Provider documentation and pricing can change. Recheck terms and costs before purchasing or publishing.

Public PWA shell deployment contract: serve the final generated `dist` output at root over HTTPS with correct HTML/JavaScript/CSS/manifest/image MIME types, public non-personalized HTML, and revalidated worker script headers. Preserve earlier hashed assets during rolling updates. The service worker excludes protected APIs/audio and access-link queries. The built local fixture proves only this static contract; the Render runtime/static delivery, update behavior and real-device installation remain deployment gates. See `PUBLIC_SHELL.md`.
