# Neon Free Test Setup

Checked2026-10-14 against official Neon connection documentation. This prepares
an isolated synthetic-only cloud database, not public deployment or real data.

1. Open https://console.neon.tech and sign in/create your own account. Keep the
   organization on Free. Do not enable a paid plan or add billing for this task.
2. Create a NEW project named `understood-synthetic-test`. Use an EU region
   such as Frankfurt if available and keep the offered default PostgreSQL
   version/settings. Do not import existing/customer data or branch from an
   existing real-data project. A default branch named production is just a label
   in this new disposable project; it must contain synthetic test data only.
3. Open Connect, select this project's branch/database/owner role, and turn
   Connection pooling OFF. Copy the direct `postgresql://...` connection string,
   not a psql shell command. The host should not contain `-pooler`.
4. In the ignored `D:\understod\.env`, keep the existing Gemini setting and add:

   ```dotenv
   UNDERSTOOD_NEON_TEST_URL="PASTE_THE_DIRECT_NEON_CONNECTION_STRING_HERE"
   UNDERSTOOD_NEON_TEST_ISOLATED=true
   ```

   Keep the original URL including Neon TLS parameters. Never put it in
   `.env.example`, Git, frontend code, screenshots or chat. The dedicated cloud
   rehearsal will validate/normalize the URL and explicitly require verified
   TLS; the application's pool config rejects URL TLS overrides and will not
   be called with an unvalidated raw string.
5. Reply `Neon test database is ready`. Do not paste the URL or password. Do not
   run migrations, seed commands, imports, the full native test suite or deploy
   anything yourself yet. I will prepare/check the guarded cloud rehearsal,
   confirm the isolated target, and use scoped synthetic test schemas only.

## Project-Specific Safeguard

The earlier request mentioned `UNDERSTOOD_PG_TEST_URL`. Correction: current
native automated tests explicitly require localhost and a test database name;
the concurrency test rejects remote hosts. Leave that variable unset for Neon.
`UNDERSTOOD_NEON_TEST_URL` is the dedicated input for the guarded cloud rehearsal,
not a universally supported substitute for the localhost-only test runner.

Update2026-10-14: the user configured the isolated target. Connection preflight,
86 migrations/checksums/replay and concurrent synthetic domain checks passed on
PostgreSQL18 over verified TLS. The user additionally authorized temporary
isolated NOLOGIN roles; their scoped checks passed and both roles and the owned
synthetic schema were removed. No LOGIN credentials, project, paid plan, public
deployment, real data or external provider/mail calls were created. See
`NEON_SYNTHETIC_REHEARSAL.md` for evidence and remaining production gates.

Update2026-10-15: the user separately authorized a temporary database and LOGIN
role. The actual direct-login production-permission/runtime test passed, then
both resources were removed. The generated expiring password was never saved in
local configuration or evidence. Existing database ACLs were unchanged. See
`NEON_LOGIN_REHEARSAL.md`; this is not hosted application/private-storage rollout.

Official sources:
- https://neon.com/docs/connect/connect-from-any-app
- https://neon.com/docs/get-started/signing-up
- https://neon.com/blog/neon-free-plan-1-gb-per-project
