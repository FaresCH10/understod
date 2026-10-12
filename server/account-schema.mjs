export function ensureAccountSchema(db) {
  const upgrading=!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_accounts'").get();
  db.exec('SAVEPOINT staff_account_upgrade');
  try {db.exec(`CREATE TABLE IF NOT EXISTS staff_accounts (
    id TEXT PRIMARY KEY,credential_staff_id TEXT NOT NULL UNIQUE REFERENCES staff(id),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS staff_account_memberships (
    staff_id TEXT PRIMARY KEY REFERENCES staff(id),account_id TEXT NOT NULL REFERENCES staff_accounts(id),
    org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    UNIQUE(account_id,org_id,site_id)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS staff_account_membership_scope BEFORE INSERT ON staff_account_memberships WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.staff_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_account_membership_frozen_update BEFORE UPDATE ON staff_account_memberships
    BEGIN SELECT RAISE(ABORT,'Account membership is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS staff_account_membership_frozen_delete BEFORE DELETE ON staff_account_memberships
    BEGIN SELECT RAISE(ABORT,'Account membership is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS staff_account_identity BEFORE UPDATE ON staff_accounts WHEN
    NEW.id<>OLD.id OR NEW.credential_staff_id<>OLD.credential_staff_id OR NEW.revision<OLD.revision
    BEGIN SELECT RAISE(ABORT,'Account identity is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS staff_account_access_revision AFTER UPDATE OF active ON staff_accounts WHEN NEW.active<>OLD.active
    BEGIN UPDATE staff_accounts SET revision=revision+1 WHERE id=NEW.id; END;
  CREATE TRIGGER IF NOT EXISTS staff_account_access_sessions AFTER UPDATE OF active ON staff_accounts WHEN NEW.active<>OLD.active
    BEGIN UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE principal_type='staff' AND revoked_at IS NULL
      AND principal_id IN(SELECT staff_id FROM staff_account_memberships WHERE account_id=NEW.id); END;
  CREATE TRIGGER IF NOT EXISTS staff_credential_identity BEFORE UPDATE OF staff_id ON staff_credentials WHEN NEW.staff_id<>OLD.staff_id
    BEGIN SELECT RAISE(ABORT,'Credential identity is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS staff_credential_anchor BEFORE INSERT ON staff_credentials WHEN
    EXISTS(SELECT 1 FROM staff_account_memberships m JOIN staff_accounts a ON a.id=m.account_id
      WHERE m.staff_id=NEW.staff_id AND a.credential_staff_id<>NEW.staff_id)
    BEGIN SELECT RAISE(ABORT,'Use the account credential identity'); END;
  CREATE TRIGGER IF NOT EXISTS staff_credential_account AFTER INSERT ON staff_credentials
    BEGIN INSERT INTO staff_accounts(id,credential_staff_id) VALUES(NEW.staff_id,NEW.staff_id) ON CONFLICT(credential_staff_id) DO NOTHING;
      INSERT INTO staff_account_memberships SELECT s.id,a.id,s.org_id,s.site_id FROM staff s JOIN staff_accounts a ON a.credential_staff_id=s.id
      WHERE s.id=NEW.staff_id ON CONFLICT(staff_id) DO NOTHING; END;
  INSERT INTO staff_accounts(id,credential_staff_id) SELECT staff_id,staff_id FROM staff_credentials WHERE true ON CONFLICT(credential_staff_id) DO NOTHING;
  INSERT INTO staff_account_memberships SELECT s.id,a.id,s.org_id,s.site_id FROM staff_accounts a JOIN staff s ON s.id=a.credential_staff_id
    WHERE true ON CONFLICT(staff_id) DO NOTHING;`);
    if(upgrading && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_recovery_tokens'").get()) db.exec(`
      UPDATE staff_recovery_tokens SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE used_at IS NULL AND revoked_at IS NULL;
      UPDATE staff_recovery_mail SET state='expired',payload=NULL,lease_token=NULL,lease_until=NULL WHERE state IN ('queued','processing');`);
    db.exec('RELEASE staff_account_upgrade');
  }catch(error){db.exec('ROLLBACK TO staff_account_upgrade; RELEASE staff_account_upgrade');throw error;}
}

export function accountIdentity(db,staffId) {
  return db.prepare(`SELECT a.id AS account_id,a.credential_staff_id,a.active AS account_active,a.revision AS account_revision
    FROM staff_account_memberships m JOIN staff_accounts a ON a.id=m.account_id WHERE m.staff_id=?`).get(staffId);
}
