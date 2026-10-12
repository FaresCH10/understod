ALTER TABLE briefing_content_purges ADD UNIQUE(briefing_id,org_id,site_id);
CREATE TABLE briefing_content_origins (
  briefing_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  context_json jsonb NOT NULL CHECK(jsonb_typeof(context_json)='object' AND octet_length(context_json::text)<=1048576),
  source_receipt_json jsonb NOT NULL CHECK(jsonb_typeof(source_receipt_json)='object' AND octet_length(source_receipt_json::text)<=1048576),
  source_policy_json jsonb NOT NULL CHECK(jsonb_typeof(source_policy_json)='object' AND octet_length(source_policy_json::text)<=16000),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefing_content_purges(briefing_id,org_id,site_id)
);
CREATE TRIGGER briefing_content_origins_frozen BEFORE UPDATE OR DELETE ON briefing_content_origins
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

-- Capture eligibility metadata before redaction, not private answer or briefing copies.
CREATE FUNCTION briefing_expiry_context(wanted_id text,wanted_org text,wanted_site text)
RETURNS jsonb LANGUAGE sql SET timezone='UTC' AS $$
  SELECT jsonb_build_object(
    'briefing',(SELECT jsonb_build_object('id',id,'org_id',org_id,'site_id',site_id,'revision',revision,'next_version',next_version,
      'state',state,'created_at',created_at,'updated_at',updated_at) FROM briefings WHERE id=wanted_id AND org_id=wanted_org AND site_id=wanted_site),
    'archive',(SELECT jsonb_build_object('request_id',request_id,'org_id',org_id,'site_id',site_id,'briefing_id',briefing_id,
      'request_sha256',encode(sha256(convert_to(request_json::text,'UTF8')),'hex'),'publication_ids',publication_ids_json,
      'archived_by',archived_by,'occurred_at',occurred_at) FROM briefing_archives WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site),
    'publications',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'org_id',org_id,'site_id',site_id,'briefing_id',briefing_id,
      'version',version,'state',state,'published_at',published_at) ORDER BY id),'[]') FROM publications WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site),
    'assignments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'org_id',a.org_id,'site_id',a.site_id,'publication_id',a.publication_id,
      'worker_id',a.worker_id,'language',a.language,'due_at',a.due_at,'created_at',a.created_at) ORDER BY a.id),'[]') FROM assignments a JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND p.org_id=wanted_org AND p.site_id=wanted_site),
    'attempts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'org_id',t.org_id,'site_id',t.site_id,'assignment_id',t.assignment_id,
      'submission_id',t.submission_id,'assessment_status',t.assessment_status,'outcome',t.outcome,'received_at',t.received_at,
      'text_expired',EXISTS(SELECT 1 FROM text_retention_purges r WHERE r.kind='attempt' AND r.reference_id=t.id)) ORDER BY t.id),'[]')
      FROM attempts t JOIN assignments a ON a.id=t.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND p.org_id=wanted_org AND p.site_id=wanted_site),
    'recordings',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'org_id',r.org_id,'site_id',r.site_id,'assignment_id',r.assignment_id,
      'submission_id',r.submission_id,'status',r.status,'sha256',r.sha256,'bytes',r.bytes,'received_at',r.received_at) ORDER BY r.id),'[]')
      FROM recordings r JOIN assignments a ON a.id=r.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND p.org_id=wanted_org AND p.site_id=wanted_site),
    'clarifications',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'org_id',c.org_id,'site_id',c.site_id,'assignment_id',c.assignment_id,
      'attempt_id',c.attempt_id,'status',c.status,'created_at',c.created_at,'resolved_at',c.resolved_at) ORDER BY c.id),'[]')
      FROM clarifications c JOIN assignments a ON a.id=c.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND p.org_id=wanted_org AND p.site_id=wanted_site),
    'generated_bundles',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.id,'org_id',g.org_id,'site_id',g.site_id,'briefing_id',g.briefing_id,
      'revision',g.revision,'manifest_hash',g.manifest_hash,'dependency_hash',g.dependency_hash,'state',g.state,
      'removed_at',(SELECT completed_at FROM generated_audio_removals r WHERE r.bundle_id=g.id)) ORDER BY g.id),'[]')
      FROM generated_bundles g WHERE g.briefing_id=wanted_id AND g.org_id=wanted_org AND g.site_id=wanted_site),
    'jobs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'org_id',org_id,'site_id',site_id,'briefing_id',briefing_id,
      'revision',revision,'kind',kind,'status',status) ORDER BY id),'[]') FROM jobs WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site),
    'schedules',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'org_id',org_id,'site_id',site_id,'briefing_id',briefing_id,
      'state',state,'publication_id',publication_id,'created_at',created_at,'finished_at',finished_at) ORDER BY id),'[]')
      FROM publication_schedules WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site)
  )
