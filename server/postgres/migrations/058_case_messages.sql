CREATE TABLE case_messages (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL,assignment_id text NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('staff','worker')),actor_id text NOT NULL,
  language text NOT NULL CHECK(language IN ('en','ar','ur')),text text NOT NULL CHECK(length(text) BETWEEN 1 AND 1000),
  request_hash text NOT NULL CHECK(length(request_hash)=64),created_at timestamptz NOT NULL,
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id)
);
CREATE INDEX case_messages_thread ON case_messages(case_id,created_at,id);
CREATE FUNCTION guard_case_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conversation evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      WHERE c.id=NEW.case_id AND c.assignment_id=NEW.assignment_id AND a.language=NEW.language)
      OR (NEW.actor_type='staff' AND NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.actor_id AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id))
      OR (NEW.actor_type='worker' AND NOT EXISTS(SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.worker_id=NEW.actor_id))
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
    THEN RAISE EXCEPTION 'Conversation scope mismatch'; END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.site_id IS DISTINCT FROM OLD.site_id
      OR NEW.case_id IS DISTINCT FROM OLD.case_id OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
      OR NEW.actor_type IS DISTINCT FROM OLD.actor_type OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
      OR NEW.language IS DISTINCT FROM OLD.language OR NEW.request_hash IS DISTINCT FROM OLD.request_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.text<>'[Deleted]' OR NOT EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)
    THEN RAISE EXCEPTION 'Conversation evidence is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_message_guard BEFORE INSERT OR UPDATE OR DELETE ON case_messages FOR EACH ROW EXECUTE FUNCTION guard_case_message();
