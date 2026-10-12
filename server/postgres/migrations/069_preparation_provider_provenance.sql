ALTER TABLE provider_operations ADD COLUMN preparation_context_json jsonb
  CHECK(preparation_context_json IS NULL OR (kind='preparation' AND jsonb_typeof(preparation_context_json)='object' AND octet_length(preparation_context_json::text)<=2000));
-- Unknown historical operations remain unchanged, not assigned invented inputs.
ALTER TABLE provider_operations ADD CONSTRAINT preparation_operations_provenance
  CHECK(kind<>'preparation' OR (input_hash IS NOT NULL AND provenance_json IS NOT NULL AND preparation_context_json IS NOT NULL)) NOT VALID;
CREATE UNIQUE INDEX preparation_operation_stage ON provider_operations(org_id,reference_id,claim_token,(preparation_context_json->>'step'))
  WHERE kind='preparation' AND preparation_context_json IS NOT NULL;
ALTER TABLE generated_bundles ADD COLUMN provider_operation_count integer CHECK(provider_operation_count IS NULL OR provider_operation_count BETWEEN 1 AND 64);
CREATE TABLE generated_bundle_operations (
  bundle_id uuid NOT NULL,operation_id text NOT NULL UNIQUE,org_id text NOT NULL,site_id text NOT NULL,job_id text NOT NULL,
  PRIMARY KEY(bundle_id,operation_id),
  FOREIGN KEY(bundle_id,org_id,site_id) REFERENCES generated_bundles(id,org_id,site_id),
  FOREIGN KEY(operation_id,org_id,job_id) REFERENCES provider_operations(id,org_id,reference_id)
);
CREATE TRIGGER generated_bundle_operations_frozen BEFORE UPDATE OR DELETE ON generated_bundle_operations
  FOR EACH ROW EXECUTE FUNCTION freeze_operator_evidence();
CREATE FUNCTION protect_preparation_bundle_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_operation_count IS DISTINCT FROM OLD.provider_operation_count THEN
    RAISE EXCEPTION 'Generated provider evidence is immutable';
  END IF;
  IF NEW.state='attached' AND OLD.state<>'attached' AND NEW.provider_operation_count IS NOT NULL THEN
    IF (SELECT count(*) FROM generated_bundle_operations WHERE bundle_id=NEW.id)<>NEW.provider_operation_count
      OR (SELECT count(*) FROM provider_operations WHERE kind='preparation' AND reference_id=NEW.job_id AND org_id=NEW.org_id AND claim_token=NEW.job_lease)<>NEW.provider_operation_count THEN
      RAISE EXCEPTION 'Generated provider completion evidence unavailable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER generated_provider_evidence BEFORE UPDATE ON generated_bundles FOR EACH ROW EXECUTE FUNCTION protect_preparation_bundle_evidence();
CREATE FUNCTION protect_generated_operation_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bundle generated_bundles%ROWTYPE; operation provider_operations%ROWTYPE;
BEGIN
  SELECT * INTO bundle FROM generated_bundles WHERE id=NEW.bundle_id AND org_id=NEW.org_id AND site_id=NEW.site_id;
  IF NOT FOUND OR bundle.state<>'storing' OR bundle.job_id<>NEW.job_id OR bundle.provider_operation_count IS NULL THEN
    RAISE EXCEPTION 'Generated provider completion claim unavailable';
  END IF;
  SELECT * INTO operation FROM provider_operations WHERE id=NEW.operation_id;
  IF NOT FOUND OR operation.kind<>'preparation' OR operation.org_id<>bundle.org_id OR operation.reference_id<>bundle.job_id
    OR operation.claim_token<>bundle.job_lease OR operation.reserved_requests<>1 OR operation.data_class<>'synthetic'
    OR operation.input_hash IS NULL OR operation.provenance_json IS NULL OR operation.preparation_context_json IS NULL
    OR operation.provenance_json->>'model' IS DISTINCT FROM operation.model
    OR operation.provenance_json->>'dataClass' IS DISTINCT FROM 'synthetic'
    OR operation.preparation_context_json->>'siteId' IS DISTINCT FROM bundle.site_id
    OR operation.preparation_context_json->>'briefingId' IS DISTINCT FROM bundle.briefing_id
    OR operation.preparation_context_json->>'revision' IS DISTINCT FROM bundle.revision::text
    OR operation.model IS DISTINCT FROM bundle.manifest_json->'provenance'->>(CASE WHEN operation.preparation_context_json->>'stage'='speech' THEN 'speechModel' ELSE 'textModel' END)
    OR NOT EXISTS(SELECT 1 FROM jobs WHERE id=bundle.job_id AND org_id=bundle.org_id AND site_id=bundle.site_id AND status='processing'
      AND lease_token=bundle.job_lease AND lease_until>clock_timestamp())
    OR (SELECT count(*) FROM provider_requests WHERE operation_id=operation.id)<>1
    OR NOT EXISTS(SELECT 1 FROM provider_requests WHERE operation_id=operation.id AND sequence=1 AND NOT cleanup AND state='accepted') THEN
    RAISE EXCEPTION 'Generated provider completion evidence unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER generated_operation_link BEFORE INSERT ON generated_bundle_operations FOR EACH ROW EXECUTE FUNCTION protect_generated_operation_link();
