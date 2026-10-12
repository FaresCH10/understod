CREATE TABLE generated_retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  days integer CHECK(days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE generated_retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER generated_retention_requests_frozen BEFORE UPDATE OR DELETE ON generated_retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE TABLE generated_audio_retirements (
  bundle_id uuid PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  policy_revision integer NOT NULL CHECK(policy_revision>0),days integer NOT NULL CHECK(days IN (7,30,90,365)),
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(bundle_id,org_id,site_id) REFERENCES generated_bundles(id,org_id,site_id)
);
CREATE TRIGGER generated_audio_retirements_frozen BEFORE UPDATE OR DELETE ON generated_audio_retirements
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION guard_generated_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM generated_bundles b JOIN generated_retention_policies p ON p.org_id=b.org_id AND p.site_id=b.site_id
    WHERE b.id=NEW.bundle_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id AND b.state='attached'
      AND b.stored_at<=clock_timestamp()-p.days*interval '1 day' AND p.days=NEW.days AND p.revision=NEW.policy_revision) THEN
    RAISE EXCEPTION 'Generated audio retirement scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER generated_audio_retirement_scope BEFORE INSERT ON generated_audio_retirements
  FOR EACH ROW EXECUTE FUNCTION guard_generated_retirement();
CREATE TABLE generated_audio_removals (
  bundle_id uuid PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(bundle_id,org_id,site_id) REFERENCES generated_bundles(id,org_id,site_id)
);
CREATE TRIGGER generated_audio_removals_frozen BEFORE UPDATE OR DELETE ON generated_audio_removals
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION guard_generated_removal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM generated_bundles WHERE id=NEW.bundle_id AND org_id=NEW.org_id AND site_id=NEW.site_id AND state='cleaned') THEN
    RAISE EXCEPTION 'Generated audio removal completion unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER generated_audio_removal_scope BEFORE INSERT ON generated_audio_removals
  FOR EACH ROW EXECUTE FUNCTION guard_generated_removal();

CREATE OR REPLACE FUNCTION protect_generated_bundle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.briefing_id,NEW.revision,NEW.job_id,NEW.job_lease,
      NEW.manifest_json,NEW.manifest_hash,NEW.dependency_hash,NEW.created_at)
     IS DISTINCT FROM
     (OLD.id,OLD.org_id,OLD.site_id,OLD.briefing_id,OLD.revision,OLD.job_id,OLD.job_lease,
      OLD.manifest_json,OLD.manifest_hash,OLD.dependency_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Generated bundle identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state<>OLD.state AND NOT (
      (OLD.state='storing' AND NEW.state IN ('stored','cleaning')) OR
      (OLD.state='stored' AND NEW.state IN ('attached','cleaning')) OR
      (OLD.state='attached' AND NEW.state='cleaning' AND EXISTS(SELECT 1 FROM generated_audio_retirements
        WHERE bundle_id=OLD.id AND org_id=OLD.org_id AND site_id=OLD.site_id)) OR
      (OLD.state='cleaning' AND NEW.state='cleaned')) THEN
    RAISE EXCEPTION 'Invalid generated bundle transition' USING ERRCODE='23514';
  END IF;
  IF OLD.stored_at IS NOT NULL AND NEW.stored_at IS DISTINCT FROM OLD.stored_at THEN
    RAISE EXCEPTION 'Generated storage evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE INDEX generated_retention_due ON generated_bundles(org_id,site_id,stored_at,id) WHERE state='attached';
