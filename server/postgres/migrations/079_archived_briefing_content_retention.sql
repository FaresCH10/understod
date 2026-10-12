CREATE TABLE briefing_retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  days integer CHECK(days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE briefing_retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER briefing_retention_requests_frozen BEFORE UPDATE OR DELETE ON briefing_retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE TABLE briefing_content_purges (
  briefing_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  policy_revision integer NOT NULL CHECK(policy_revision>0),days integer NOT NULL CHECK(days IN (7,30,90,365)),
  proofs_json jsonb NOT NULL CHECK(jsonb_typeof(proofs_json)='object'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id)
);
CREATE TRIGGER briefing_content_purges_frozen BEFORE UPDATE OR DELETE ON briefing_content_purges
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

CREATE FUNCTION briefing_content_due(wanted_id text,wanted_org text,wanted_site text,days integer)
RETURNS boolean LANGUAGE sql AS $$
  SELECT days IS NOT NULL AND EXISTS(SELECT 1 FROM briefing_archives a
    WHERE a.briefing_id=wanted_id AND a.org_id=wanted_org AND a.site_id=wanted_site
      AND a.occurred_at<=clock_timestamp()-days*interval '1 day')
    AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.briefing_id=wanted_id AND p.state='published')
    AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.briefing_id=wanted_id AND j.status IN ('queued','processing'))
    AND NOT EXISTS(SELECT 1 FROM publication_schedules s WHERE s.briefing_id=wanted_id AND s.state='queued')
    AND NOT EXISTS(SELECT 1 FROM attempts t JOIN assignments a ON a.id=t.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND (t.assessment_status<>'complete' AND NOT EXISTS(
        SELECT 1 FROM text_retention_purges r WHERE r.kind='attempt' AND r.reference_id=t.id)
        OR t.received_at>clock_timestamp()-days*interval '1 day'))
    AND NOT EXISTS(SELECT 1 FROM recordings r JOIN assignments a ON a.id=r.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND (r.status IN ('storing','received','processing') OR r.received_at>clock_timestamp()-days*interval '1 day'))
    AND NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id JOIN publications p ON p.id=a.publication_id
      WHERE p.briefing_id=wanted_id AND (c.status<>'resolved' OR c.resolved_at IS NULL OR c.resolved_at>clock_timestamp()-days*interval '1 day'))
    AND NOT EXISTS(SELECT 1 FROM generated_bundles g WHERE g.briefing_id=wanted_id AND (g.state<>'cleaned'
      OR NOT EXISTS(SELECT 1 FROM generated_audio_removals r WHERE r.bundle_id=g.id)))
    AND NOT EXISTS(SELECT 1 FROM briefing_content_purges r WHERE r.briefing_id=wanted_id)
$$;

-- Hash only the content projections. Acceptance identities and outcome rows are not rewritten.
CREATE FUNCTION briefing_content_proofs(wanted_id text,wanted_org text,wanted_site text)
RETURNS jsonb LANGUAGE sql AS $$
  WITH copies AS (
    SELECT 'briefings' AS kind,id AS key,jsonb_build_object('title',title,'source',source,'prepared_json',prepared_json) AS content
      FROM briefings WHERE id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'publications',id,jsonb_build_object('snapshot_json',snapshot_json) FROM publications WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'draft_reviews',briefing_id,jsonb_build_object('content_json',content_json) FROM draft_reviews WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'briefing_review_requests',request_id,jsonb_build_object('request_json',request_json) FROM briefing_review_requests WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'briefing_regeneration_requests',request_id,jsonb_build_object('baseline_review_json',baseline_review_json) FROM briefing_regeneration_requests WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'generated_bundles',id::text,jsonb_build_object('manifest_json',manifest_json) FROM generated_bundles WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'briefing_copies',request_id,jsonb_build_object('title',title) FROM briefing_copies WHERE copy_briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
    UNION ALL SELECT 'source_audio_requests',request_id,jsonb_build_object('title',title) FROM source_audio_requests WHERE briefing_id=wanted_id AND org_id=wanted_org AND site_id=wanted_site
  ), groups AS (SELECT kind,jsonb_object_agg(key,encode(sha256(convert_to(content::text,'UTF8')),'hex')) AS proofs FROM copies GROUP BY kind)
  SELECT COALESCE(jsonb_object_agg(kind,proofs),'{}'::jsonb) FROM groups
