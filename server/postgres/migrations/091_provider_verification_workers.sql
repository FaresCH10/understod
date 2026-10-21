CREATE TABLE provider_verification_workers (
  worker_id text PRIMARY KEY CHECK(worker_id~*'^[a-f0-9-]{36}$'),
  config_hash text NOT NULL CHECK(config_hash~'^[a-f0-9]{64}$'),
  capability_hash text NOT NULL CHECK(capability_hash~'^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN ('active','stopped')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX provider_verification_workers_fresh ON provider_verification_workers(state,seen_at);

CREATE FUNCTION protect_verification_worker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.seen_at>=clock_timestamp()-interval '24 hours' THEN RAISE EXCEPTION 'Verification worker is not expired'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state='stopped' OR (NEW.worker_id,NEW.config_hash,NEW.capability_hash,NEW.created_at)
      IS DISTINCT FROM (OLD.worker_id,OLD.config_hash,OLD.capability_hash,OLD.created_at) THEN
      RAISE EXCEPTION 'Verification worker metadata is immutable';
    END IF;
  ELSE
    IF NEW.state<>'active' THEN RAISE EXCEPTION 'Verification worker must start active'; END IF;
    NEW.created_at=clock_timestamp();
  END IF;
  NEW.seen_at=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER verification_worker_frozen BEFORE INSERT OR UPDATE OR DELETE ON provider_verification_workers
FOR EACH ROW EXECUTE FUNCTION protect_verification_worker();
