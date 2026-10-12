# Architecture and acceptance review

Reviewed: `Understood_AI_First_Engineering_Team_Prompt.md` (all 383 lines, version 2026-10-02) in `D:\understod`. This is a design recommendation for an empty target, not an implementation or test result. It owns no schema/code decisions until the lead records them in `docs/DECISIONS.md` and the implementing owners agree on contracts.

## Recommendation and boundaries

Use a small TypeScript/React modular monolith with one PostgreSQL database, an established server-side staff auth implementation, private object storage abstraction and a separate DB-backed worker process. Next.js is an acceptable candidate, not a requirement; record exact runtime/framework/auth/DB/test versions after current official documentation checks. Share validated server contracts and domain functions between web and worker, but keep AI/storage/email providers behind narrow server-only adapters. The synthetic demo must use the real DB, grants, jobs, publications and attempts. It may substitute deterministic AI, speech and delivery adapters only, and must be visibly labeled. No real-world claims from the demo.

Avoid separate services, custom auth cryptography, a generic workflow engine, a live payment processor, consumer-chat automation or optimistic browser-only persistence. Use relational constraints/transactions before application-side repair logic. A persistent DB-backed queue can be one `jobs` table plus worker polling at pilot scale; measure before introducing broker infrastructure.

## Domain source of truth

One `organization_id` on every customer-owned row, with `site_id` where applicable. Require tenant-safe composite references (for example `(organization_id, publication_id)` to publications) or equivalent DB enforcement, not just controller filters. Server identity/session/grant decides tenant/site/role; posted IDs never confer authority. Files and jobs carry the same scope. Operators have a separate principal and no implicit content access. Use UTC server timestamps and distinguish client capture time.

Core entities/invariants to agree before code:

| Entity group | Essential invariant |
| --- | --- |
| Org/site/crew/worker/membership | One owning tenant; site- and crew-scoped assignments; disabled/archived identities denied new operations; crew changes do not retroactively alter assignment snapshots. |
| Staff principal/session/site grant/invite | Role and site scope resolved server-side; last owner protected; invite token stored only as a hash, expiring, one-use and revocable; acceptance links membership atomically. |
| Worker grant/session | High-entropy expiring/revocable grant exchanged into restricted session; hash only at rest; no identity-proof claim; auth rechecked on every API/file/upload/reconnect. |
| Briefing/draft revision | Source, facts, question, private rubric and glossary input have monotonic revisions/dependency fingerprints. Edits invalidate dependent artifacts. Stale job result commits fail on expected revision/hash mismatch. |
| Generated artifact | Exact input hash, language, kind (text/question/audio), provider/model/prompt/schema versions, technical validation, private object reference, usage and provenance. Status is not human approval. |
| Publication/assignment | Publication transaction freezes source/facts/question/rubric/language artifacts/provenance and snapshots exact recipients. The published record and old assignments are immutable; withdrawal/supersession is separate state/history. |
| Recording/attempt/assessment | Stable client submission ID unique per assignment; deliberate repeat gets a new attempt ID. Attempt references exact publication and rubric. Assessment records evidence/reason/uncertainty; resolution does not rewrite original assessment. |
| Help/clarification/follow-up | Case uniqueness against the source event or help request; owner/due/status/escalation and each message/attempt preserved. Optional human assistance, no mandatory answer-review queue. |
| Job/outbox/schedule/notification | Durable due time, idempotency key, bounded attempts, lease and safe error; authority/version/suspension rechecked before effects; delivery accepted is not receipt/read. |
| Usage/export/retention/audit/invoice | Scoped immutable usage and audit events, atomic quota reservation/reconcile, exact CSV exports with expiry, scheduled purge, correct invoice items/totals/payments/balance and actor trail. |

Suggested database constraints: unique `(organization_id, worker_reference)` where active, unique `(assignment_id, client_submission_id)`, unique job/outbox idempotency keys within operation scope, nonnegative usage/payment amounts, valid enum/check states and foreign keys on organization-scoped pairs. Index scope plus common filters/due times (`organization_id, site_id, status, due_at`), not every column speculatively. `DELETE` of published/evidence rows should not cascade away audit/history; implement retention as an explicit authorized lifecycle with policy and backup limits.