$$;
CREATE FUNCTION guard_briefing_content_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM briefing_retention_policies p WHERE p.org_id=NEW.org_id AND p.site_id=NEW.site_id
    AND p.revision=NEW.policy_revision AND p.days=NEW.days
    AND briefing_content_due(NEW.briefing_id,NEW.org_id,NEW.site_id,p.days))
    OR NEW.proofs_json IS DISTINCT FROM briefing_content_proofs(NEW.briefing_id,NEW.org_id,NEW.site_id) THEN
    RAISE EXCEPTION 'Briefing content retention scope, policy or proofs unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER briefing_content_purge_scope BEFORE INSERT ON briefing_content_purges
  FOR EACH ROW EXECUTE FUNCTION guard_briefing_content_purge();

CREATE FUNCTION briefing_content_tombstone(kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'briefings' THEN '{"title":"[Expired]","source":"[Expired]","prepared_json":null}'::jsonb
    WHEN 'publications' THEN '{"snapshot_json":{"title":"[Expired]","question":"[Expired]","facts":[],"contentExpired":true}}'::jsonb
    WHEN 'draft_reviews' THEN '{"content_json":{}}'::jsonb
    WHEN 'briefing_review_requests' THEN '{"request_json":{}}'::jsonb
    WHEN 'briefing_regeneration_requests' THEN '{"baseline_review_json":null}'::jsonb
    WHEN 'generated_bundles' THEN '{"manifest_json":{}}'::jsonb
    ELSE '{"title":"[Expired]"}'::jsonb END
$$;
CREATE FUNCTION briefing_redaction_allowed(kind text,old_row jsonb,new_row jsonb) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM briefing_content_purges p WHERE p.briefing_id=CASE kind WHEN 'briefings' THEN old_row->>'id'
    WHEN 'briefing_copies' THEN old_row->>'copy_briefing_id' ELSE old_row->>'briefing_id' END
    AND p.org_id=old_row->>'org_id' AND p.site_id=old_row->>'site_id')
    AND (old_row-ARRAY(SELECT jsonb_object_keys(briefing_content_tombstone(kind))))
      IS NOT DISTINCT FROM (new_row-ARRAY(SELECT jsonb_object_keys(briefing_content_tombstone(kind))))
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(briefing_content_tombstone(kind)) t WHERE new_row->t.key IS DISTINCT FROM t.value)
$$;
CREATE FUNCTION guard_expired_briefing_copy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; old_data jsonb; wanted_id text; old_id text;
BEGIN
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  wanted_id:=CASE TG_TABLE_NAME WHEN 'briefings' THEN row_data->>'id' WHEN 'briefing_copies' THEN row_data->>'copy_briefing_id' ELSE row_data->>'briefing_id' END;
  IF TG_OP='UPDATE' THEN
    old_data:=to_jsonb(OLD);
    old_id:=CASE TG_TABLE_NAME WHEN 'briefings' THEN old_data->>'id' WHEN 'briefing_copies' THEN old_data->>'copy_briefing_id' ELSE old_data->>'briefing_id' END;
  END IF;
  IF EXISTS(SELECT 1 FROM briefing_content_purges WHERE briefing_id IN (wanted_id,old_id)) THEN
    IF TG_OP<>'UPDATE' OR EXISTS(SELECT 1 FROM jsonb_each(briefing_content_tombstone(TG_TABLE_NAME)) t WHERE row_data->t.key IS DISTINCT FROM t.value) THEN
      RAISE EXCEPTION 'Expired briefing content is immutable';
    END IF;
    IF wanted_id IS DISTINCT FROM old_id OR row_data->>'org_id' IS DISTINCT FROM old_data->>'org_id'
      OR row_data->>'site_id' IS DISTINCT FROM old_data->>'site_id'
      OR NOT briefing_redaction_allowed(TG_TABLE_NAME,old_data,row_data) THEN
      RAISE EXCEPTION 'Expired briefing evidence is immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER briefings_expired_content BEFORE INSERT OR UPDATE OR DELETE ON briefings FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER publications_expired_content BEFORE INSERT OR UPDATE OR DELETE ON publications FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER draft_reviews_expired_content BEFORE INSERT OR UPDATE OR DELETE ON draft_reviews FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER review_requests_expired_content BEFORE INSERT OR UPDATE OR DELETE ON briefing_review_requests FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER regeneration_requests_expired_content BEFORE INSERT OR UPDATE OR DELETE ON briefing_regeneration_requests FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER generated_bundles_expired_content BEFORE INSERT OR UPDATE OR DELETE ON generated_bundles FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER briefing_copies_expired_content BEFORE INSERT OR UPDATE OR DELETE ON briefing_copies FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();
CREATE TRIGGER source_audio_expired_content BEFORE INSERT OR UPDATE OR DELETE ON source_audio_requests FOR EACH ROW EXECUTE FUNCTION guard_expired_briefing_copy();

