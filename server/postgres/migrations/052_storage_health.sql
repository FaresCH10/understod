CREATE TABLE storage_probes (
  id text PRIMARY KEY,
  adapter text NOT NULL CHECK(adapter IN ('local','r2')),
  state text NOT NULL CHECK(state IN ('processing','cleanup_pending','complete')),
  lease_token text,
  lease_until timestamptz,
  retry_at timestamptz,
  readback_verified boolean NOT NULL DEFAULT false,
  result text CHECK(result IN ('verified','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK((lease_token IS NULL)=(lease_until IS NULL)),
  CHECK((state='complete' AND result IS NOT NULL AND completed_at IS NOT NULL AND lease_token IS NULL AND retry_at IS NULL)
    OR (state<>'complete' AND result IS NULL AND completed_at IS NULL))
);
CREATE UNIQUE INDEX storage_probe_active ON storage_probes(adapter) WHERE state<>'complete';
CREATE FUNCTION protect_storage_probe() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.state='complete' OR (NEW.id,NEW.adapter,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.adapter,OLD.created_at) THEN
    RAISE EXCEPTION 'Storage probe evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER storage_probe_frozen BEFORE UPDATE OR DELETE ON storage_probes FOR EACH ROW EXECUTE FUNCTION protect_storage_probe();
