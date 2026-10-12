CREATE TABLE provider_policies (
  scope_key text PRIMARY KEY,
  org_id text REFERENCES organizations(id),
  revision integer NOT NULL CHECK(revision>0),
  enabled boolean NOT NULL,
  max_daily_requests integer NOT NULL CHECK(max_daily_requests BETWEEN 0 AND 100000),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((org_id IS NULL AND scope_key='global') OR (org_id IS NOT NULL AND scope_key='tenant:'||org_id))
);
CREATE TABLE provider_operations (
  id text PRIMARY KEY,
  org_id text REFERENCES organizations(id),
  kind text NOT NULL CHECK(kind IN ('source-transcription','connection-test')),
  reference_id text NOT NULL,
  claim_token text,
  model text NOT NULL,
  data_class text NOT NULL CHECK(data_class='synthetic'),
  reserved_requests integer NOT NULL CHECK(reserved_requests BETWEEN 1 AND 64),
  quota_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((kind='connection-test' AND org_id IS NULL AND claim_token IS NULL) OR (kind='source-transcription' AND org_id IS NOT NULL AND claim_token IS NOT NULL))
);
CREATE INDEX provider_operations_quota ON provider_operations(quota_day,org_id);
CREATE TABLE provider_requests (
  id text PRIMARY KEY,
  operation_id text NOT NULL REFERENCES provider_operations(id),
  sequence integer NOT NULL CHECK(sequence>0),
  cleanup boolean NOT NULL,
  state text NOT NULL CHECK(state IN ('started','accepted','rejected','uncertain')),
  http_status integer CHECK(http_status BETWEEN 100 AND 599),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  UNIQUE(operation_id,sequence),
  CHECK((state='started' AND http_status IS NULL AND finished_at IS NULL)
    OR (state='uncertain' AND http_status IS NULL AND finished_at IS NOT NULL)
    OR (state IN ('accepted','rejected') AND http_status IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE TABLE provider_verifications (
  request_id text PRIMARY KEY,
  operator_id text NOT NULL REFERENCES platform_operators(id),
  session_hash text NOT NULL,
  operation_id text NOT NULL UNIQUE REFERENCES provider_operations(id),
  config_hash text NOT NULL,
  request_json jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('pending','verified','failed','uncertain')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL,
  finished_at timestamptz,
  CHECK((state='pending' AND finished_at IS NULL) OR (state<>'pending' AND finished_at IS NOT NULL))
);
CREATE FUNCTION protect_provider_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='provider_operations' OR TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Provider evidence is immutable';
  END IF;
  IF TG_TABLE_NAME='provider_requests' THEN
    IF OLD.state<>'started' OR (NEW.id,NEW.operation_id,NEW.sequence,NEW.cleanup,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.operation_id,OLD.sequence,OLD.cleanup,OLD.created_at) THEN
      RAISE EXCEPTION 'Provider request evidence is immutable';
    END IF;
  ELSIF TG_TABLE_NAME='provider_verifications' THEN
    IF OLD.state<>'pending' OR (NEW.request_id,NEW.operator_id,NEW.session_hash,NEW.operation_id,NEW.config_hash,NEW.request_json,NEW.created_at,NEW.deadline_at)
      IS DISTINCT FROM (OLD.request_id,OLD.operator_id,OLD.session_hash,OLD.operation_id,OLD.config_hash,OLD.request_json,OLD.created_at,OLD.deadline_at) THEN
      RAISE EXCEPTION 'Provider verification evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_operations_frozen BEFORE UPDATE OR DELETE ON provider_operations FOR EACH ROW EXECUTE FUNCTION protect_provider_evidence();
CREATE TRIGGER provider_requests_frozen BEFORE UPDATE OR DELETE ON provider_requests FOR EACH ROW EXECUTE FUNCTION protect_provider_evidence();
CREATE TRIGGER provider_verifications_frozen BEFORE UPDATE OR DELETE ON provider_verifications FOR EACH ROW EXECUTE FUNCTION protect_provider_evidence();
