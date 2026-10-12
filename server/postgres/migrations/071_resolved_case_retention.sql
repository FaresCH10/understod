CREATE TABLE case_retention_policies (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  days integer CHECK(days IN (7,30,90,365)),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE case_retention_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL,created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TRIGGER case_retention_receipt_immutable BEFORE UPDATE OR DELETE ON case_retention_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
ALTER TABLE clarifications ADD COLUMN resolved_at timestamptz;
-- Historical resolution time is unknown: begin its retention clock at migration,
-- rather than inventing an earlier date from case creation.
UPDATE clarifications SET resolved_at=clock_timestamp() WHERE status='resolved';
CREATE FUNCTION case_resolution_clock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.resolved_at:=CASE WHEN NEW.status='resolved' THEN clock_timestamp() ELSE NULL END;
  ELSIF OLD.status<>'resolved' AND NEW.status='resolved' THEN NEW.resolved_at:=clock_timestamp();
  ELSIF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN RAISE EXCEPTION 'Resolution clock is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_resolution_clock BEFORE INSERT OR UPDATE ON clarifications
  FOR EACH ROW EXECUTE FUNCTION case_resolution_clock();
CREATE INDEX clarifications_retention_due ON clarifications(org_id,site_id,resolved_at,id) WHERE status='resolved';
CREATE TABLE case_content_purges (
  case_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,assignment_id text NOT NULL,
  policy_revision integer NOT NULL,days integer NOT NULL CHECK(days IN (7,30,90,365)),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id)
);
CREATE FUNCTION guard_case_content_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Case retention evidence is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN case_retention_policies p ON p.org_id=c.org_id AND p.site_id=c.site_id
    WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND c.assignment_id=NEW.assignment_id
      AND c.status='resolved' AND c.resolved_at<=clock_timestamp()-p.days*interval '1 day'
      AND p.revision=NEW.policy_revision AND p.days=NEW.days
      AND NOT EXISTS(SELECT 1 FROM case_messages m WHERE m.case_id=c.id AND m.created_at>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_followups f WHERE f.case_id=c.id AND GREATEST(f.created_at,f.delivered_at)>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_reviews r WHERE r.case_id=c.id AND r.created_at>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_voice v WHERE v.requested_case_id=c.id AND GREATEST(v.created_at,v.received_at)>clock_timestamp()-p.days*interval '1 day'))
  THEN RAISE EXCEPTION 'Case retention scope or policy unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_content_purge_guard BEFORE INSERT OR UPDATE OR DELETE ON case_content_purges
  FOR EACH ROW EXECUTE FUNCTION guard_case_content_purge();

CREATE OR REPLACE FUNCTION protect_clarification_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
  IF EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=OLD.id) THEN
    IF NEW.reason=(CASE WHEN deleted THEN '[Deleted]' ELSE '[Expired]' END) AND NEW.notes=''
      AND (to_jsonb(NEW)-ARRAY['reason','notes']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['reason','notes']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Expired case content is immutable';
  END IF;
  IF deleted THEN
    IF NEW.reason='[Deleted]' AND NEW.notes='' AND
      (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.attempt_id,NEW.created_at,NEW.status,NEW.owner_staff_id)
      IS NOT DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.attempt_id,OLD.created_at,OLD.status,OLD.owner_staff_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Deleted content is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.attempt_id,NEW.reason,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.attempt_id,OLD.reason,OLD.created_at)
    OR (OLD.status='resolved' AND (NEW.status,NEW.notes,NEW.owner_staff_id) IS DISTINCT FROM (OLD.status,OLD.notes,OLD.owner_staff_id))
  THEN RAISE EXCEPTION 'Clarification evidence is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_help_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
    IF (to_jsonb(NEW)-'text') IS NOT DISTINCT FROM (to_jsonb(OLD)-'text')
      AND ((deleted AND NEW.text='[Deleted]') OR (NOT deleted AND NEW.text='[Expired]'
        AND EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=OLD.case_id))) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Original help request is immutable' USING ERRCODE='23514';
