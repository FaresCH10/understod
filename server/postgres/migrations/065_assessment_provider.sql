ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE provider_operations ADD CHECK(kind IN ('source-transcription','connection-test','case-followup','recording-transcription','recording-assessment','preparation','typed-assessment'));
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_check;
ALTER TABLE provider_operations ADD CHECK((kind='connection-test' AND org_id IS NULL AND claim_token IS NULL)
  OR (kind IN ('source-transcription','case-followup','recording-transcription','recording-assessment','preparation','typed-assessment') AND org_id IS NOT NULL AND claim_token IS NOT NULL));
ALTER TABLE provider_operations ADD COLUMN input_hash text CHECK(input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE provider_operations ADD COLUMN provenance_json jsonb CHECK(provenance_json IS NULL OR (jsonb_typeof(provenance_json)='object' AND octet_length(provenance_json::text)<=2000));
ALTER TABLE provider_operations ADD CHECK(kind<>'typed-assessment' OR (input_hash IS NOT NULL AND provenance_json IS NOT NULL));
ALTER TABLE provider_operations ADD CONSTRAINT provider_operations_result_scope UNIQUE(id,org_id,reference_id);
ALTER TABLE assessment_jobs ADD COLUMN provider_operation_id text;
ALTER TABLE assessment_jobs ADD FOREIGN KEY(provider_operation_id,org_id,id) REFERENCES provider_operations(id,org_id,reference_id);
