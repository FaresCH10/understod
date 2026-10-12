CREATE TABLE assignment_reminders (
  assignment_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  publication_id text NOT NULL,worker_id text NOT NULL,requested_by text NOT NULL,
  authority_json jsonb NOT NULL,due_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN ('queued','visible','skipped')),finished_at timestamptz,
  CHECK((state='queued' AND finished_at IS NULL) OR (state<>'queued' AND finished_at IS NOT NULL)),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY(worker_id,org_id,site_id) REFERENCES workers(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX assignment_reminders_due ON assignment_reminders(state,due_at,assignment_id);
CREATE FUNCTION protect_assignment_reminder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reminder history is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM assignments a JOIN publications p ON p.id=a.publication_id
      WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id
      AND a.worker_id=NEW.worker_id AND a.publication_id=NEW.publication_id
      AND a.due_at IS NOT NULL AND NEW.due_at>=p.published_at AND NEW.due_at<a.due_at)
      THEN RAISE EXCEPTION 'Reminder scope mismatch'; END IF;
  ELSIF OLD.state<>'queued' OR NEW.state='queued'
    OR (to_jsonb(NEW)-ARRAY['state','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','finished_at'])
    THEN RAISE EXCEPTION 'Reminder intent is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assignment_reminders_guard BEFORE INSERT OR UPDATE OR DELETE ON assignment_reminders
FOR EACH ROW EXECUTE FUNCTION protect_assignment_reminder();
