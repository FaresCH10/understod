-- Preserve unknown historical rows; only new provider operations require evidence.
ALTER TABLE provider_operations ADD CONSTRAINT followup_operations_provenance
  CHECK(kind<>'case-followup' OR (input_hash IS NOT NULL AND provenance_json IS NOT NULL)) NOT VALID;
ALTER TABLE case_followups ADD COLUMN provider_operation_id text;
ALTER TABLE case_followups ADD COLUMN provider_input_hash text CHECK(provider_input_hash IS NULL OR provider_input_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE case_followups ADD CHECK((provider_operation_id IS NULL)=(provider_input_hash IS NULL));
ALTER TABLE case_followups ADD FOREIGN KEY(provider_operation_id,org_id,id) REFERENCES provider_operations(id,org_id,reference_id);

CREATE FUNCTION protect_followup_operation_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation provider_operations%ROWTYPE; expected_requests integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.provider_operation_id IS NOT NULL THEN RAISE EXCEPTION 'Follow-up completion claim unavailable'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.provider_operation_id IS NOT NULL AND (NEW.provider_operation_id,NEW.provider_input_hash)
    IS DISTINCT FROM (OLD.provider_operation_id,OLD.provider_input_hash) THEN
    RAISE EXCEPTION 'Follow-up provider completion link is immutable';
  END IF;
  IF NEW.provider_operation_id IS DISTINCT FROM OLD.provider_operation_id THEN
    SELECT * INTO operation FROM provider_operations WHERE id=NEW.provider_operation_id;
    expected_requests=CASE WHEN OLD.language='en' THEN 1 ELSE 3 END;
    IF NOT FOUND OR OLD.status<>'processing' OR OLD.lease_token IS NULL OR OLD.lease_until IS NULL
      OR OLD.lease_until<=clock_timestamp() OR NEW.status<>'delivered' OR NEW.delivered_at IS NULL
      OR operation.kind<>'case-followup' OR operation.org_id<>OLD.org_id OR operation.reference_id<>OLD.id
      OR operation.claim_token IS DISTINCT FROM OLD.lease_token OR operation.data_class<>'synthetic'
      OR operation.input_hash IS DISTINCT FROM NEW.provider_input_hash OR operation.provenance_json IS NULL
      OR operation.provenance_json->>'dataClass' IS DISTINCT FROM 'synthetic'
      OR operation.model IS DISTINCT FROM operation.provenance_json->>(CASE WHEN OLD.language='en' THEN 'speechModel' ELSE 'textModel' END)
      OR NEW.manifest_json->'dependencies'->'provider' IS DISTINCT FROM operation.provenance_json
      OR operation.reserved_requests<>expected_requests
      OR (SELECT count(*) FROM provider_requests WHERE operation_id=operation.id)<>expected_requests
      OR (SELECT count(*) FROM provider_requests WHERE operation_id=operation.id AND NOT cleanup AND state='accepted')<>expected_requests THEN
      RAISE EXCEPTION 'Follow-up provider completion evidence unavailable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER followup_operation_link BEFORE INSERT OR UPDATE ON case_followups FOR EACH ROW EXECUTE FUNCTION protect_followup_operation_link();
