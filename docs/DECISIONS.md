# Decisions

## 2026-10-03: new target and local-first execution

The application lives in `D:\understod`, separate from `D:\understood`. The target initially contains only the AI-first prompt. Do not migrate code or mutate the other checkout without explicit authorization.

The current environment has Node 24.5.0 but no PostgreSQL/Docker command and npm registry access failed in the sandbox. A dependency-light, file-backed SQLite synthetic slice may establish workflow and persistence locally, but this is a documented deviation from the requested PostgreSQL production target and is not a production database/auth readiness claim. Revisit after prerequisites are available.

No public deployment, live AI request, real message or paid resource will be initiated without authorization. Demo data is visibly synthetic. No mandatory human language-review state is permitted.

## 2026-10-03: Gemini and deployment target

The user selected the Gemini API free tier for this project and explicitly directed that real worker audio and responses remain off that tier. Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) labels free-tier content as used to improve its products. The server-only Gemini adapter therefore requires `dataClass: 'synthetic'`; it is mock-tested, not enabled in the running pipeline, and has made no provider request. A real-data provider path remains a privacy and release decision, not an implicit use of the free tier. Never put an API key in client code or chat.

For production infrastructure, target Render web/background worker and **Neon Free PostgreSQL**, plus a private Cloudflare R2 audio bucket. The user replaced the paid database target on 6 October 2026. No automatic Neon upgrade or paid PostgreSQL provisioning is authorized. See `DEPLOYMENT_TARGET.md` for quota, TLS, concurrency, backup and release gates. This choice does not authorize purchasing or deploying anything; free database hosting does not imply free compute/storage.
