CREATE TABLE source_audio_purges (
  request_id text PRIMARY KEY REFERENCES source_audio_requests(request_id),org_id text NOT NULL,site_id text NOT NULL,
  reason text NOT NULL CHECK(reason IN ('staged_expired','audio_retention')),status text NOT NULL CHECK(status IN ('queued','processing','complete')),
  created_at timestamptz NOT NULL,completed_at timestamptz,verified_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token text,lease_until timestamptz,retry_at timestamptz,error text
);
CREATE INDEX source_audio_purges_due ON source_audio_purges(status,retry_at,lease_until,verified_at);
CREATE FUNCTION freeze_source_audio_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Source cleanup history is immutable'; END IF;
  IF (NEW.request_id,NEW.org_id,NEW.site_id,NEW.reason,NEW.created_at)
    IS DISTINCT FROM (OLD.request_id,OLD.org_id,OLD.site_id,OLD.reason,OLD.created_at)
    OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at)
  THEN RAISE EXCEPTION 'Source cleanup history is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION scope_source_audio_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM source_audio_requests WHERE request_id=NEW.request_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
  THEN RAISE EXCEPTION 'Scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_audio_purges_frozen BEFORE UPDATE OR DELETE ON source_audio_purges FOR EACH ROW EXECUTE FUNCTION freeze_source_audio_purge();
CREATE TRIGGER source_audio_purges_scope BEFORE INSERT ON source_audio_purges FOR EACH ROW EXECUTE FUNCTION scope_source_audio_purge();
