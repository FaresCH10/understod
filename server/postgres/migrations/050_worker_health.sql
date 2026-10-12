CREATE TABLE worker_health (
  id text PRIMARY KEY,
  state text NOT NULL CHECK(state IN ('busy','idle','stopped')),
  stage text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  failure_stages jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(failure_stages)='array' AND jsonb_array_length(failure_stages)<=40),
  last_failure_at timestamptz
);
CREATE INDEX worker_health_seen ON worker_health(seen_at);
