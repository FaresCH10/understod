ALTER TABLE worker_deletion_requests ADD CONSTRAINT deletion_request_scope_key UNIQUE(id,org_id,site_id,worker_id);
CREATE TABLE worker_deletion_redactions (
  request_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  worker_id text NOT NULL UNIQUE,completed_at timestamptz NOT NULL,
  FOREIGN KEY(request_id,org_id,site_id,worker_id) REFERENCES worker_deletion_requests(id,org_id,site_id,worker_id),
  FOREIGN KEY(worker_id,org_id,site_id) REFERENCES workers(id,org_id,site_id)
);
CREATE TRIGGER worker_deletion_redactions_immutable BEFORE UPDATE OR DELETE ON worker_deletion_redactions
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

CREATE OR REPLACE FUNCTION protect_attempt_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
  IF deleted THEN
    IF NEW.answer_text='[Deleted]' AND NEW.reasons_json='[]'::jsonb AND NEW.evidence_json='[]'::jsonb
      AND (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.received_at,NEW.outcome,NEW.assessment_status)
        IS NOT DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.received_at,OLD.outcome,OLD.assessment_status) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Deleted content is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.answer_text,NEW.received_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.answer_text,OLD.received_at)
    OR (OLD.assessment_status='complete' AND (NEW.assessment_status,NEW.outcome,NEW.reasons_json,NEW.evidence_json)
      IS DISTINCT FROM (OLD.assessment_status,OLD.outcome,OLD.reasons_json,OLD.evidence_json)) THEN
    RAISE EXCEPTION 'Accepted answer and completed assessment are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_help_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.text='[Deleted]' AND
    (NEW.case_id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.created_at)
      IS NOT DISTINCT FROM (OLD.case_id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.created_at)
    AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Original help request is immutable' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION protect_clarification_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id) THEN
    IF NEW.reason='[Deleted]' AND NEW.notes='' AND
      (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.attempt_id,NEW.created_at,NEW.status,NEW.owner_staff_id)
        IS NOT DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.attempt_id,OLD.created_at,OLD.status,OLD.owner_staff_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Deleted content is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.attempt_id,NEW.reason,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.attempt_id,OLD.reason,OLD.created_at)
    OR (OLD.status='resolved' AND (NEW.status,NEW.notes,NEW.owner_staff_id) IS DISTINCT FROM (OLD.status,OLD.notes,OLD.owner_staff_id)) THEN
    RAISE EXCEPTION 'Clarification evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
