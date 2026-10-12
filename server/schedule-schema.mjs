export function ensureScheduleSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS publication_schedules (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    briefing_id TEXT NOT NULL REFERENCES briefings(id),request_json TEXT NOT NULL,snapshot_hash TEXT NOT NULL,
    recipients_json TEXT NOT NULL,requested_by TEXT NOT NULL REFERENCES staff(id),authority_json TEXT NOT NULL,
    publish_at TEXT NOT NULL,created_at TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','published','cancelled','failed')),
    publication_id TEXT REFERENCES publications(id),error TEXT,finished_at TEXT,attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),retry_at TEXT,
    CHECK((state='queued' AND publication_id IS NULL AND error IS NULL AND finished_at IS NULL)
      OR (state='published' AND publication_id IS NOT NULL AND error IS NULL AND finished_at IS NOT NULL)
      OR (state='cancelled' AND publication_id IS NULL AND error IS NULL AND finished_at IS NOT NULL)
      OR (state='failed' AND publication_id IS NULL AND error IS NOT NULL AND finished_at IS NOT NULL))
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS publication_schedules_pending ON publication_schedules(briefing_id) WHERE state='queued';
  CREATE INDEX IF NOT EXISTS publication_schedules_due ON publication_schedules(state,publish_at,id);
  CREATE INDEX IF NOT EXISTS publication_schedules_history ON publication_schedules(org_id,site_id,briefing_id,created_at DESC,id);
  CREATE TRIGGER IF NOT EXISTS publication_schedule_scope BEFORE INSERT ON publication_schedules WHEN
    NOT EXISTS(SELECT 1 FROM briefings b WHERE b.id=NEW.briefing_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.requested_by AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS publication_schedule_frozen BEFORE UPDATE ON publication_schedules WHEN
    OLD.state!='queued' OR (NEW.state='queued' AND (NEW.attempts!=OLD.attempts+1 OR NEW.retry_at IS NULL)) OR NEW.id IS NOT OLD.id OR NEW.org_id IS NOT OLD.org_id OR NEW.site_id IS NOT OLD.site_id
    OR NEW.briefing_id IS NOT OLD.briefing_id OR NEW.request_json IS NOT OLD.request_json OR NEW.snapshot_hash IS NOT OLD.snapshot_hash
    OR NEW.recipients_json IS NOT OLD.recipients_json OR NEW.requested_by IS NOT OLD.requested_by OR NEW.authority_json IS NOT OLD.authority_json
    OR NEW.publish_at IS NOT OLD.publish_at OR NEW.created_at IS NOT OLD.created_at
    OR (NEW.publication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.id=NEW.publication_id
      AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id AND p.briefing_id=NEW.briefing_id))
    BEGIN SELECT RAISE(ABORT,'Schedule evidence is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS publication_schedule_no_delete BEFORE DELETE ON publication_schedules
    BEGIN SELECT RAISE(ABORT,'Schedule evidence is immutable'); END;`);
}
