export function ensureClarificationActionSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS clarification_action_receipts (
    request_id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    case_id TEXT NOT NULL REFERENCES clarifications(id),actor_id TEXT NOT NULL REFERENCES staff(id),
    actor_role TEXT NOT NULL CHECK(actor_role IN ('owner','supervisor')),
    kind TEXT NOT NULL CHECK(kind IN ('assign','resolve')),request_hash TEXT NOT NULL CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
    effect TEXT NOT NULL CHECK(effect IN ('applied','unchanged','rejected')),result_status TEXT NOT NULL CHECK(result_status IN ('open','resolved')),
    result_owner_id TEXT REFERENCES staff(id),reason_code TEXT,created_at TEXT NOT NULL,
    CHECK((effect='rejected' AND reason_code IS NOT NULL AND reason_code IN ('owner_changed','owner_unavailable','case_resolved','resolution_conflict'))
      OR (effect<>'rejected' AND reason_code IS NULL)),
    CHECK(kind<>'resolve' OR effect='rejected' OR result_status='resolved')
  ) STRICT;
  CREATE INDEX IF NOT EXISTS clarification_action_history ON clarification_action_receipts(org_id,site_id,case_id,created_at,request_id);
  CREATE TRIGGER IF NOT EXISTS clarification_action_insert BEFORE INSERT ON clarification_action_receipts WHEN
    NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=a.site_id
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND a.site_id=NEW.site_id)
    OR (NEW.result_owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff s WHERE s.id=NEW.result_owner_id AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id))
    BEGIN SELECT RAISE(ABORT,'Clarification action scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS clarification_action_update BEFORE UPDATE ON clarification_action_receipts
    BEGIN SELECT RAISE(ABORT,'Clarification action receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS clarification_action_delete BEFORE DELETE ON clarification_action_receipts
    BEGIN SELECT RAISE(ABORT,'Clarification action receipt is immutable'); END;`);
}
