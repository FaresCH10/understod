export function ensureReminderSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS assignment_reminders (
    assignment_id TEXT PRIMARY KEY REFERENCES assignments(id),
    org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    publication_id TEXT NOT NULL REFERENCES publications(id),worker_id TEXT NOT NULL REFERENCES workers(id),
    requested_by TEXT NOT NULL REFERENCES staff(id),authority_json TEXT NOT NULL CHECK(json_valid(authority_json)),
    due_at TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','visible','skipped')),
    finished_at TEXT,CHECK((state='queued' AND finished_at IS NULL) OR (state<>'queued' AND finished_at IS NOT NULL))
  ) STRICT;
  CREATE INDEX IF NOT EXISTS assignment_reminders_due ON assignment_reminders(state,due_at,assignment_id);
  CREATE TRIGGER IF NOT EXISTS assignment_reminders_scope BEFORE INSERT ON assignment_reminders
    WHEN NOT EXISTS(SELECT 1 FROM assignments a JOIN publications p ON p.id=a.publication_id
      WHERE a.id=NEW.assignment_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id
      AND a.worker_id=NEW.worker_id AND a.publication_id=NEW.publication_id AND a.due_at IS NOT NULL
      AND NEW.due_at>=p.published_at AND NEW.due_at<a.due_at)
    OR NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.requested_by AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Reminder scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS assignment_reminders_frozen_update BEFORE UPDATE ON assignment_reminders
    WHEN OLD.state<>'queued' OR NEW.state='queued' OR NEW.assignment_id<>OLD.assignment_id
      OR NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id OR NEW.publication_id<>OLD.publication_id
      OR NEW.worker_id<>OLD.worker_id OR NEW.requested_by<>OLD.requested_by
      OR NEW.authority_json<>OLD.authority_json OR NEW.due_at<>OLD.due_at
    BEGIN SELECT RAISE(ABORT,'Reminder intent is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS assignment_reminders_frozen_delete BEFORE DELETE ON assignment_reminders
    BEGIN SELECT RAISE(ABORT,'Reminder history is immutable'); END;`);
}
