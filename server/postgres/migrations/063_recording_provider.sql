ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE provider_operations ADD CHECK(kind IN ('source-transcription','connection-test','case-followup','recording-transcription','recording-assessment'));
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_check;
ALTER TABLE provider_operations ADD CHECK((kind='connection-test' AND org_id IS NULL AND claim_token IS NULL)
  OR (kind IN ('source-transcription','case-followup','recording-transcription','recording-assessment') AND org_id IS NOT NULL AND claim_token IS NOT NULL));