## State and transaction contracts

Draft states: `draft -> queued -> processing -> ready`; technical failure moves to repairable `failed`, retry only against the current revision. A ready draft may become `scheduled` or `published`. `published -> superseded|withdrawn|archived` must preserve the frozen snapshot. Do not model source/language approval. A scheduled execution repeats authority, quota, version, artifact, audience and suspension checks before publication.

The publication operation needs an idempotency key and optimistic expected revision. In one DB transaction: lock or compare draft, verify role/site/current revision; verify required source/facts/question/rubric and every selected recipient's language/audio readiness; reserve quota; insert frozen publication and assignment snapshot; append audit/outbox; set status. On collision, return the prior result or conflict. Show unsupported recipients explicitly, never drop them silently. Reminders derive from snapshotted assignments and persisted deadlines (A02/A12).

Worker attempt states should distinguish `local_only`, `uploading`, `server_received`, `ai_pending`, `matched`, `needs_clarification`, `unassessable`, and conflicts such as `expired`, `withdrawn`, `superseded`, `rejected`. `local_only` is not a server record until upload; UI language must say saved on this device. Reconnect checks grant, worker, assignment, exact version, deadline and duplicate submission ID before write. The server response confirms receipt only, not check completion. Playback is an event, not attention. One response-completion numerator is the count of assignments with at least one accepted server-received attempt at cutoff; denominator is assigned unique recipients for that publication. Outcome categories use the defined current-attempt rule (prefer latest accepted assessment at cutoff, keep history) and must sum consistently. Canonical 24/30 is 80% response completion; 21/3 are outcomes among received, with 6 pending (A01/A07/A15).

Job claim should be atomic (PostgreSQL row locking/lease or equivalent). Workers heartbeat, retry transient failures with bounded backoff, and reject stale revision results on commit. Provider calls can have unknown outcomes after timeout; do not promise exactly-once charges. Persist job attempt and provider correlation IDs without sensitive content, reconcile where supported. Transactional outbox ties publication/submission/notification/export/deletion events to DB effects. Use an explicit kill switch and tenant/global quota before paid jobs (A04/A08/A16).

## Server API/data contracts

Define schemas and negative authorization tests for each boundary before UI integration. The route shapes below are illustrative, not a mandate for an RPC/REST framework:

- Staff: session, scoped org/site/crew/worker CRUD, invites, drafts/revisions/artifacts, publish/schedule/withdraw, assignments/responses, clarifications, reports/exports, settings/billing/audit. Every collection query is tenant/site bounded and paginated; every detail and object download reauthorizes.
- Worker: grant exchange, own assignment list/detail, short-lived authorized audio URL, stable-ID response upload/receipt, own current outcome/help/follow-up, session switch/end. Worker DTO allowlists never include rubric, correct-answer flags, coworker results, staff notes, billing, internal jobs or unpublished content.
- Operator: separately protected tenant/job/provider status, suspension and budgeted verification. No default transcript/audio access or universal impersonation.
- Objects: no arbitrary remote URL fetch or user path; validate actual content/codec/size/duration and corruption; issue private object keys server-side and short-lived read URLs only after current authorization. Document URL lifetime and that already-downloaded bytes cannot be revoked.
- Auth/mutation: established secure sessions, origin/CSRF handling appropriate to stack, server validation, throttling and safe generic errors. Recovery/invite/inquiry delivery reports stored/queued/accepted/failed truthfully and does not enumerate accounts.

Permission matrix baseline (apply to reads, writes, exports, files and jobs, not only UI):

| Principal | May do | Must deny |
| --- | --- | --- |
| Owner/admin | Manage only their permitted organization/sites/staff/config; owner-only controls as configured. | Other tenant; platform controls; last-owner removal. |
| Site supervisor | Create/publish/manage assignments and clarify within granted sites. | Other site/tenant; owner settings; private operator controls. |
| Read-only auditor | View scoped audit/report data with documented privacy limits. | Mutations, private worker content unless explicitly granted. |
| Worker | Own current assignments, audio, attempts, help, session/device controls. | Rubric, coworker/staff directories, other assignments, unpublished content. |
| Platform operator | Health/jobs/provider/tenant suspension under separate credentials. | Automatic customer content access, silent impersonation. |

