ALTER TABLE clarifications ADD CONSTRAINT clarifications_scope_key UNIQUE(id,org_id,site_id);

CREATE TABLE help_requests (
  case_id text PRIMARY KEY,
  org_id text NOT NULL,
  site_id text NOT NULL,
  assignment_id text NOT NULL,
  text text NOT NULL CHECK(length(trim(text)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id)
);

CREATE FUNCTION protect_help_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Original help request is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER help_requests_immutable BEFORE UPDATE OR DELETE ON help_requests
  FOR EACH ROW EXECUTE FUNCTION protect_help_request();

CREATE FUNCTION protect_clarification_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.attempt_id,NEW.reason,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.attempt_id,OLD.reason,OLD.created_at)
    OR (OLD.status='resolved' AND (NEW.status,NEW.notes,NEW.owner_staff_id)
      IS DISTINCT FROM (OLD.status,OLD.notes,OLD.owner_staff_id)) THEN
    RAISE EXCEPTION 'Clarification evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clarification_evidence_immutable BEFORE UPDATE ON clarifications
  FOR EACH ROW EXECUTE FUNCTION protect_clarification_evidence();
