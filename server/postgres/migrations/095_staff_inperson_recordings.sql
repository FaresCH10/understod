ALTER TABLE case_voice DROP CONSTRAINT case_voice_kind_check;
ALTER TABLE case_voice ADD CHECK(kind IN ('help','reply','in_person'));
ALTER TABLE case_voice ADD COLUMN actor_type text NOT NULL DEFAULT 'worker' CHECK(actor_type IN ('worker','staff'));
ALTER TABLE case_voice ADD COLUMN actor_id text;
ALTER TABLE case_voice ADD COLUMN actor_role text;
ALTER TABLE case_voice ADD FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id);
ALTER TABLE case_voice ADD CHECK((actor_type='worker' AND kind IN ('help','reply') AND actor_id IS NULL AND actor_role IS NULL)
  OR (actor_type='staff' AND kind='in_person' AND actor_id IS NOT NULL AND actor_role IS NOT NULL AND actor_role IN ('owner','supervisor')));
CREATE INDEX case_voice_staff_history ON case_voice(requested_case_id,created_at,id) WHERE actor_type='staff';

CREATE OR REPLACE FUNCTION guard_case_voice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Voice evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'storing' OR NEW.cleanup_state<>'active' OR NEW.lease_token IS NULL OR NEW.lease_until IS NULL
    THEN RAISE EXCEPTION 'Invalid voice staging'; END IF;
    IF NOT EXISTS(SELECT 1 FROM assignments a JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id AND w.active
      WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id AND a.worker_id=NEW.worker_id
        AND (NEW.actor_type='staff' OR a.language=NEW.language))
      OR EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=NEW.worker_id)
    THEN RAISE EXCEPTION 'Voice scope mismatch'; END IF;
    IF NEW.actor_type='staff' AND NOT EXISTS(SELECT 1 FROM staff s JOIN clarifications c ON c.org_id=s.org_id AND c.site_id=s.site_id
      WHERE s.id=NEW.actor_id AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id AND s.active AND s.role=NEW.actor_role
        AND c.id=NEW.requested_case_id AND c.assignment_id=NEW.assignment_id AND c.status='open'
        AND NOT EXISTS(SELECT 1 FROM case_content_purges p WHERE p.case_id=c.id))
    THEN RAISE EXCEPTION 'Staff recording scope mismatch'; END IF;
  ELSIF (NEW.id,NEW.request_id,NEW.org_id,NEW.site_id,NEW.assignment_id,NEW.worker_id,NEW.kind,NEW.requested_case_id,NEW.language,NEW.sha256,NEW.bytes,NEW.duration_seconds,NEW.created_at,NEW.actor_type,NEW.actor_id,NEW.actor_role)
    IS DISTINCT FROM (OLD.id,OLD.request_id,OLD.org_id,OLD.site_id,OLD.assignment_id,OLD.worker_id,OLD.kind,OLD.requested_case_id,OLD.language,OLD.sha256,OLD.bytes,OLD.duration_seconds,OLD.created_at,OLD.actor_type,OLD.actor_id,OLD.actor_role)
    OR (OLD.status='received' AND (NEW.status,NEW.received_at,NEW.case_id) IS DISTINCT FROM (OLD.status,OLD.received_at,OLD.case_id))
    OR (OLD.status='failed' AND NEW.status<>'failed')
    OR (OLD.cleanup_state='cleaned' AND NEW.cleanup_state<>'cleaned')
    OR (OLD.cleanup_state='cleaning' AND NEW.cleanup_state NOT IN ('cleaning','cleaned'))
  THEN RAISE EXCEPTION 'Voice evidence is immutable'; END IF;
  IF NEW.status='received' AND (TG_OP='INSERT' OR OLD.status<>'received') THEN
    IF NEW.actor_type='worker' AND NOT EXISTS(SELECT 1 FROM case_messages m WHERE m.id=NEW.request_id AND m.case_id=NEW.case_id AND m.assignment_id=NEW.assignment_id
      AND m.org_id=NEW.org_id AND m.site_id=NEW.site_id AND m.actor_type='worker' AND m.actor_id=NEW.worker_id AND m.request_hash=NEW.sha256)
    THEN RAISE EXCEPTION 'Voice message receipt mismatch'; END IF;
    IF NEW.actor_type='staff' AND (NEW.case_id<>NEW.requested_case_id OR NOT EXISTS(SELECT 1 FROM clarifications c
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND c.assignment_id=NEW.assignment_id))
    THEN RAISE EXCEPTION 'Staff recording receipt mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
