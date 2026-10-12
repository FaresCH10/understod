ALTER TABLE recordings ADD CONSTRAINT recordings_retention_scope UNIQUE(id,org_id,site_id);
CREATE TABLE retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  audio_days integer NOT NULL CHECK(audio_days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER retention_requests_immutable BEFORE UPDATE OR DELETE ON retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE TABLE recording_purges (
  recording_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','processing','complete')),created_at timestamptz NOT NULL,completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),lease_token text,lease_until timestamptz,retry_at timestamptz,error text,
  FOREIGN KEY(recording_id,org_id,site_id) REFERENCES recordings(id,org_id,site_id)
);
CREATE INDEX recording_purges_due ON recording_purges(status,retry_at,lease_until);
CREATE FUNCTION protect_recording_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status='complete' THEN
    RAISE EXCEPTION 'Purge history is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.recording_id,NEW.org_id,NEW.site_id,NEW.created_at) IS DISTINCT FROM
    (OLD.recording_id,OLD.org_id,OLD.site_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Purge history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recording_purges_identity BEFORE UPDATE OR DELETE ON recording_purges
  FOR EACH ROW EXECUTE FUNCTION protect_recording_purge();
