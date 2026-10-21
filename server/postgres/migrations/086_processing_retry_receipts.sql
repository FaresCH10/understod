CREATE TABLE processing_retries (
  request_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,requested_by text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('response_transcription','answer_check')),job_id text NOT NULL,
  publication_id text NOT NULL,assignment_id text NOT NULL,generation integer NOT NULL CHECK(generation BETWEEN 0 AND 1000000),
  request_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(kind,job_id,generation),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  CHECK(request_json=jsonb_build_object('jobId',kind||':'||job_id,'publicationId',publication_id,'assignmentId',assignment_id,'generation',generation,'confirmed',true))
);
CREATE FUNCTION processing_retry_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id AND a.publication_id=NEW.publication_id)
    OR (NEW.kind='response_transcription' AND NOT EXISTS(SELECT 1 FROM recordings r WHERE r.id=NEW.job_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id AND r.assignment_id=NEW.assignment_id AND r.received_at IS NOT NULL))
    OR (NEW.kind='answer_check' AND NOT EXISTS(SELECT 1 FROM assessment_jobs j WHERE j.id=NEW.job_id AND j.org_id=NEW.org_id AND j.site_id=NEW.site_id AND j.assignment_id=NEW.assignment_id)) THEN
    RAISE EXCEPTION 'Processing retry scope mismatch';
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER processing_retries_scope BEFORE INSERT ON processing_retries FOR EACH ROW EXECUTE FUNCTION processing_retry_scope();
CREATE FUNCTION protect_processing_retry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Processing retry receipt is immutable'; END $$;
CREATE TRIGGER processing_retries_frozen BEFORE UPDATE OR DELETE ON processing_retries FOR EACH ROW EXECUTE FUNCTION protect_processing_retry();
CREATE INDEX operator_assessment_retry_generation ON operator_requests((request_json->>'jobId')) WHERE request_json->>'kind'='assessment';
