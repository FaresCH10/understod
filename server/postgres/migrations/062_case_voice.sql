CREATE TABLE case_voice (
  id text PRIMARY KEY,request_id text NOT NULL UNIQUE,org_id text NOT NULL,site_id text NOT NULL,
  assignment_id text NOT NULL,worker_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('help','reply')),
  requested_case_id text NOT NULL,case_id text,language text NOT NULL CHECK(language IN ('en','ar','ur')),
  sha256 text NOT NULL CHECK(length(sha256)=64),bytes integer NOT NULL CHECK(bytes BETWEEN 8044 AND 2880044),
  duration_seconds double precision NOT NULL CHECK(duration_seconds BETWEEN 0.25 AND 90),
  status text NOT NULL CHECK(status IN ('storing','received','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),received_at timestamptz,
  lease_token text,lease_until timestamptz,
  cleanup_state text NOT NULL DEFAULT 'active' CHECK(cleanup_state IN ('active','cleaning','cleaned')),
  cleanup_token text,cleanup_until timestamptz,cleanup_checked_at timestamptz,
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  CHECK((status='received' AND received_at IS NOT NULL AND case_id IS NOT NULL AND case_id=requested_case_id)
    OR (status IN ('storing','failed') AND received_at IS NULL AND case_id IS NULL))
);
CREATE INDEX case_voice_cleanup ON case_voice(cleanup_state,lease_until,received_at);
CREATE FUNCTION guard_case_voice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Voice evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'storing' OR NEW.cleanup_state<>'active' OR NEW.lease_token IS NULL OR NEW.lease_until IS NULL
    THEN RAISE EXCEPTION 'Invalid voice staging'; END IF;
    IF NOT EXISTS(SELECT 1 FROM assignments a JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id AND w.active
      WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id AND a.worker_id=NEW.worker_id AND a.language=NEW.language)
      OR EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=NEW.worker_id)
    THEN RAISE EXCEPTION 'Voice scope mismatch'; END IF;
  ELSIF (NEW.id,NEW.request_id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.worker_id,NEW.kind,NEW.requested_case_id,NEW.language,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.request_id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.worker_id,OLD.kind,OLD.requested_case_id,OLD.language,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.created_at)
    OR (OLD.status='received' AND (NEW.status,NEW.received_at,NEW.case_id) IS DISTINCT FROM (OLD.status,OLD.received_at,OLD.case_id))
    OR (OLD.status='failed' AND NEW.status<>'failed')
    OR (OLD.cleanup_state='cleaned' AND NEW.cleanup_state<>'cleaned')
    OR (OLD.cleanup_state='cleaning' AND NEW.cleanup_state NOT IN ('cleaning','cleaned'))
  THEN RAISE EXCEPTION 'Voice evidence is immutable'; END IF;
  IF NEW.status='received' AND (TG_OP='INSERT' OR OLD.status<>'received') AND NOT EXISTS(
    SELECT 1 FROM case_messages m WHERE m.id=NEW.request_id AND m.case_id=NEW.case_id AND m.assignment_id=NEW.assignment_id
      AND m.org_id=NEW.org_id AND m.site_id=NEW.site_id AND m.actor_type='worker' AND m.actor_id=NEW.worker_id AND m.request_hash=NEW.sha256)
  THEN RAISE EXCEPTION 'Voice message receipt mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_voice_guard BEFORE INSERT OR UPDATE OR DELETE ON case_voice FOR EACH ROW EXECUTE FUNCTION guard_case_voice();
