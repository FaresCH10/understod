CREATE TABLE staff_invitations (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,name text NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','administrator','supervisor','auditor')),
  email_hash text NOT NULL,email_hint text NOT NULL,email_payload text,
  issuer_id text NOT NULL,issuer_revision integer NOT NULL CHECK(issuer_revision>=1),
  issuer_account_revision integer NOT NULL CHECK(issuer_account_revision>=1),
  state text NOT NULL CHECK(state IN ('pending','accepted','cancelled','expired')),
  revision integer NOT NULL CHECK(revision>=1),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  FOREIGN KEY(org_id,site_id) REFERENCES sites(org_id,id),
  FOREIGN KEY(issuer_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),UNIQUE(id,org_id,site_id)
);
CREATE UNIQUE INDEX staff_invitation_pending_email ON staff_invitations(org_id,site_id,email_hash) WHERE state='pending';
CREATE INDEX staff_invitation_scope ON staff_invitations(org_id,site_id,created_at,id);
CREATE FUNCTION protect_invitation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.name,NEW.role,NEW.email_hash,NEW.email_hint,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.name,OLD.role,OLD.email_hash,OLD.email_hint,OLD.created_at)
    OR NEW.revision<OLD.revision OR OLD.state<>'pending'
    OR (NEW.email_payload IS DISTINCT FROM OLD.email_payload AND NEW.email_payload IS NOT NULL)
    THEN RAISE EXCEPTION 'Invitation identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_invitation_frozen BEFORE UPDATE ON staff_invitations FOR EACH ROW EXECUTE FUNCTION protect_invitation_identity();
CREATE TABLE staff_invitation_tokens (
  token_hash text PRIMARY KEY,invitation_id text NOT NULL REFERENCES staff_invitations(id),generation integer NOT NULL CHECK(generation>=1),
  expires_at timestamptz NOT NULL,used_at timestamptz,revoked_at timestamptz,UNIQUE(invitation_id,generation)
);
CREATE FUNCTION protect_invitation_token() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.token_hash,NEW.invitation_id,NEW.generation,NEW.expires_at) IS DISTINCT FROM (OLD.token_hash,OLD.invitation_id,OLD.generation,OLD.expires_at)
    OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    THEN RAISE EXCEPTION 'Invitation token is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_invitation_token_frozen BEFORE UPDATE ON staff_invitation_tokens FOR EACH ROW EXECUTE FUNCTION protect_invitation_token();
CREATE TABLE staff_invitation_mail (
  id text PRIMARY KEY,invitation_id text NOT NULL REFERENCES staff_invitations(id),generation integer NOT NULL CHECK(generation>=1),payload text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL CHECK(state IN ('queued','processing','sent','ignored','failed','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease_token text,lease_until timestamptz,provider_id text,
  UNIQUE(invitation_id,generation)
);
CREATE INDEX staff_invitation_mail_due ON staff_invitation_mail(state,next_at,lease_until);
CREATE FUNCTION protect_invitation_mail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.invitation_id,NEW.generation,NEW.created_at,NEW.expires_at) IS DISTINCT FROM (OLD.id,OLD.invitation_id,OLD.generation,OLD.created_at,OLD.expires_at)
    OR NEW.attempts<OLD.attempts OR (OLD.state NOT IN ('queued','processing') AND NEW.state<>OLD.state)
    THEN RAISE EXCEPTION 'Invitation mail identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_invitation_mail_frozen BEFORE UPDATE ON staff_invitation_mail FOR EACH ROW EXECUTE FUNCTION protect_invitation_mail();
CREATE TABLE staff_invitation_requests (
  request_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,invitation_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('issue','resend','cancel')),request_json jsonb NOT NULL,result_json jsonb NOT NULL,
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(invitation_id,org_id,site_id) REFERENCES staff_invitations(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TABLE staff_invitation_acceptances (
  token_hash text PRIMARY KEY REFERENCES staff_invitation_tokens(token_hash),request_id text NOT NULL UNIQUE,
  account_id text NOT NULL REFERENCES staff_accounts(id),staff_id text NOT NULL REFERENCES staff(id),
  org_id text NOT NULL,site_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('signup','existing')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION check_invitation_acceptance_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM staff_account_memberships WHERE staff_id=NEW.staff_id AND account_id=NEW.account_id AND org_id=NEW.org_id AND site_id=NEW.site_id)
    OR NOT EXISTS(SELECT 1 FROM staff_invitation_tokens t JOIN staff_invitations i ON i.id=t.invitation_id WHERE t.token_hash=NEW.token_hash AND i.org_id=NEW.org_id AND i.site_id=NEW.site_id)
    THEN RAISE EXCEPTION 'Scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_invitation_acceptance_scope BEFORE INSERT ON staff_invitation_acceptances FOR EACH ROW EXECUTE FUNCTION check_invitation_acceptance_scope();
CREATE FUNCTION protect_invitation_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invitation receipt is immutable'; END $$;
CREATE TRIGGER staff_invitation_request_frozen BEFORE UPDATE OR DELETE ON staff_invitation_requests FOR EACH ROW EXECUTE FUNCTION protect_invitation_receipt();
CREATE TRIGGER staff_invitation_acceptance_frozen BEFORE UPDATE OR DELETE ON staff_invitation_acceptances FOR EACH ROW EXECUTE FUNCTION protect_invitation_receipt();
