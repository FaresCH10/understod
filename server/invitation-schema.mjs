export function ensureInvitationSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_invitations (
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','administrator','supervisor','auditor')),
    email_hash TEXT NOT NULL,email_hint TEXT NOT NULL,email_payload TEXT,issuer_id TEXT NOT NULL REFERENCES staff(id),issuer_revision INTEGER NOT NULL,issuer_account_revision INTEGER NOT NULL CHECK(issuer_account_revision>=1),
    state TEXT NOT NULL CHECK(state IN ('pending','accepted','cancelled','expired')),revision INTEGER NOT NULL CHECK(revision>=1),
    created_at TEXT NOT NULL,expires_at TEXT NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS staff_invitation_pending_email ON staff_invitations(org_id,site_id,email_hash) WHERE state='pending';
  CREATE INDEX IF NOT EXISTS staff_invitation_scope ON staff_invitations(org_id,site_id,created_at,id);
  CREATE TRIGGER IF NOT EXISTS staff_invitation_scope BEFORE INSERT ON staff_invitations WHEN
    NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.issuer_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_invitation_frozen BEFORE UPDATE ON staff_invitations WHEN
    NEW.id<>OLD.id OR NEW.org_id<>OLD.org_id OR NEW.site_id<>OLD.site_id OR NEW.name<>OLD.name OR NEW.role<>OLD.role
    OR NEW.email_hash<>OLD.email_hash OR NEW.email_hint<>OLD.email_hint OR NEW.created_at<>OLD.created_at
    OR NEW.revision<OLD.revision OR OLD.state<>'pending'
    OR (NEW.email_payload IS NOT OLD.email_payload AND NEW.email_payload IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.issuer_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Invitation identity is immutable'); END;
  CREATE TABLE IF NOT EXISTS staff_invitation_tokens (
    token_hash TEXT PRIMARY KEY,invitation_id TEXT NOT NULL REFERENCES staff_invitations(id),generation INTEGER NOT NULL CHECK(generation>=1),
    expires_at TEXT NOT NULL,used_at TEXT,revoked_at TEXT,UNIQUE(invitation_id,generation)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS staff_invitation_mail (
    id TEXT PRIMARY KEY,invitation_id TEXT NOT NULL REFERENCES staff_invitations(id),generation INTEGER NOT NULL CHECK(generation>=1),payload TEXT,
    created_at TEXT NOT NULL,expires_at TEXT NOT NULL,next_at TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','processing','sent','ignored','failed','expired')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease_token TEXT,lease_until TEXT,provider_id TEXT,
    UNIQUE(invitation_id,generation)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS staff_invitation_mail_due ON staff_invitation_mail(state,next_at,lease_until);
  CREATE TRIGGER IF NOT EXISTS staff_invitation_token_generation BEFORE INSERT ON staff_invitation_tokens WHEN
    NOT EXISTS(SELECT 1 FROM staff_invitations WHERE id=NEW.invitation_id AND revision=NEW.generation AND expires_at=NEW.expires_at AND state='pending')
    BEGIN SELECT RAISE(ABORT,'Invitation generation mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_invitation_mail_generation BEFORE INSERT ON staff_invitation_mail WHEN
    NOT EXISTS(SELECT 1 FROM staff_invitations WHERE id=NEW.invitation_id AND revision=NEW.generation AND expires_at=NEW.expires_at AND state='pending')
    BEGIN SELECT RAISE(ABORT,'Invitation generation mismatch'); END;
  CREATE TRIGGER IF NOT EXISTS staff_invitation_mail_frozen BEFORE UPDATE ON staff_invitation_mail WHEN
    NEW.id<>OLD.id OR NEW.invitation_id<>OLD.invitation_id OR NEW.generation<>OLD.generation OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at
    OR NEW.attempts<OLD.attempts OR (OLD.state NOT IN ('queued','processing') AND NEW.state<>OLD.state)
    BEGIN SELECT RAISE(ABORT,'Invitation mail identity is immutable'); END;
  CREATE TABLE IF NOT EXISTS staff_invitation_requests (
    request_id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),
    invitation_id TEXT NOT NULL REFERENCES staff_invitations(id),action TEXT NOT NULL CHECK(action IN ('issue','resend','cancel')),
    request_json TEXT NOT NULL,result_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES staff(id),created_at TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS staff_invitation_request_scope BEFORE INSERT ON staff_invitation_requests WHEN
    NOT EXISTS(SELECT 1 FROM staff_invitations WHERE id=NEW.invitation_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff WHERE id=NEW.created_by AND org_id=NEW.org_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;
  CREATE TABLE IF NOT EXISTS staff_invitation_acceptances (
    token_hash TEXT PRIMARY KEY REFERENCES staff_invitation_tokens(token_hash),request_id TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES staff_accounts(id),staff_id TEXT NOT NULL REFERENCES staff(id),
    org_id TEXT NOT NULL REFERENCES organizations(id),site_id TEXT NOT NULL REFERENCES sites(id),kind TEXT NOT NULL CHECK(kind IN ('signup','existing')),created_at TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS staff_invitation_acceptance_scope BEFORE INSERT ON staff_invitation_acceptances WHEN
    NOT EXISTS(SELECT 1 FROM staff_account_memberships WHERE staff_id=NEW.staff_id AND account_id=NEW.account_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff_invitation_tokens t JOIN staff_invitations i ON i.id=t.invitation_id WHERE t.token_hash=NEW.token_hash AND i.org_id=NEW.org_id AND i.site_id=NEW.site_id
      AND i.state='pending' AND i.revision=t.generation AND t.used_at IS NULL AND t.revoked_at IS NULL)
    BEGIN SELECT RAISE(ABORT,'Scope mismatch'); END;`);
  for(const table of ['staff_invitation_requests','staff_invitation_acceptances']) for(const action of ['UPDATE','DELETE']) db.exec(`
    CREATE TRIGGER IF NOT EXISTS ${table}_frozen_${action.toLowerCase()} BEFORE ${action} ON ${table}
      BEGIN SELECT RAISE(ABORT,'Invitation receipt is immutable'); END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS staff_invitation_token_frozen BEFORE UPDATE ON staff_invitation_tokens WHEN
    NEW.token_hash<>OLD.token_hash OR NEW.invitation_id<>OLD.invitation_id OR NEW.generation<>OLD.generation OR NEW.expires_at<>OLD.expires_at
    OR (OLD.used_at IS NOT NULL AND NEW.used_at IS NOT OLD.used_at) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
    BEGIN SELECT RAISE(ABORT,'Invitation token is immutable'); END;`);
}
