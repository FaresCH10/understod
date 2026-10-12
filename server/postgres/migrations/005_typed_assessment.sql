-- Receipt is durable before asynchronous assessment. Imported historical attempts stay complete.
ALTER TABLE attempts ALTER COLUMN outcome DROP NOT NULL;
ALTER TABLE attempts ADD COLUMN assessment_status text NOT NULL DEFAULT 'complete'
  CHECK (assessment_status IN ('pending','complete'));
ALTER TABLE attempts ADD COLUMN evidence_json jsonb NOT NULL DEFAULT '[]'
  CHECK (jsonb_typeof(evidence_json)='array');
ALTER TABLE attempts ADD CONSTRAINT attempts_assessment_state CHECK
  ((assessment_status='pending' AND outcome IS NULL) OR (assessment_status='complete' AND outcome IS NOT NULL));

CREATE FUNCTION protect_attempt_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.answer_text,NEW.received_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.answer_text,OLD.received_at)
    OR (OLD.assessment_status='complete' AND (NEW.assessment_status,NEW.outcome,NEW.reasons_json,NEW.evidence_json)
      IS DISTINCT FROM (OLD.assessment_status,OLD.outcome,OLD.reasons_json,OLD.evidence_json)) THEN
    RAISE EXCEPTION 'Accepted answer and completed assessment are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_evidence_immutable BEFORE UPDATE ON attempts
  FOR EACH ROW EXECUTE FUNCTION protect_attempt_evidence();

CREATE TABLE assessment_jobs (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  site_id text NOT NULL,
  assignment_id text NOT NULL,
  attempt_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','complete','failed','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  due_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attempt_id,org_id,site_id,assignment_id) REFERENCES attempts(id,org_id,site_id,assignment_id),
  CHECK ((status='processing' AND lease_until IS NOT NULL AND lease_token IS NOT NULL)
    OR (status<>'processing' AND lease_until IS NULL AND lease_token IS NULL))
);
CREATE INDEX idx_assessment_jobs_due ON assessment_jobs(status,due_at,lease_until);

CREATE TABLE publication_requests (
  request_id text NOT NULL,
  org_id text NOT NULL,
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  publication_id text NOT NULL UNIQUE,
  request_json jsonb NOT NULL CHECK (jsonb_typeof(request_json)='object'),
  PRIMARY KEY (org_id,site_id,briefing_id,request_id),
  FOREIGN KEY (briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY (publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id)
);
CREATE FUNCTION protect_publication_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Publication request is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER publication_requests_immutable BEFORE UPDATE OR DELETE ON publication_requests
  FOR EACH ROW EXECUTE FUNCTION protect_publication_request();
