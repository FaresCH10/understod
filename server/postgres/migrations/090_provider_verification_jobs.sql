CREATE TABLE provider_verification_jobs (
  request_id text PRIMARY KEY REFERENCES provider_verifications(request_id),
  operation_id text NOT NULL UNIQUE REFERENCES provider_operations(id),
  config_hash text NOT NULL CHECK(config_hash~'^[a-f0-9]{64}$'),
  model text NOT NULL,
  test_stage text NOT NULL CHECK(test_stage IN ('connection','translation','speech')),
  language text NOT NULL CHECK(language IN ('en','ar','ur')),
  max_requests integer NOT NULL CHECK(max_requests IN (1,2)),
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','verified','failed','uncertain')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts IN (0,1)),
  lease_token text,
  lease_until timestamptz,
  finished_at timestamptz,
  result_json jsonb CHECK(result_json IS NULL OR (jsonb_typeof(result_json)='object' AND octet_length(result_json::text)<=2000)),
  diagnostic_code text CHECK(diagnostic_code IS NULL OR diagnostic_code IN ('invalid_output','transport_uncertain','authority_changed','test_interrupted')),
  CHECK((test_stage='connection' AND language='en' AND max_requests=1)
    OR (test_stage='translation' AND language IN ('ar','ur') AND max_requests=2)
    OR (test_stage='speech' AND language IN ('en','ar') AND max_requests=1)),
  CHECK((status='queued' AND attempts=0 AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NULL AND result_json IS NULL AND diagnostic_code IS NULL)
    OR (status='processing' AND attempts=1 AND lease_token IS NOT NULL AND lease_token~'^[a-f0-9-]{36}$' AND lease_until IS NOT NULL AND lease_until=deadline_at AND finished_at IS NULL AND result_json IS NULL AND diagnostic_code IS NULL)
    OR (status IN ('verified','failed','uncertain') AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL
      AND ((status='verified' AND attempts=1 AND diagnostic_code IS NULL AND ((test_stage='connection' AND result_json IS NULL) OR (test_stage<>'connection' AND result_json IS NOT NULL)))
        OR (status IN ('failed','uncertain') AND result_json IS NULL AND diagnostic_code IS NOT NULL))))
);
CREATE INDEX provider_verification_jobs_queue ON provider_verification_jobs(status,created_at,request_id);

CREATE FUNCTION restrict_verification_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cap integer; used bigint;
BEGIN
  IF has_table_privilege(current_user,TG_RELID,'INSERT') THEN RETURN NEW; END IF;
  IF NEW.kind IS NULL OR NEW.data_class IS NULL OR NEW.reserved_requests IS NULL OR NEW.quota_day IS NULL
    OR NEW.reference_id IS NULL OR NEW.model IS NULL OR NEW.id IS NULL
    OR NEW.kind NOT IN ('connection-test','stage-test') OR NEW.org_id IS NOT NULL OR NEW.claim_token IS NOT NULL
    OR NEW.data_class<>'synthetic' OR NEW.reserved_requests NOT IN (1,2) OR NEW.input_hash IS NOT NULL
    OR NEW.provenance_json IS NOT NULL OR NEW.preparation_context_json IS NOT NULL
    OR NEW.quota_day<>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Restricted verification reservation' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(current_schema()||':operations-gate',0));
  IF EXISTS(SELECT 1 FROM system_controls WHERE id='global' AND (jobs_paused OR provider_paused)) THEN RAISE EXCEPTION 'Provider dispatch paused'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':provider-quota',0));
  SELECT max_daily_requests INTO cap FROM provider_policies WHERE scope_key='global' AND enabled;
  SELECT COALESCE(SUM(reserved_requests),0) INTO used FROM provider_operations WHERE quota_day=NEW.quota_day;
  IF cap IS NULL OR used+NEW.reserved_requests>cap THEN RAISE EXCEPTION 'Provider request quota reached'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_reservation_scope BEFORE INSERT ON provider_operations
FOR EACH ROW EXECUTE FUNCTION restrict_verification_reservation();

