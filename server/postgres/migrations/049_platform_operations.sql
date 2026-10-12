CREATE TABLE platform_operators (
  id text PRIMARY KEY,email text NOT NULL UNIQUE,name text NOT NULL,active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),password_salt text NOT NULL,password_hash text NOT NULL,changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE operator_sessions (
  token_hash text PRIMARY KEY,operator_id text NOT NULL REFERENCES platform_operators(id),operator_revision integer NOT NULL,
  expires_at timestamptz NOT NULL,revoked_at timestamptz
);
CREATE INDEX operator_sessions_expiry ON operator_sessions(expires_at);
CREATE TABLE tenant_controls (
  org_id text PRIMARY KEY REFERENCES organizations(id),revision integer NOT NULL CHECK(revision>0),
  state text NOT NULL CHECK(state IN ('active','suspended')),
  reason text NOT NULL CHECK(reason IN ('pilot_review','security_review','owner_request','maintenance')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE system_controls (
  id text PRIMARY KEY CHECK(id='global'),revision integer NOT NULL CHECK(revision>0),
  jobs_paused boolean NOT NULL,provider_paused boolean NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE operator_requests (
  request_id text PRIMARY KEY,operator_id text NOT NULL REFERENCES platform_operators(id),
  request_json jsonb NOT NULL,result_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE operator_audit (
  id text PRIMARY KEY,operator_id text NOT NULL REFERENCES platform_operators(id),action text NOT NULL,
  object_type text NOT NULL,object_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION freeze_operator_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operator evidence is append-only'; END $$;
CREATE TRIGGER operator_requests_frozen BEFORE UPDATE OR DELETE ON operator_requests FOR EACH ROW EXECUTE FUNCTION freeze_operator_evidence();
CREATE TRIGGER operator_audit_frozen BEFORE UPDATE OR DELETE ON operator_audit FOR EACH ROW EXECUTE FUNCTION freeze_operator_evidence();
