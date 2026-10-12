# Hosted synthetic runtime

This is a deployment foundation, not production approval. The launcher accepts only explicit `staging`, synthetic AI/data, credential access and an isolated `understood_stage_*` schema. Production, real data, demo access and free-tier provider dispatch fail closed. The loopback rehearsal launcher remains available.

## Commands

Use `.env.hosted.example` as the environment contract. Supply server-only secrets through hosting secret settings, never browser fields or committed files. Build with `npm ci` and `npm run build`; run the web process with `npm start` and a separate worker with `npm run hosted:worker`. `npm run hosted:check` verifies the migration ledger and dedicated restricted runtime role. API/worker startup also rejects unsafe roles, schema-owner credentials and fenced read-only source roles. RUNTIME_PERMISSIONS.md documents separate maintenance ACL setup. These commands do not create schemas, seed identities, migrate data, provision cloud resources or verify R2/provider connections.

The web process binds `0.0.0.0` on `PORT`. It loads a bounded allowlist of optimized `dist` files at startup with correct MIME types, hashes, immutable hashed assets, revalidated HTML/worker script and a self-only CSP. Protected APIs/audio, source files, maps and environment files are not in this map. Preserve older hashed assets across rolling releases; deployment-level verification remains required.

The PostgreSQL client requires certificate-verified TLS to Neon Free. Web and worker use private R2 with server-only credentials. Storage probes are opt-in; pending cleanup continues. Cloud access policy, residency, lifecycle, restore and credentials remain unverified. Mail defaults to disabled.

## Proxy contract

TLS must terminate at a trusted reverse proxy. Set `UNDERSTOOD_TRUSTED_PROXY_NETWORKS` to a JSON array of exact socket peer IPs or narrowly scoped CIDRs. Empty lists and `/0` networks are rejected. The backend must not be reachable by untrusted clients. The proxy must overwrite client-supplied headers, not append or trust them:

- `Host`: the exact configured HTTPS origin host, including a nondefault port.
- `X-Forwarded-Proto`: exactly `https`.
- `X-Forwarded-For`: exactly one validated client IP, no chain.

Other transports are rejected before static files/customer routes. Auth throttling uses the verified client IP. Customer cookies use `__Host-understood_session`, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Separate operator cookies also become Secure. Existing same-origin and authenticated-session-context mutation checks remain.

`GET /api/health` without forwarded protocol is a minimal load-balancer check with no tenant data. It verifies database connectivity, not worker/provider/storage readiness. Other backend requests require the proxy contract. SIGTERM/SIGINT closes web connections with a 25-second deadline; the worker finishes its current awaited stage before stopping.

Render documents [web-service PORT/binding](https://render.com/docs/web-services), [Node build/start commands](https://render.com/docs/deploy-node-express-app), and [shutdown behavior](https://render.com/docs/deploys). Its exact trusted socket ranges/header-overwrite contract have **not** been established here. Do not widen trust to all networks or claim Render compatibility without proving that contract. No deployment/purchase occurred. Free database hosting does not imply free compute/storage.

## Evidence

`tests/hosted-runtime.test.mjs` uses isolated synthetic PGlite and actual local HTTP with simulated proxy headers. It proves configuration rejection, read-only startup, optimized file delivery, cookies, origin checks, credential scoping, IP budgets, logout and disabled demo/operator behavior. It does not prove real TLS, Neon concurrency/pooling, R2, Render, DNS, browser CSP/PWA, rolling updates or process-kill recovery. Explicit fresh synthetic workspace provisioning is documented in `WORKSPACE_BOOTSTRAP.md`; full site lifecycle, live AI/privacy approval and final release/reference/accessibility/device checks remain. Production startup is intentionally unavailable until required gates are satisfied.
