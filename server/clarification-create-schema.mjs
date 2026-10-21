export function ensureClarificationCreationSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS clarification_creations (
    request_id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    case_id TEXT NOT NULL UNIQUE REFERENCES clarifications(id),assignment_id TEXT NOT NULL REFERENCES assignments(id),
    publication_id TEXT NOT NULL REFERENCES publications(id),publication_version INTEGER NOT NULL CHECK(publication_version>0),
    attempt_id TEXT REFERENCES attempts(id),actor_id TEXT NOT NULL REFERENCES staff(id),actor_role TEXT NOT NULL CHECK(actor_role IN ('owner','supervisor')),
    request_hash TEXT NOT NULL CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),created_at TEXT NOT NULL,CHECK(case_id=request_id)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS clarification_creation_actor ON clarification_creations(org_id,site_id,actor_id,created_at,request_id);
  CREATE TRIGGER IF NOT EXISTS clarification_creation_insert BEFORE INSERT ON clarification_creations WHEN
    NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id
      JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=a.site_id
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND a.site_id=NEW.site_id AND c.assignment_id=NEW.assignment_id
        AND c.attempt_id IS NEW.attempt_id AND c.created_at=NEW.created_at AND p.id=NEW.publication_id AND p.version=NEW.publication_version)
    BEGIN SELECT RAISE(ABORT,'Clarification creation scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS clarification_creation_update BEFORE UPDATE ON clarification_creations BEGIN SELECT RAISE(ABORT,'Clarification creation receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS clarification_creation_delete BEFORE DELETE ON clarification_creations BEGIN SELECT RAISE(ABORT,'Clarification creation receipt is immutable'); END;`);
}
