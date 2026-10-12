import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

// SQLite cannot widen a CHECK constraint with ALTER COLUMN. Preserve all dependent schema and rows.
export function upgradeStaffRoles(db,path) {
  const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='staff'").get()?.sql;
  if(!sql || sql.includes("'administrator'")) return;
  const columns=db.prepare('PRAGMA table_info(staff)').all().map(c=>c.name);
  if(JSON.stringify(columns)!==JSON.stringify(['id','org_id','site_id','name','role','active']) || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Staff schema upgrade requires a verified legacy database');
  if(path!==':memory:') db.prepare('VACUUM INTO ?').run(`${resolve(path)}.staff-roles-${randomUUID()}.sqlite`);
  const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
  const views=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='view'").all();
  const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='staff' AND sql IS NOT NULL").all();
  const quoted=name=>'"'+name.replaceAll('"','""')+'"';
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
  try {
    for(const {name} of triggers) db.exec(`DROP TRIGGER ${quoted(name)}`);
    for(const {name} of views) db.exec(`DROP VIEW ${quoted(name)}`);
    db.exec(`CREATE TABLE staff_role_upgrade (
      id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','administrator','supervisor','auditor')),active INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    INSERT INTO staff_role_upgrade SELECT id,org_id,site_id,name,role,active FROM staff;
    DROP TABLE staff; ALTER TABLE staff_role_upgrade RENAME TO staff;`);
    for(const {sql} of [...indexes,...views,...triggers]) db.exec(sql);
    if(db.prepare('PRAGMA foreign_key_check').all().length || db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('Staff schema upgrade integrity failed');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  finally {db.exec('PRAGMA foreign_keys=ON');}
}

export function ensureStaffSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_access_revisions (
    staff_id TEXT PRIMARY KEY REFERENCES staff(id),org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    revision INTEGER NOT NULL CHECK(revision>=2)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS staff_access_requests (
    request_id TEXT NOT NULL,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),action TEXT NOT NULL CHECK(action IN ('role','revoke','restore')),
    request_json TEXT NOT NULL,result_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL,
    PRIMARY KEY(org_id,site_id,request_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS staff_identity_frozen BEFORE UPDATE OF id,org_id,site_id ON staff
    WHEN NEW.id<>OLD.id OR NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id BEGIN SELECT RAISE(ABORT,'Staff scope is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS staff_access_revision AFTER UPDATE OF role,active ON staff WHEN NEW.role<>OLD.role OR NEW.active<>OLD.active
    BEGIN INSERT INTO staff_access_revisions VALUES(NEW.id,NEW.org_id,NEW.site_id,2)
    ON CONFLICT(staff_id) DO UPDATE SET revision=revision+1; END;
  CREATE TRIGGER IF NOT EXISTS staff_access_revisions_scope BEFORE INSERT ON staff_access_revisions WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.staff_id AND org_id=NEW.org_id AND site_id=NEW.site_id) BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_access_revisions_identity BEFORE UPDATE ON staff_access_revisions WHEN NEW.staff_id<>OLD.staff_id OR NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_access_requests_scope BEFORE INSERT ON staff_access_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.staff_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
  for(const action of ['UPDATE','DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS staff_access_requests_frozen_${action.toLowerCase()} BEFORE ${action} ON staff_access_requests BEGIN SELECT RAISE(ABORT,'Staff access receipt is immutable'); END;`);
}