$$;
CREATE FUNCTION guard_briefing_content_origin() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE receipt jsonb;
BEGIN
  SELECT to_jsonb(p) INTO receipt FROM briefing_content_purges p
    WHERE p.briefing_id=NEW.briefing_id AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id;
  IF pg_trigger_depth()<2 OR receipt IS NULL OR receipt IS DISTINCT FROM NEW.source_receipt_json
    OR receipt->'proofs_json' IS DISTINCT FROM briefing_content_proofs(NEW.briefing_id,NEW.org_id,NEW.site_id)
    OR NEW.context_json IS DISTINCT FROM briefing_expiry_context(NEW.briefing_id,NEW.org_id,NEW.site_id)
    OR NEW.captured_at<(receipt->>'completed_at')::timestamptz OR NEW.captured_at>clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM briefing_retention_requests p WHERE to_jsonb(p)=NEW.source_policy_json
      AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id AND p.revision=(receipt->>'policy_revision')::integer
      AND p.request_json=jsonb_build_object('revision',p.revision-1,'days',(receipt->>'days')::integer,'confirmed',true)
      AND p.created_at<=(receipt->>'completed_at')::timestamptz) THEN
    RAISE EXCEPTION 'Original briefing expiry context or policy unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER briefing_content_origin_scope BEFORE INSERT ON briefing_content_origins
  FOR EACH ROW EXECUTE FUNCTION guard_briefing_content_origin();
CREATE FUNCTION capture_briefing_content_origin() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE policy jsonb;
BEGIN
  SELECT to_jsonb(r) INTO policy FROM briefing_retention_requests r WHERE r.org_id=NEW.org_id AND r.site_id=NEW.site_id
    AND r.revision=NEW.policy_revision AND r.request_json=jsonb_build_object('revision',r.revision-1,'days',NEW.days,'confirmed',true);
  IF policy IS NULL OR (SELECT count(*) FROM briefing_retention_requests r WHERE r.org_id=NEW.org_id AND r.site_id=NEW.site_id
    AND r.revision=NEW.policy_revision)<>1 THEN RAISE EXCEPTION 'Original briefing expiry policy receipt unavailable or ambiguous'; END IF;
  INSERT INTO briefing_content_origins(briefing_id,org_id,site_id,context_json,source_receipt_json,source_policy_json)
    VALUES(NEW.briefing_id,NEW.org_id,NEW.site_id,briefing_expiry_context(NEW.briefing_id,NEW.org_id,NEW.site_id),to_jsonb(NEW),policy);
  RETURN NEW;
END $$;
CREATE TRIGGER briefing_content_origin_capture AFTER INSERT ON briefing_content_purges
  FOR EACH ROW EXECUTE FUNCTION capture_briefing_content_origin();

CREATE FUNCTION guard_briefing_expiry_clock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed_at<transaction_timestamp() OR NEW.completed_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Briefing expiry completion must belong to the current transaction';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER briefing_content_expiry_clock BEFORE INSERT ON briefing_content_purges
  FOR EACH ROW EXECUTE FUNCTION guard_briefing_expiry_clock();

-- Already-erased rows without an original capture deliberately are not backfilled.
