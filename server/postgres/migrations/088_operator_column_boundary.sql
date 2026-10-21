-- Eligibility is readable without granting access to the private export snapshot.
ALTER TABLE report_exports ADD COLUMN snapshot_available boolean GENERATED ALWAYS AS (snapshot_json IS NOT NULL) STORED;
CREATE TABLE operator_auth_attempts (
  key_hash text PRIMARY KEY,count integer NOT NULL CHECK(count>=0),window_started_at timestamptz NOT NULL
);

CREATE FUNCTION restrict_column_runtime_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_row jsonb:=to_jsonb(OLD); after_row jsonb:=to_jsonb(NEW);
BEGIN
  -- Maintenance and the existing broad profiles keep their separate policies.
  -- A column-restricted role cannot turn a lock grant into a business rewrite.
  IF has_table_privilege(current_user,TG_RELID,'UPDATE') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('organizations','sites','platform_operators') THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Restricted runtime lock columns are immutable' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME IN ('sessions','operator_sessions') THEN
    IF NEW.revoked_at IS NULL OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
      RAISE EXCEPTION 'Restricted runtime may only revoke sessions' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='briefings' THEN
    IF OLD.state<>'failed' OR NEW.state<>'processing' OR NEW.prepared_json IS NOT NULL
      OR NEW.updated_at IS NULL OR NEW.updated_at<statement_timestamp() OR NEW.updated_at>clock_timestamp()
      OR NOT EXISTS(SELECT 1 FROM jobs j WHERE j.briefing_id=OLD.id AND j.org_id=OLD.org_id AND j.site_id=OLD.site_id
        AND j.revision=OLD.revision AND j.kind='prepare' AND j.status='failed' AND j.attempts>0 AND j.lease_token IS NULL) THEN
      RAISE EXCEPTION 'Restricted runtime may only clear a failed preparation' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME IN ('jobs','assessment_jobs','report_exports') THEN
    IF NOT (before_row->>'status'='failed' OR (TG_TABLE_NAME='assessment_jobs' AND before_row->>'status'='blocked'))
      OR (before_row->>'attempts')::integer<1 OR before_row->>'lease_token' IS NOT NULL
      OR after_row->>'status'<>'queued' OR (after_row->>'attempts')::integer<>0
      OR after_row->>'lease_token' IS NOT NULL OR after_row->>'lease_until' IS NOT NULL OR after_row->>'error' IS NOT NULL
      OR (TG_TABLE_NAME<>'report_exports' AND (after_row->>'due_at' IS NULL OR (after_row->>'due_at')::timestamptz<statement_timestamp() OR (after_row->>'due_at')::timestamptz>clock_timestamp())) THEN
      RAISE EXCEPTION 'Restricted runtime may only reset a failed unleased job' USING ERRCODE='42501';
    END IF;
  ELSE RAISE EXCEPTION 'Unknown restricted runtime update' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','sites','platform_operators','sessions','operator_sessions','briefings','jobs','assessment_jobs','report_exports'] LOOP
    EXECUTE format('CREATE TRIGGER column_runtime_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION restrict_column_runtime_update()',table_name);
  END LOOP;
END $$;
