CREATE TABLE site_lifecycle (
  site_id text PRIMARY KEY, org_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
  state text NOT NULL CHECK(state IN ('active','archived')),reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE site_lifecycle_requests (
  request_id uuid NOT NULL,org_id text NOT NULL,origin_site_id text NOT NULL,site_id text NOT NULL,
  actor_id text NOT NULL,request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(org_id,request_id),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,origin_site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_site_lifecycle_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Site lifecycle receipt is immutable'; END $$;
CREATE TRIGGER site_lifecycle_receipt_immutable BEFORE UPDATE OR DELETE ON site_lifecycle_requests
  FOR EACH ROW EXECUTE FUNCTION freeze_site_lifecycle_receipt();
CREATE FUNCTION site_operational_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); admit boolean;
BEGIN
  admit:=CASE
    WHEN TG_TABLE_NAME IN ('workers','staff','crews') THEN (row_data->>'active')::boolean
    WHEN TG_TABLE_NAME='publications' THEN row_data->>'state'='published'
    WHEN TG_TABLE_NAME IN ('jobs','assessment_jobs','report_exports') THEN row_data->>'status' IN ('queued','processing')
    WHEN TG_TABLE_NAME IN ('recordings','source_audio_requests') THEN row_data->>'status' IN ('storing','received','processing','blocked')
    WHEN TG_TABLE_NAME IN ('publication_schedules','assignment_reminders') THEN row_data->>'state'='queued'
    WHEN TG_TABLE_NAME='staff_invitations' THEN row_data->>'state'='pending'
    WHEN TG_TABLE_NAME='worker_grants' THEN row_data->>'revoked_at' IS NULL
    ELSE true END;
  IF admit THEN
    PERFORM id FROM sites WHERE id=row_data->>'site_id' AND org_id=row_data->>'org_id' FOR SHARE;
    -- This second statement sees the policy committed while the site lock was awaited.
    IF EXISTS(SELECT 1 FROM site_lifecycle WHERE site_id=row_data->>'site_id' AND org_id=row_data->>'org_id' AND state='archived') THEN
      RAISE EXCEPTION 'Site archived';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workers','staff','crews','crew_memberships','briefings','publications','assignments',
    'jobs','assessment_jobs','recordings','source_audio_requests','publication_schedules','assignment_reminders','staff_invitations','report_exports','worker_grants',
    'templates','template_versions','glossary_terms','glossary_versions','site_settings','site_onboarding','recording_notices']
  LOOP
    EXECUTE format('CREATE TRIGGER site_operational_admission BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION site_operational_admission()',table_name);
  END LOOP;
END $$;