CREATE OR REPLACE FUNCTION protect_publication_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.briefing_id,NEW.version,NEW.snapshot_json,NEW.published_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.briefing_id,OLD.version,OLD.snapshot_json,OLD.published_at) THEN
    RAISE EXCEPTION 'Published snapshot is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION freeze_briefing_review_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Draft review receipt is immutable';
END $$;
CREATE OR REPLACE FUNCTION protect_briefing_copy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Draft copy receipt is immutable' USING ERRCODE='23514';
END $$;
CREATE FUNCTION protect_regeneration_content_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Generated audio references are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER regeneration_request_frozen ON briefing_regeneration_requests;
CREATE TRIGGER regeneration_request_frozen BEFORE UPDATE OR DELETE ON briefing_regeneration_requests
  FOR EACH ROW EXECUTE FUNCTION protect_regeneration_content_receipt();
CREATE OR REPLACE FUNCTION protect_generated_bundle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.briefing_id,NEW.revision,NEW.job_id,NEW.job_lease,NEW.manifest_json,NEW.manifest_hash,NEW.dependency_hash,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.briefing_id,OLD.revision,OLD.job_id,OLD.job_lease,OLD.manifest_json,OLD.manifest_hash,OLD.dependency_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'Generated bundle identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state<>OLD.state AND NOT ((OLD.state='storing' AND NEW.state IN ('stored','cleaning'))
    OR (OLD.state='stored' AND NEW.state IN ('attached','cleaning'))
    OR (OLD.state='attached' AND NEW.state='cleaning' AND EXISTS(SELECT 1 FROM generated_audio_retirements WHERE bundle_id=OLD.id AND org_id=OLD.org_id AND site_id=OLD.site_id))
    OR (OLD.state='cleaning' AND NEW.state='cleaned')) THEN RAISE EXCEPTION 'Invalid generated bundle transition' USING ERRCODE='23514'; END IF;
  IF OLD.stored_at IS NOT NULL AND NEW.stored_at IS DISTINCT FROM OLD.stored_at THEN RAISE EXCEPTION 'Generated storage evidence is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION freeze_source_audio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF briefing_redaction_allowed(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (NEW.request_id,NEW.org_id,NEW.site_id,NEW.requested_by,NEW.request_hash,NEW.title,NEW.generation_languages_json,NEW.id,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.original_id,NEW.original_sha256,NEW.original_bytes,NEW.original_type,NEW.authority_json,NEW.created_at)
    IS DISTINCT FROM (OLD.request_id,OLD.org_id,OLD.site_id,OLD.requested_by,OLD.request_hash,OLD.title,OLD.generation_languages_json,OLD.id,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.original_id,OLD.original_sha256,OLD.original_bytes,OLD.original_type,OLD.authority_json,OLD.created_at)
    OR (OLD.received_at IS NOT NULL AND NEW.received_at IS DISTINCT FROM OLD.received_at)
    OR (OLD.briefing_id IS NOT NULL AND NEW.briefing_id IS DISTINCT FROM OLD.briefing_id)
    OR (NEW.briefing_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briefings WHERE id=NEW.briefing_id AND org_id=NEW.org_id AND site_id=NEW.site_id)) THEN
    RAISE EXCEPTION 'Source audio evidence is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION require_briefing_content_redacted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM briefings WHERE id=NEW.briefing_id AND (title<>'[Expired]' OR source<>'[Expired]' OR prepared_json IS NOT NULL))
    OR EXISTS(SELECT 1 FROM publications WHERE briefing_id=NEW.briefing_id AND snapshot_json IS DISTINCT FROM briefing_content_tombstone('publications')->'snapshot_json')
    OR EXISTS(SELECT 1 FROM draft_reviews WHERE briefing_id=NEW.briefing_id AND content_json<>'{}'::jsonb)
    OR EXISTS(SELECT 1 FROM briefing_review_requests WHERE briefing_id=NEW.briefing_id AND request_json<>'{}'::jsonb)
    OR EXISTS(SELECT 1 FROM briefing_regeneration_requests WHERE briefing_id=NEW.briefing_id AND baseline_review_json IS NOT NULL)
    OR EXISTS(SELECT 1 FROM generated_bundles WHERE briefing_id=NEW.briefing_id AND manifest_json<>'{}'::jsonb)
    OR EXISTS(SELECT 1 FROM briefing_copies WHERE copy_briefing_id=NEW.briefing_id AND title<>'[Expired]')
    OR EXISTS(SELECT 1 FROM source_audio_requests WHERE briefing_id=NEW.briefing_id AND title<>'[Expired]') THEN
    RAISE EXCEPTION 'Briefing content redaction incomplete';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER briefing_content_redaction_complete AFTER INSERT ON briefing_content_purges
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_briefing_content_redacted();