END $$;
CREATE OR REPLACE FUNCTION guard_case_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conversation evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      WHERE c.id=NEW.case_id AND c.assignment_id=NEW.assignment_id AND a.language=NEW.language)
      OR (NEW.actor_type='staff' AND NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.actor_id AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id))
      OR (NEW.actor_type='worker' AND NOT EXISTS(SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.worker_id=NEW.actor_id))
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
      OR EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=NEW.case_id)
    THEN RAISE EXCEPTION 'Conversation scope mismatch'; END IF;
  ELSE
    deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
    IF (to_jsonb(NEW)-'text') IS DISTINCT FROM (to_jsonb(OLD)-'text')
      OR NOT ((deleted AND NEW.text='[Deleted]') OR (NOT deleted AND NEW.text='[Expired]'
        AND EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=OLD.case_id)))
    THEN RAISE EXCEPTION 'Conversation evidence is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_case_followup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Follow-up evidence is immutable'; END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=OLD.case_id) THEN
    deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
    IF NEW.source_text=(CASE WHEN deleted THEN '[Deleted]' ELSE '[Expired]' END) AND NEW.glossary_json='{}'::jsonb
      AND NEW.manifest_json IS NULL AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL AND NEW.status='failed'
      AND ((deleted AND NEW.error_code IN ('content_expired','worker_deleted')) OR (NOT deleted AND NEW.error_code='content_expired'))
      AND (to_jsonb(NEW)-ARRAY['source_text','glossary_json','manifest_json','lease_token','lease_until','status','error_code'])
        IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['source_text','glossary_json','manifest_json','lease_token','lease_until','status','error_code']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Expired follow-up content is immutable';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id AND s.role=NEW.actor_role AND s.active
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND a.id=NEW.assignment_id
        AND a.publication_id=NEW.publication_id AND a.language=NEW.language)
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
      OR EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=NEW.case_id)
    THEN RAISE EXCEPTION 'Follow-up scope mismatch'; END IF;
  ELSE
    IF (NEW.id,NEW.org_id,NEW.site_id,NEW.case_id,NEW.assignment_id,NEW.publication_id,NEW.actor_id,NEW.actor_role,NEW.language,NEW.request_hash,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.case_id,OLD.assignment_id,OLD.publication_id,OLD.actor_id,OLD.actor_role,OLD.language,OLD.request_hash,OLD.created_at)
      OR ((NEW.source_text IS DISTINCT FROM OLD.source_text OR NEW.glossary_json IS DISTINCT FROM OLD.glossary_json)
        AND NOT (NEW.source_text='[Deleted]' AND NEW.glossary_json='{}'::jsonb AND NEW.manifest_json IS NULL AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL
          AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)))
      OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
      OR (OLD.status='delivered' AND (NEW.manifest_json IS DISTINCT FROM OLD.manifest_json OR NEW.status<>'delivered')
        AND NOT (NEW.source_text='[Deleted]' AND NEW.glossary_json='{}'::jsonb AND NEW.manifest_json IS NULL AND NEW.status='failed'
          AND EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)))
    THEN RAISE EXCEPTION 'Follow-up evidence is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_case_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleted boolean;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case review is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id AND s.active AND s.role=NEW.actor_role
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND a.id=NEW.assignment_id
        AND (NEW.kind='deadline' OR c.attempt_id=NEW.attempt_id))
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
      OR EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=NEW.case_id)
    THEN RAISE EXCEPTION 'Case review scope mismatch'; END IF;
  ELSE
    deleted:=EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id);
    IF (to_jsonb(NEW)-'reason') IS DISTINCT FROM (to_jsonb(OLD)-'reason') OR NEW.kind<>'disagree'
      OR (((deleted AND NEW.reason='[Deleted]') OR (NOT deleted AND NEW.reason='[Expired]'
        AND EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=OLD.case_id))) IS NOT TRUE)
    THEN RAISE EXCEPTION 'Case review is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
