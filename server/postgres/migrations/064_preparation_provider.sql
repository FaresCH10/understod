ALTER TABLE jobs ADD CONSTRAINT jobs_authority_scope UNIQUE(id,org_id,site_id);
CREATE TABLE preparation_authorities (
  id text PRIMARY KEY,job_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,
  requested_by text NOT NULL,authority_json jsonb NOT NULL,session_hash text CHECK(session_hash IS NULL OR session_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,job_id,org_id,site_id),
  FOREIGN KEY(job_id,org_id,site_id) REFERENCES jobs(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER preparation_authorities_frozen BEFORE UPDATE OR DELETE ON preparation_authorities
  FOR EACH ROW EXECUTE FUNCTION freeze_operator_evidence();
ALTER TABLE jobs ADD COLUMN preparation_authority_id text;
ALTER TABLE jobs ADD FOREIGN KEY(preparation_authority_id,id,org_id,site_id) REFERENCES preparation_authorities(id,job_id,org_id,site_id);
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE provider_operations ADD CHECK(kind IN ('source-transcription','connection-test','case-followup','recording-transcription','recording-assessment','preparation'));
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_check;
ALTER TABLE provider_operations ADD CHECK((kind='connection-test' AND org_id IS NULL AND claim_token IS NULL)
  OR (kind IN ('source-transcription','case-followup','recording-transcription','recording-assessment','preparation') AND org_id IS NOT NULL AND claim_token IS NOT NULL));