## AI contract and evaluation

The runtime AI takes bounded untrusted data and returns validated structured output. Prepare source into transcript/title/asked key facts/practical question/private rubric; detect empty/noisy/ambiguous source, do not invent. The rubric must test the facts actually asked: the canonical shelf question requires finished/blue and unfinished/yellow, not the unasked walkway instruction. Translation covers title, body, question and follow-up in each supported language. Speech is generated from the exact persisted target text/hash. Assessment compares the worker's exact-version attempt with the frozen asked-fact rubric, recording matched/missing/contradicted/unrelated/uncertain/unintelligible/provider-failure evidence. Neither keyword overlap nor confidence number means comprehension; malformed/uncertain/error cannot silently match. A worker cannot access the private rubric before or after submission unless product policy explicitly permits a carefully staged explanation (A03).

Validate provider response schema, language, completeness, dependency hashes and audio content before `ready`; transport success alone is insufficient. Prompts/model/schema versions and safe provenance are saved; customer text cannot instruct the server to run tools, change policy, expose secrets or mark itself correct. The runtime adapter has no engineering MCP privileges. Evaluation corpus must include correct paraphrases, shelf swap, negation, missing asked fact, unrelated, silence/noise, unsupported language, injection, malformed output and provider errors. Report false matches separately from false clarification/unassessable by language/model/version. Small synthetic success is only local evidence; native-language QA and real-device tests are distinct launch work (A03/A04).

## Risk-ranked decisions for the lead

1. **Stack/auth/storage versions:** verify current official docs and installed tooling before choosing; prefer a supported integrated auth/session library, PostgreSQL migrations and private local demo storage. A custom token/session scheme is high risk. Record exact versions and lockfile (A05/A18).
2. **Reference availability:** screenshots were attached to the conversation, but no images were in the target project at initial inventory. Persist or otherwise make all 44 selected originals available for repeatable inspection/comparison; do not assert visual parity until then (A17).
3. **Live provider/account:** decide only after official capabilities, country/account eligibility and budget approval for transcription, preparation/translation, speech and assessment. Missing key is an external block to live verification, not a reason to fake readiness (A04/M5).
4. **Worker identity/privacy:** a bearer link grants access but does not prove who holds the phone. Keep short expiry/revocation, shared-device clearing and minimal cache; report physical identity assurance as outside this product (A06/A07).
5. **Offline/outbox:** browser storage can preserve local data but cannot promise upload while closed, remote wipe or no loss. Foreground retry and explicit unsent warning are required; avoid caching protected API responses broadly (A07/A16).
6. **Audit and retention:** application-level append-only logs are not tamper-proof against privileged DB admins; purge must coordinate objects/DB/exports/jobs and disclose backup limits. Test restore separately (A16).
7. **Scope risk:** 44 pages plus backend/security/live/device gates are substantial. Preserve the full register and truthfully mark unfinished areas; do not promote a visually convincing slice to pilot-ready status (A17/A18).

## Review checks to request at integration

- A05: attempt cross-tenant/site IDs against list, detail, join, object, job, export and notification paths, including privileged service paths. Confirm DB constraints reject inconsistent references.
- A02/A08/A12: concurrent edit/publish, stale AI result, duplicate publish/upload and worker death before/after provider/result commit. Confirm one business effect and preserved old publication.
- A03: run the grounded evaluation fixtures and inspect evidence codes; verify canonical correct answer omitting walkway passes while swapped shelves cannot match.
- A07/A15: reload/disconnect/shared-device switch; compare local/received/checked labels and compute report counts from persisted assignment/attempt rows.
- A11/A16: expire/reuse invite/reset, verify generic recovery; test formula-safe bounded CSV, retention job and isolated DB+object restore.
- A17/A18: compare all 44 running screenshots against selected references, inspect keyboard/RTL/320px states, rerun clean setup/type/lint/test/build in the documented environment. Distinguish actual evidence from planned checks.
