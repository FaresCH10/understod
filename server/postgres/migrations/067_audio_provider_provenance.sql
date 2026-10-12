-- Existing operations remain honestly unattributed; only future inserts require evidence.
ALTER TABLE provider_operations ADD CONSTRAINT audio_operations_provenance
  CHECK(kind NOT IN ('source-transcription','recording-transcription','recording-assessment')
    OR (input_hash IS NOT NULL AND provenance_json IS NOT NULL)) NOT VALID;
ALTER TABLE source_audio_requests ADD COLUMN transcription_operation_id text;
ALTER TABLE source_audio_requests ADD FOREIGN KEY(transcription_operation_id,org_id,request_id)
  REFERENCES provider_operations(id,org_id,reference_id);
ALTER TABLE recordings ADD COLUMN transcription_operation_id text;
ALTER TABLE recordings ADD COLUMN assessment_operation_id text;
ALTER TABLE recordings ADD FOREIGN KEY(transcription_operation_id,org_id,id)
  REFERENCES provider_operations(id,org_id,reference_id);
ALTER TABLE recordings ADD FOREIGN KEY(assessment_operation_id,org_id,id)
  REFERENCES provider_operations(id,org_id,reference_id);

CREATE FUNCTION check_audio_operation_link(linked_id text,expected_kind text,scope_org text,scope_reference text,claim text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE operation provider_operations%ROWTYPE;
BEGIN
  SELECT * INTO operation FROM provider_operations WHERE id=linked_id;
  IF NOT FOUND OR operation.org_id<>scope_org OR operation.reference_id<>scope_reference
    OR operation.kind<>expected_kind OR operation.claim_token IS DISTINCT FROM claim
    OR operation.input_hash IS NULL OR operation.provenance_json IS NULL
    OR operation.provenance_json->>'model' IS DISTINCT FROM operation.model
    OR operation.provenance_json->>'dataClass' IS DISTINCT FROM 'synthetic'
    OR operation.reserved_requests<>(CASE WHEN expected_kind='recording-assessment' THEN 1 ELSE 4 END) THEN
    RAISE EXCEPTION 'Audio provider completion evidence unavailable';
  END IF;
  IF expected_kind='recording-assessment' THEN
    IF (SELECT count(*) FROM provider_requests WHERE operation_id=operation.id)<>1
      OR NOT EXISTS(SELECT 1 FROM provider_requests WHERE operation_id=operation.id AND sequence=1 AND NOT cleanup AND state='accepted') THEN
      RAISE EXCEPTION 'Audio provider completion evidence unavailable';
    END IF;
  ELSE
    IF (SELECT count(*) FROM provider_requests WHERE operation_id=operation.id AND sequence BETWEEN 1 AND 3 AND NOT cleanup AND state='accepted')<>3
      OR EXISTS(SELECT 1 FROM provider_requests WHERE operation_id=operation.id AND sequence>3 AND NOT cleanup) THEN
      RAISE EXCEPTION 'Audio provider completion evidence unavailable';
    END IF;
  END IF;
END $$;

CREATE FUNCTION protect_audio_operation_links() RETURNS trigger LANGUAGE plpgsql AS $$
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
      AND NOT (NEW.transcript IS NULL AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id
        WHERE a.id=OLD.assignment_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id)) THEN
      RAISE EXCEPTION 'Provider transcript is immutable';
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
CREATE TRIGGER source_audio_operation_links BEFORE UPDATE ON source_audio_requests FOR EACH ROW EXECUTE FUNCTION protect_audio_operation_links();
CREATE TRIGGER recording_operation_links BEFORE UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION protect_audio_operation_links();
