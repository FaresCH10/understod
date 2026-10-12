CREATE TABLE source_audio_retries (
  retry_id text PRIMARY KEY,source_request_id text NOT NULL REFERENCES source_audio_requests(request_id),
  org_id text NOT NULL,site_id text NOT NULL,requested_by text NOT NULL,
  source_hash text NOT NULL CHECK(length(source_hash)=64),created_at timestamptz NOT NULL
);
CREATE FUNCTION source_audio_retry_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM source_audio_requests WHERE request_id=NEW.source_request_id AND org_id=NEW.org_id
    AND site_id=NEW.site_id AND requested_by=NEW.requested_by AND request_hash=NEW.source_hash) THEN
    RAISE EXCEPTION 'Scope mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_audio_retries_scope BEFORE INSERT ON source_audio_retries FOR EACH ROW EXECUTE FUNCTION source_audio_retry_scope();
CREATE FUNCTION source_audio_retry_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Source retry history is immutable'; END $$;
CREATE TRIGGER source_audio_retries_frozen BEFORE UPDATE OR DELETE ON source_audio_retries FOR EACH ROW EXECUTE FUNCTION source_audio_retry_frozen();
