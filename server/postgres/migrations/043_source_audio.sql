CREATE TABLE source_audio_requests (
  request_id text PRIMARY KEY,org_id text NOT NULL REFERENCES organizations(id),site_id text NOT NULL REFERENCES sites(id),
  requested_by text NOT NULL REFERENCES staff(id),request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 120),generation_languages_json jsonb,
  id text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 8044 AND 2880044),
  duration_seconds double precision NOT NULL CHECK(duration_seconds BETWEEN 0.25 AND 90),
  original_id text NOT NULL UNIQUE,original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
  original_bytes integer NOT NULL CHECK(original_bytes BETWEEN 1 AND 10485760),original_type text NOT NULL,
  authority_json jsonb NOT NULL,status text NOT NULL CHECK(status IN ('storing','received','processing','transcribed','failed','blocked')),
  created_at timestamptz NOT NULL,received_at timestamptz,briefing_id text REFERENCES briefings(id),
  lease_token text,lease_until timestamptz,error text,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),retry_at timestamptz,
  CHECK(id<>original_id),CHECK(generation_languages_json IS NULL OR generation_languages_json IN ('["en"]'::jsonb,'["en","ar"]'::jsonb,'["en","ur"]'::jsonb,'["en","ar","ur"]'::jsonb)),
  CHECK((status='storing' AND received_at IS NULL) OR (status<>'storing' AND received_at IS NOT NULL)),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX source_audio_status ON source_audio_requests(status,created_at);
CREATE INDEX source_audio_history ON source_audio_requests(org_id,site_id,requested_by,received_at,request_id);
CREATE FUNCTION freeze_source_audio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.request_id,NEW.org_id,NEW.site_id,NEW.requested_by,NEW.request_hash,NEW.title,NEW.generation_languages_json,
      NEW.id,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.original_id,NEW.original_sha256,NEW.original_bytes,
      NEW.original_type,NEW.authority_json,NEW.created_at)
    IS DISTINCT FROM (OLD.request_id,OLD.org_id,OLD.site_id,OLD.requested_by,OLD.request_hash,OLD.title,OLD.generation_languages_json,
      OLD.id,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.original_id,OLD.original_sha256,OLD.original_bytes,
      OLD.original_type,OLD.authority_json,OLD.created_at)
    OR (OLD.received_at IS NOT NULL AND NEW.received_at IS DISTINCT FROM OLD.received_at)
    OR (OLD.briefing_id IS NOT NULL AND NEW.briefing_id IS DISTINCT FROM OLD.briefing_id)
    OR (NEW.briefing_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id))
  THEN RAISE EXCEPTION 'Source audio evidence is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_audio_frozen BEFORE UPDATE ON source_audio_requests FOR EACH ROW EXECUTE FUNCTION freeze_source_audio();
