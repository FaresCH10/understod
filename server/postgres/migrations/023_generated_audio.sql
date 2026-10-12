ALTER TABLE jobs ADD CONSTRAINT jobs_generated_scope UNIQUE(id,org_id,site_id,briefing_id,revision);

CREATE TABLE generated_bundles (
  id uuid PRIMARY KEY,
  org_id text NOT NULL,
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  job_id text NOT NULL,
  job_lease text NOT NULL,
  manifest_json jsonb NOT NULL CHECK(jsonb_typeof(manifest_json)='object' AND octet_length(manifest_json::text)<=100000),
  manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
  dependency_hash text NOT NULL CHECK(dependency_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN ('storing','stored','attached','cleaning','cleaned')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
  stored_at timestamptz,
  cleanup_token text,
  cleanup_until timestamptz,
  FOREIGN KEY(job_id,org_id,site_id,briefing_id,revision) REFERENCES jobs(id,org_id,site_id,briefing_id,revision),
  UNIQUE(job_id,job_lease),
  UNIQUE(id,org_id,site_id),
  CHECK((state IN ('stored','attached') AND stored_at IS NOT NULL) OR state IN ('storing','cleaning','cleaned')),
  CHECK((state='cleaning' AND cleanup_token IS NOT NULL AND cleanup_until IS NOT NULL)
    OR (state<>'cleaning' AND cleanup_token IS NULL AND cleanup_until IS NULL))
);

CREATE TABLE generated_audio (
  id uuid PRIMARY KEY,
  bundle_id uuid NOT NULL,
  org_id text NOT NULL,
  site_id text NOT NULL,
  language text NOT NULL CHECK(language IN ('en','ar','ur')),
  text_hash text NOT NULL CHECK(text_hash ~ '^[a-f0-9]{64}$'),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  bytes integer NOT NULL CHECK(bytes BETWEEN 8044 AND 2880044 AND bytes%2=0),
  duration_seconds double precision NOT NULL CHECK(duration_seconds=(bytes-44)::double precision/32000),
  FOREIGN KEY(bundle_id,org_id,site_id) REFERENCES generated_bundles(id,org_id,site_id),
  UNIQUE(bundle_id,language,text_hash)
);

CREATE FUNCTION protect_generated_bundle() RETURNS trigger LANGUAGE plpgsql AS $$
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
      (OLD.state='cleaning' AND NEW.state='cleaned')) THEN
    RAISE EXCEPTION 'Invalid generated bundle transition' USING ERRCODE='23514';
  END IF;
  IF OLD.stored_at IS NOT NULL AND NEW.stored_at IS DISTINCT FROM OLD.stored_at THEN
    RAISE EXCEPTION 'Generated storage evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER generated_bundle_frozen BEFORE UPDATE ON generated_bundles
  FOR EACH ROW EXECUTE FUNCTION protect_generated_bundle();
CREATE FUNCTION protect_generated_audio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Generated audio references are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER generated_audio_frozen BEFORE UPDATE OR DELETE ON generated_audio
  FOR EACH ROW EXECUTE FUNCTION protect_generated_audio();
CREATE TRIGGER generated_bundle_no_delete BEFORE DELETE ON generated_bundles
  FOR EACH ROW EXECUTE FUNCTION protect_generated_audio();
CREATE INDEX generated_bundles_cleanup ON generated_bundles(expires_at,id) WHERE state IN ('storing','stored','cleaning');
