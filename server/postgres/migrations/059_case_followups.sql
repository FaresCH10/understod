CREATE TABLE case_followups (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL,assignment_id text NOT NULL,
  publication_id text NOT NULL,actor_id text NOT NULL,actor_role text NOT NULL CHECK(actor_role IN ('owner','supervisor')),
  language text NOT NULL CHECK(language IN ('en','ar','ur')),source_text text NOT NULL CHECK(length(source_text) BETWEEN 1 AND 1000),
  request_hash text NOT NULL CHECK(length(request_hash)=64),glossary_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),lease_token text,lease_until timestamptz,
  manifest_json jsonb,error_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),delivered_at timestamptz,
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id)
);
CREATE INDEX case_followups_queue ON case_followups(status,created_at,id);
CREATE TABLE case_followup_audio (
  id text PRIMARY KEY,request_id text NOT NULL REFERENCES case_followups(id),org_id text NOT NULL,site_id text NOT NULL,
  job_lease text NOT NULL,language text NOT NULL CHECK(language IN ('en','ar','ur')),text_hash text NOT NULL CHECK(length(text_hash)=64),
  sha256 text NOT NULL CHECK(length(sha256)=64),bytes integer NOT NULL CHECK(bytes BETWEEN 8044 AND 2880044),
  duration_seconds double precision NOT NULL CHECK(duration_seconds BETWEEN 0.25 AND 90),
  state text NOT NULL CHECK(state IN ('storing','attached','cleaning','cleaned')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '1 day',
  cleanup_token text,cleanup_until timestamptz,
  UNIQUE(request_id,job_lease)
);
CREATE INDEX case_followup_audio_expiry ON case_followup_audio(state,expires_at);
CREATE FUNCTION guard_case_followup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Follow-up evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id AND s.role=NEW.actor_role AND s.active
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND a.id=NEW.assignment_id
        AND a.publication_id=NEW.publication_id AND a.language=NEW.language)
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
    THEN RAISE EXCEPTION 'Follow-up scope mismatch'; END IF;
  ELSE
    IF (NEW.id,NEW.org_id,NEW.site_id,NEW.case_id,NEW.assignment_id,NEW.publication_id,NEW.actor_id,NEW.actor_role,NEW.language,NEW.request_hash,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.case_id,OLD.assignment_id,OLD.publication_id,OLD.actor_id,OLD.actor_role,OLD.language,OLD.request_hash,OLD.created_at)
      OR ((NEW.source_text IS DISTINCT FROM OLD.source_text OR NEW.glossary_json IS DISTINCT FROM OLD.glossary_json)
        AND NOT (NEW.source_text='[Deleted]' AND NEW.glossary_json='{}'::jsonb AND NEW.manifest_json IS NULL
          AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL
          AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)))
      OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
      OR (OLD.status='delivered' AND (NEW.manifest_json IS DISTINCT FROM OLD.manifest_json OR NEW.status<>'delivered')
        AND NOT (NEW.source_text='[Deleted]' AND NEW.glossary_json='{}'::jsonb AND NEW.manifest_json IS NULL AND NEW.status='failed'
          AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)))
    THEN RAISE EXCEPTION 'Follow-up evidence is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_followup_guard BEFORE INSERT OR UPDATE OR DELETE ON case_followups FOR EACH ROW EXECUTE FUNCTION guard_case_followup();
CREATE FUNCTION guard_case_followup_audio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Follow-up audio evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM case_followups f WHERE f.id=NEW.request_id AND f.org_id=NEW.org_id AND f.site_id=NEW.site_id
      AND f.language=NEW.language AND f.status='processing' AND f.lease_token=NEW.job_lease AND f.lease_until>clock_timestamp())
    THEN RAISE EXCEPTION 'Follow-up audio scope mismatch'; END IF;
  ELSIF (NEW.id,NEW.request_id,NEW.org_id,NEW.site_id,NEW.job_lease,NEW.language,NEW.text_hash,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.request_id,OLD.org_id,OLD.site_id,OLD.job_lease,OLD.language,OLD.text_hash,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.created_at,OLD.expires_at)
    OR (OLD.state='storing' AND NEW.state NOT IN ('storing','attached','cleaning'))
    OR (OLD.state='attached' AND NEW.state NOT IN ('attached','cleaning'))
    OR (OLD.state='cleaned' AND NEW.state<>'cleaned') OR (OLD.state='cleaning' AND NEW.state NOT IN ('cleaning','cleaned'))
  THEN RAISE EXCEPTION 'Follow-up audio evidence is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_followup_audio_guard BEFORE INSERT OR UPDATE OR DELETE ON case_followup_audio FOR EACH ROW EXECUTE FUNCTION guard_case_followup_audio();
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE provider_operations ADD CHECK(kind IN ('source-transcription','connection-test','case-followup'));
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_check;
ALTER TABLE provider_operations ADD CHECK((kind='connection-test' AND org_id IS NULL AND claim_token IS NULL)
  OR (kind IN ('source-transcription','case-followup') AND org_id IS NOT NULL AND claim_token IS NOT NULL));
