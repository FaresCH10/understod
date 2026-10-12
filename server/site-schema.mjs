import {siteAdmissionTables} from './site-lifecycle-input.mjs';
export function ensureSiteSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS site_lifecycle (
    site_id TEXT PRIMARY KEY REFERENCES sites(id),org_id TEXT NOT NULL REFERENCES organizations(id),
    revision INTEGER NOT NULL CHECK(revision>0),state TEXT NOT NULL CHECK(state IN ('active','archived')),
    reason TEXT NOT NULL,updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS site_lifecycle_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),origin_site_id TEXT NOT NULL REFERENCES sites(id),
    site_id TEXT NOT NULL REFERENCES sites(id),actor_id TEXT NOT NULL REFERENCES staff(id),request_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),created_at TEXT NOT NULL,PRIMARY KEY(org_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS site_lifecycle_scope BEFORE INSERT ON site_lifecycle WHEN
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) BEGIN SELECT RAISE(ABORT,'Site lifecycle scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_lifecycle_identity BEFORE UPDATE ON site_lifecycle WHEN NEW.site_id<>OLD.site_id OR NEW.org_id<>OLD.org_id
    BEGIN SELECT RAISE(ABORT,'Site lifecycle scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_lifecycle_request_scope BEFORE INSERT ON site_lifecycle_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.actor_id AND org_id=NEW.org_id AND site_id=NEW.origin_site_id) OR
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) BEGIN SELECT RAISE(ABORT,'Site lifecycle scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_lifecycle_frozen_update BEFORE UPDATE ON site_lifecycle_requests BEGIN SELECT RAISE(ABORT,'Site lifecycle receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS site_lifecycle_frozen_delete BEFORE DELETE ON site_lifecycle_requests BEGIN SELECT RAISE(ABORT,'Site lifecycle receipt is immutable'); END;`);
  db.exec(`CREATE TABLE IF NOT EXISTS site_access_controls (
    site_id TEXT PRIMARY KEY REFERENCES sites(id),org_id TEXT NOT NULL REFERENCES organizations(id),
    revision INTEGER NOT NULL CHECK(revision>0),state TEXT NOT NULL CHECK(state IN ('active','paused')),
    reason TEXT NOT NULL,updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS site_access_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),origin_site_id TEXT NOT NULL REFERENCES sites(id),
    site_id TEXT NOT NULL REFERENCES sites(id),actor_id TEXT NOT NULL REFERENCES staff(id),request_json TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),created_at TEXT NOT NULL,PRIMARY KEY(org_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS site_access_scope BEFORE INSERT ON site_access_controls WHEN
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) BEGIN SELECT RAISE(ABORT,'Site access scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_access_identity BEFORE UPDATE ON site_access_controls WHEN
    NEW.site_id<>OLD.site_id OR NEW.org_id<>OLD.org_id BEGIN SELECT RAISE(ABORT,'Site access scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_access_request_scope BEFORE INSERT ON site_access_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.actor_id AND org_id=NEW.org_id AND site_id=NEW.origin_site_id) OR
    NOT EXISTS(SELECT 1 FROM sites WHERE id=NEW.site_id AND org_id=NEW.org_id) BEGIN SELECT RAISE(ABORT,'Site access scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_access_request_frozen_update BEFORE UPDATE ON site_access_requests BEGIN SELECT RAISE(ABORT,'Site access receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS site_access_request_frozen_delete BEFORE DELETE ON site_access_requests BEGIN SELECT RAISE(ABORT,'Site access receipt is immutable'); END;`);
  db.exec(`CREATE TABLE IF NOT EXISTS site_creations (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),origin_site_id TEXT NOT NULL REFERENCES sites(id),
    site_id TEXT NOT NULL UNIQUE REFERENCES sites(id),created_by TEXT NOT NULL REFERENCES staff(id),owner_id TEXT NOT NULL REFERENCES staff(id),
    request_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(org_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS site_creation_scope BEFORE INSERT ON site_creations WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.origin_site_id) OR
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.owner_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Site creation scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS site_creation_frozen_update BEFORE UPDATE ON site_creations BEGIN SELECT RAISE(ABORT,'Site creation receipt is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS site_creation_frozen_delete BEFORE DELETE ON site_creations BEGIN SELECT RAISE(ABORT,'Site creation receipt is immutable'); END;`);
}

export function ensureSiteAdmissionGuards(db) {
  for(const [table,condition] of siteAdmissionTables){
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    for(const operation of ['INSERT','UPDATE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_site_admission_${operation.toLowerCase()}
      BEFORE ${operation} ON ${table} WHEN (${condition}) AND EXISTS(SELECT 1 FROM site_lifecycle l WHERE l.site_id=NEW.site_id AND l.org_id=NEW.org_id AND l.state='archived')
      BEGIN SELECT RAISE(ABORT,'Site archived'); END;`);
  }
}