CREATE FUNCTION restrict_verification_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF has_table_privilege(current_user,TG_RELID,'INSERT') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='provider_verification_authorities' THEN
    IF pg_trigger_depth()<>2 THEN RAISE EXCEPTION 'Restricted verification authority insert' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.request_id!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR NEW.config_hash!~'^[a-f0-9]{64}$' OR NEW.state<>'pending' OR NEW.finished_at IS NOT NULL OR NEW.result_json IS NOT NULL OR NEW.diagnostic_code IS NOT NULL
    OR NEW.deadline_at>clock_timestamp()+interval '90 seconds'
    OR NEW.request_json<>(CASE WHEN NEW.test_stage='connection'
      THEN jsonb_build_object('kind','provider-verification','maxRequests',1,'confirmed',true)
      ELSE jsonb_build_object('kind','provider-stage-verification','stage',NEW.test_stage,'language',NEW.language,'maxRequests',CASE WHEN NEW.test_stage='translation' THEN 2 ELSE 1 END,'confirmed',true) END)
    OR NOT EXISTS(SELECT 1 FROM provider_operations o WHERE o.id=NEW.operation_id AND o.org_id IS NULL
      AND o.kind=CASE WHEN NEW.test_stage='connection' THEN 'connection-test' ELSE 'stage-test' END
      AND o.reference_id=NEW.request_id AND o.reserved_requests=CASE WHEN NEW.test_stage='translation' THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Restricted verification approval' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_approval_scope BEFORE INSERT ON provider_verifications
FOR EACH ROW EXECUTE FUNCTION restrict_verification_approval();
CREATE TRIGGER verification_authority_insert_scope BEFORE INSERT ON provider_verification_authorities
FOR EACH ROW EXECUTE FUNCTION restrict_verification_approval();

CREATE FUNCTION protect_verification_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total integer; accepted integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification job is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'queued' OR NEW.attempts<>0 OR NOT EXISTS(
      SELECT 1 FROM provider_verifications v JOIN provider_operations o ON o.id=v.operation_id
      WHERE v.request_id=NEW.request_id AND v.operation_id=NEW.operation_id AND v.config_hash=NEW.config_hash
        AND v.test_stage=NEW.test_stage AND v.language=NEW.language AND v.deadline_at=NEW.deadline_at
        AND v.state='pending' AND o.model=NEW.model AND o.reserved_requests=NEW.max_requests) THEN
      RAISE EXCEPTION 'Verification job metadata unavailable';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('queued','processing') OR
    (NEW.request_id,NEW.operation_id,NEW.config_hash,NEW.model,NEW.test_stage,NEW.language,NEW.max_requests,NEW.deadline_at,NEW.created_at)
    IS DISTINCT FROM (OLD.request_id,OLD.operation_id,OLD.config_hash,OLD.model,OLD.test_stage,OLD.language,OLD.max_requests,OLD.deadline_at,OLD.created_at) THEN
    RAISE EXCEPTION 'Verification job is immutable';
  END IF;
  IF NEW.status='processing' THEN
    IF OLD.status<>'queued' OR NEW.attempts<>1 OR NEW.deadline_at<=clock_timestamp() THEN RAISE EXCEPTION 'Verification claim unavailable'; END IF;
  ELSIF NEW.status IN ('verified','failed','uncertain') THEN
    IF NEW.attempts<>OLD.attempts OR NEW.finished_at>clock_timestamp() THEN RAISE EXCEPTION 'Verification completion unavailable'; END IF;
  ELSE RAISE EXCEPTION 'Verification transition unavailable'; END IF;
  IF NEW.status IN ('processing','verified') THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended(current_schema()||':operations-gate',0));
    PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':verification-authority',0));
    IF EXISTS(SELECT 1 FROM system_controls WHERE id='global' AND (jobs_paused OR provider_paused))
      OR NOT EXISTS(SELECT 1 FROM provider_verification_authorities a WHERE a.request_id=NEW.request_id AND NOT a.revoked AND a.expires_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'Provider verification authority changed';
    END IF;
  END IF;
  IF NEW.status='verified' THEN
    SELECT COUNT(*)::int,COUNT(*) FILTER(WHERE state='accepted')::int INTO total,accepted FROM provider_requests WHERE operation_id=NEW.operation_id;
    IF OLD.status<>'processing' OR OLD.lease_until<=clock_timestamp() OR NEW.finished_at>=NEW.deadline_at
      OR total<>NEW.max_requests OR accepted<>NEW.max_requests THEN RAISE EXCEPTION 'Verification evidence unavailable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_job_frozen BEFORE INSERT OR UPDATE OR DELETE ON provider_verification_jobs
FOR EACH ROW EXECUTE FUNCTION protect_verification_job();
