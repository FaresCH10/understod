CREATE TABLE text_retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  days integer CHECK(days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE text_retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER text_retention_requests_frozen BEFORE UPDATE OR DELETE ON text_retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE TABLE text_retention_purges (
  kind text NOT NULL CHECK(kind IN ('attempt','recording')),reference_id text NOT NULL,
  org_id text NOT NULL,site_id text NOT NULL,assignment_id text NOT NULL,
  policy_revision integer NOT NULL CHECK(policy_revision>0),days integer NOT NULL CHECK(days IN (7,30,90,365)),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(kind,reference_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id)
);
CREATE TRIGGER text_retention_purges_frozen BEFORE UPDATE OR DELETE ON text_retention_purges
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE INDEX text_retention_purges_scope ON text_retention_purges(org_id,site_id,kind);
CREATE INDEX attempts_retention_due ON attempts(org_id,site_id,received_at,id);
CREATE INDEX recordings_text_retention_due ON recordings(org_id,site_id,received_at,id) WHERE received_at IS NOT NULL;
CREATE FUNCTION guard_text_retention_purge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_time timestamptz;
BEGIN
  IF NEW.kind='attempt' THEN
    SELECT received_at INTO receipt_time FROM attempts WHERE id=NEW.reference_id AND org_id=NEW.org_id
      AND site_id=NEW.site_id AND assignment_id=NEW.assignment_id;
  ELSE
    SELECT received_at INTO receipt_time FROM recordings WHERE id=NEW.reference_id AND org_id=NEW.org_id
      AND site_id=NEW.site_id AND assignment_id=NEW.assignment_id;
  END IF;
  IF receipt_time IS NULL OR NOT EXISTS(SELECT 1 FROM text_retention_policies WHERE org_id=NEW.org_id AND site_id=NEW.site_id
    AND revision=NEW.policy_revision AND days=NEW.days AND receipt_time<=clock_timestamp()-days*interval '1 day') THEN
    RAISE EXCEPTION 'Text retention scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER text_retention_purge_scope BEFORE INSERT ON text_retention_purges FOR EACH ROW EXECUTE FUNCTION guard_text_retention_purge();

CREATE OR REPLACE FUNCTION protect_attempt_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean; expired boolean;
BEGIN
  deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
  expired:=EXISTS(SELECT 1 FROM text_retention_purges WHERE kind='attempt' AND reference_id=OLD.id AND org_id=OLD.org_id AND site_id=OLD.site_id);
  IF deleted OR expired THEN
    IF NEW.answer_text=(CASE WHEN deleted THEN '[Deleted]' ELSE '[Expired]' END) AND NEW.reasons_json='[]'::jsonb AND NEW.evidence_json='[]'::jsonb
      AND (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.received_at,NEW.outcome,NEW.assessment_status)
        IS NOT DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.received_at,OLD.outcome,OLD.assessment_status) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Expired or deleted content is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.answer_text,NEW.received_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.answer_text,OLD.received_at)
    OR (OLD.assessment_status='complete' AND (NEW.assessment_status,NEW.outcome,NEW.reasons_json,NEW.evidence_json)
      IS DISTINCT FROM (OLD.assessment_status,OLD.outcome,OLD.reasons_json,OLD.evidence_json)) THEN
    RAISE EXCEPTION 'Accepted answer and completed assessment are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_export_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.publication_id,NEW.requested_by,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.publication_id,OLD.requested_by,OLD.created_at,OLD.expires_at)
    OR (NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json AND NOT
      (NEW.status='expired' AND NEW.snapshot_json IS NULL AND
        (OLD.expires_at<=clock_timestamp() OR EXISTS(
          SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id
          WHERE a.publication_id=OLD.publication_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id AND OLD.created_at<=d.created_at)
        OR EXISTS(SELECT 1 FROM text_retention_purges r JOIN assignments a ON a.id=r.assignment_id
          WHERE a.publication_id=OLD.publication_id AND r.org_id=OLD.org_id AND r.site_id=OLD.site_id)))) THEN
    RAISE EXCEPTION 'Export request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_audio_operation_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.transcription_operation_id IS NOT NULL AND NEW.transcription_operation_id IS DISTINCT FROM OLD.transcription_operation_id THEN
    RAISE EXCEPTION 'Audio provider completion link is immutable';
  END IF;
  IF NEW.transcription_operation_id IS DISTINCT FROM OLD.transcription_operation_id THEN
    IF OLD.status<>'processing' OR OLD.lease_until<=clock_timestamp() THEN
      RAISE EXCEPTION 'Audio provider completion claim unavailable';
    END IF;
    IF TG_TABLE_NAME='source_audio_requests' THEN
      IF NEW.status<>'transcribed' THEN RAISE EXCEPTION 'Audio provider completion unavailable'; END IF;
      PERFORM check_audio_operation_link(NEW.transcription_operation_id,'source-transcription',OLD.org_id,OLD.request_id,OLD.lease_token);
    ELSE
      IF NEW.transcript IS NULL THEN RAISE EXCEPTION 'Audio provider transcript unavailable'; END IF;
      PERFORM check_audio_operation_link(NEW.transcription_operation_id,'recording-transcription',OLD.org_id,OLD.id,OLD.lease_token);
    END IF;
  END IF;
  IF TG_TABLE_NAME='recordings' THEN
    IF OLD.received_at IS NOT NULL AND (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.submission_id,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.received_at)
      IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.submission_id,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.received_at) THEN
      RAISE EXCEPTION 'Accepted recording input is immutable';
    END IF;
    IF OLD.transcription_operation_id IS NOT NULL AND NEW.transcript IS DISTINCT FROM OLD.transcript
      AND NOT (NEW.transcript IS NULL AND (EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id
        WHERE a.id=OLD.assignment_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id)
        OR EXISTS(SELECT 1 FROM text_retention_purges WHERE kind='recording' AND reference_id=OLD.id AND org_id=OLD.org_id AND site_id=OLD.site_id))) THEN
      RAISE EXCEPTION 'Provider transcript is immutable';
    END IF;
    IF EXISTS(SELECT 1 FROM text_retention_purges WHERE kind='recording' AND reference_id=OLD.id AND org_id=OLD.org_id AND site_id=OLD.site_id)
      AND (NEW.transcript IS NOT NULL OR NEW.status<>'failed' OR NEW.lease_token IS NOT NULL OR NEW.lease_until IS NOT NULL OR NEW.retry_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Expired recording content is immutable';
    END IF;
    IF OLD.assessment_operation_id IS NOT NULL AND NEW.assessment_operation_id IS DISTINCT FROM OLD.assessment_operation_id THEN
      RAISE EXCEPTION 'Audio provider completion link is immutable';
    END IF;
    IF NEW.assessment_operation_id IS DISTINCT FROM OLD.assessment_operation_id THEN
      IF OLD.status<>'processing' OR OLD.lease_until<=clock_timestamp() OR NEW.status<>'transcribed' THEN
        RAISE EXCEPTION 'Audio provider completion claim unavailable';
      END IF;
      PERFORM check_audio_operation_link(NEW.assessment_operation_id,'recording-assessment',OLD.org_id,OLD.id,OLD.lease_token);
    END IF;
  END IF;
  RETURN NEW;
END $$;
