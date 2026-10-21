# Independent Worker Heartbeat

2026-10-16. Local implementation and acceptance checkpoint; not production
approval or native database/network-failure evidence. No cloud resource, real
worker content, provider request, mail, billing or deployment was changed.

## Lifecycle

The worker now publishes health and its verification capability atomically in
one transaction under the actual worker role. The API-profile legacy runtime
still cannot access the capability table. Existing separately callable health
and capability helpers retain their behavior. No migration or privilege change
was required; the schema remains 91 migrations / 137 tables.

An independent serialized timer publishes a current snapshot every five seconds
after the preceding publication completes. It runs while an awaited stage is
in progress, including graceful drain of the current stage. It does not queue
overlapping writes or a backlog of ticks. The normal 30-second capability
freshness check still fails closed during database/event-loop unavailability.
The stage name is sampled from current execution, not frozen at the first stage.

Redacted stage failures remain pending until a successful publication includes
them. Versioned acknowledgement prevents a newer same-stage failure from being
lost while a write is in flight. No raw database/provider error is stored or
forwarded through worker health.

A heartbeat failure aborts the worker's scheduling loop and notifies supervision
with the bounded `workerHealth` label. A separate internal failure signal blocks
new verification dispatch before and after request admission and prevents late
result promotion. Already-sent requests are still accounted for; this does not
recall external transport or refund quota. Ordinary shutdown does not cancel the
already-awaited stage: it drains, then no next stage begins.

Stop cancels the timer, drains any current publication and only then writes the
terminal snapshot. That snapshot is sampled after the drain, including a newly
discovered heartbeat failure. The runtime rejects with a bounded error even if
failure is discovered while it is already stopping. A later active heartbeat
cannot race behind the stopped write. Terminal-write failure is observable too.

## Local Evidence

- Existing operations, queue and runtime regression passed 31 tests before the
  additional liveness tests. No original assertion was removed.
- Five pure timer tests pass: cadence bounds/startup redaction, no overlap,
  held-write stop ordering, no automatic retry after failure, terminal failure,
  and a failure discovered during stop. Final five-test run:299.7894ms.
- Queue/runtime/timer focused group passed 33 tests,40936.0921ms before the final
  late-stop additions. The scaled 800ms observation window is labeled synthetic;
  its held request proves freshness/continued drain with actual SQL role grants.
- A separate default-cadence test passed in37915.0779ms: two fixed scripted
  requests held18seconds each, the real five-second heartbeat and real30-second
  freshness query. It observes a busy verification stage, advanced DB timestamps,
  two accepted requests and a verified original receipt. No external transport
  ran. This is stronger than the accelerated timing case, not live model quality.
- Final three affected SQL tests pass5315.4869ms: atomic health rollback when
  capability publication fails, second translation dispatch/result fencing, and
  a held idle heartbeat failing during shutdown with persisted failure and a
  rejected runtime. The earlier late-stop test failed because its incomplete
  storage adapter caused an unrelated expiry-stage error; the fixture now has
  validation-only methods that fail any actual storage operation. No stage-error
  assertion or storage validation was weakened.
- Final clean run650e1447-8227-4a07-9b29-54209ad479a9 passed locked offline
  install/build,1163tests/1159pass/zero fail/four native skips in286103.1967ms,
  43contract/ten pipeline checks and24scripted/zero external requests.
  All831source files remained unchanged;SHA256
  c9626532c20210f2d8dd892f8b434eac5f3aad7b8f6bbcd7ebab3c338340774c.
  Completed04:54:45.856UTC; exited verifier handle absent on revalidation.

## Limits And Next Work

The PGlite concurrency fixture serializes its SQL transactions. It does not
prove native multi-connection locking, TLS, backend death, network partition or
process-kill behavior. Full native three-role acceptance still needs a new,
bounded authorization and ownership-checked runner. Pool starvation, stalled
connections and platform shutdown deadlines remain separate native/hosted gates;
the timer does not turn an unresponsive database promise into a cancellation.

The operator fixture's earlier manual/mock browser heartbeat is not evidence
for this new normal-worker loop. Frontend code did not change in this checkpoint;
the previous built browser evidence remains historical at its recorded scope.
