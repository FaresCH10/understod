-- Initial PostgreSQL schema for the current persisted domain. Apply only through migrate.mjs.
-- Text IDs preserve compatibility with the current synthetic fixture and UUID-generated IDs.

CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0)
);

CREATE TABLE sites (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  timezone text NOT NULL CHECK (length(trim(timezone)) > 0),
  UNIQUE (id, org_id)
);

CREATE TABLE staff (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'supervisor', 'auditor')),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id),
  UNIQUE (id, org_id, site_id),
  UNIQUE (id, org_id)
);

CREATE TABLE workers (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  code text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'ar', 'ur')),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id),
  UNIQUE (org_id, code),
  UNIQUE (id, org_id, site_id)
);

CREATE TABLE crews (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id),
  UNIQUE (org_id, site_id, name),
  UNIQUE (id, org_id, site_id)
);

CREATE TABLE crew_memberships (
  worker_id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  crew_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, org_id, site_id) REFERENCES workers(id, org_id, site_id),
  FOREIGN KEY (crew_id, org_id, site_id) REFERENCES crews(id, org_id, site_id)
);

CREATE TABLE briefings (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  title text NOT NULL,
  source text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  next_version integer NOT NULL DEFAULT 1 CHECK (next_version > 0),
  state text NOT NULL CHECK (state IN ('draft', 'processing', 'ready', 'failed')),
  prepared_json jsonb CHECK (prepared_json IS NULL OR jsonb_typeof(prepared_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id),
  UNIQUE (id, org_id, site_id)
);

CREATE TABLE publications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('published', 'withdrawn', 'superseded', 'archived')),
  FOREIGN KEY (briefing_id, org_id, site_id) REFERENCES briefings(id, org_id, site_id),
  UNIQUE (briefing_id, version),
  UNIQUE (id, org_id, site_id)
);

CREATE FUNCTION protect_publication_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.org_id, NEW.site_id, NEW.briefing_id, NEW.version,
      NEW.snapshot_json, NEW.published_at) IS DISTINCT FROM
     (OLD.id, OLD.org_id, OLD.site_id, OLD.briefing_id, OLD.version,
      OLD.snapshot_json, OLD.published_at) THEN
    RAISE EXCEPTION 'Published snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER publications_snapshot_immutable BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION protect_publication_snapshot();

CREATE TABLE assignments (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  publication_id text NOT NULL,
  worker_id text NOT NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (publication_id, org_id, site_id) REFERENCES publications(id, org_id, site_id),
  FOREIGN KEY (worker_id, org_id, site_id) REFERENCES workers(id, org_id, site_id),
  UNIQUE (publication_id, worker_id),
  UNIQUE (id, org_id, site_id)
);

CREATE FUNCTION protect_assignment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.org_id, NEW.site_id, NEW.publication_id, NEW.worker_id, NEW.created_at)
      IS DISTINCT FROM
     (OLD.id, OLD.org_id, OLD.site_id, OLD.publication_id, OLD.worker_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Assignment snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assignments_snapshot_immutable BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION protect_assignment_snapshot();

CREATE TABLE attempts (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  assignment_id text NOT NULL,
  submission_id text NOT NULL,
  answer_text text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('matched', 'clarification', 'unassessable')),
  reasons_json jsonb NOT NULL CHECK (jsonb_typeof(reasons_json) = 'array'),
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assignment_id, org_id, site_id) REFERENCES assignments(id, org_id, site_id),
  UNIQUE (assignment_id, submission_id),
  UNIQUE (id, org_id, site_id, assignment_id)
);

CREATE TABLE clarifications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  assignment_id text NOT NULL,
  attempt_id text,
  reason text NOT NULL,
  owner_staff_id text,
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assignment_id, org_id, site_id) REFERENCES assignments(id, org_id, site_id),
  FOREIGN KEY (attempt_id, org_id, site_id, assignment_id) REFERENCES attempts(id, org_id, site_id, assignment_id),
  FOREIGN KEY (owner_staff_id, org_id, site_id) REFERENCES staff(id, org_id, site_id),
  UNIQUE (attempt_id)
);

CREATE TABLE jobs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  due_at timestamptz NOT NULL,
  lease_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (briefing_id, org_id, site_id) REFERENCES briefings(id, org_id, site_id),
  UNIQUE (briefing_id, revision, kind)
);

CREATE TABLE worker_grants (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  worker_id text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, org_id, site_id) REFERENCES workers(id, org_id, site_id),
  UNIQUE (id, org_id, site_id, worker_id)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('staff', 'worker')),
  principal_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  grant_id text,
  access_mode text NOT NULL CHECK (access_mode IN ('demo', 'credential')),
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id),
  FOREIGN KEY (grant_id, org_id, site_id, principal_id) REFERENCES worker_grants(id, org_id, site_id, worker_id),
  CHECK ((principal_type = 'staff' AND grant_id IS NULL) OR
         (principal_type = 'worker' AND (access_mode = 'demo' OR grant_id IS NOT NULL)))
);

CREATE FUNCTION check_session_principal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.principal_type = 'staff' THEN
    IF NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.principal_id AND s.org_id = NEW.org_id AND s.site_id = NEW.site_id) THEN
      RAISE EXCEPTION 'Scope mismatch' USING ERRCODE = '23503';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM workers w WHERE w.id = NEW.principal_id AND w.org_id = NEW.org_id AND w.site_id = NEW.site_id) THEN
    RAISE EXCEPTION 'Scope mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_scope BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION check_session_principal();

CREATE TABLE staff_credentials (
  staff_id text PRIMARY KEY REFERENCES staff(id),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_attempts (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  count integer NOT NULL CHECK (count >= 0),
  window_started_at timestamptz NOT NULL
);

CREATE TABLE audit (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  object_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id)
);

CREATE TABLE recordings (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  assignment_id text NOT NULL,
  submission_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  duration_seconds double precision NOT NULL CHECK (duration_seconds > 0),
  bytes integer NOT NULL CHECK (bytes > 0),
  status text NOT NULL CHECK (status IN ('storing', 'received', 'processing', 'blocked', 'transcribed', 'failed')),
  transcript text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  lease_token text,
  retry_at timestamptz,
  CHECK (received_at IS NOT NULL OR status IN ('storing', 'failed')),
  FOREIGN KEY (assignment_id, org_id, site_id) REFERENCES assignments(id, org_id, site_id),
  UNIQUE (assignment_id, submission_id)
);

CREATE INDEX idx_assignments_worker ON assignments(worker_id, publication_id);
CREATE INDEX idx_crews_scope ON crews(org_id, site_id, active, name);
CREATE INDEX idx_crew_memberships_crew ON crew_memberships(crew_id, org_id, site_id);
CREATE INDEX idx_attempts_assignment ON attempts(assignment_id, received_at DESC);
CREATE INDEX idx_clarifications_org_status ON clarifications(org_id, site_id, status, created_at DESC);
CREATE INDEX idx_jobs_status_due ON jobs(status, due_at);
CREATE INDEX idx_worker_grants_worker ON worker_grants(worker_id, revoked_at);
CREATE INDEX idx_recordings_status ON recordings(status, retry_at, created_at);
CREATE INDEX idx_audit_scope_time ON audit(org_id, site_id, occurred_at DESC);
