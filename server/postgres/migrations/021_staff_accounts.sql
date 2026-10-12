CREATE TABLE staff_accounts (
  id text PRIMARY KEY,credential_staff_id text NOT NULL UNIQUE REFERENCES staff(id),
  active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1 CHECK(revision>=1)
);
CREATE TABLE staff_account_memberships (
  staff_id text PRIMARY KEY,account_id text NOT NULL REFERENCES staff_accounts(id),org_id text NOT NULL,site_id text NOT NULL,
  FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),UNIQUE(account_id,org_id,site_id)
);
CREATE FUNCTION protect_account_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Account membership is immutable'; END $$;
CREATE TRIGGER account_membership_frozen BEFORE UPDATE OR DELETE ON staff_account_memberships
  FOR EACH ROW EXECUTE FUNCTION protect_account_membership();
CREATE FUNCTION protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.credential_staff_id) IS DISTINCT FROM (OLD.id,OLD.credential_staff_id) OR NEW.revision<OLD.revision
    THEN RAISE EXCEPTION 'Account identity is immutable'; END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN NEW.revision=OLD.revision+1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_identity_frozen BEFORE UPDATE ON staff_accounts FOR EACH ROW EXECUTE FUNCTION protect_account_identity();
CREATE FUNCTION revoke_account_access_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_type='staff' AND revoked_at IS NULL
      AND principal_id IN(SELECT staff_id FROM staff_account_memberships WHERE account_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_access_sessions AFTER UPDATE OF active ON staff_accounts FOR EACH ROW EXECUTE FUNCTION revoke_account_access_sessions();
CREATE FUNCTION protect_credential_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.staff_id<>OLD.staff_id THEN RAISE EXCEPTION 'Credential identity is immutable'; END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM staff_account_memberships m JOIN staff_accounts a ON a.id=m.account_id
    WHERE m.staff_id=NEW.staff_id AND a.credential_staff_id<>NEW.staff_id) THEN RAISE EXCEPTION 'Use the account credential identity'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_identity_frozen BEFORE INSERT OR UPDATE ON staff_credentials FOR EACH ROW EXECUTE FUNCTION protect_credential_identity();
CREATE FUNCTION link_credential_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO staff_accounts(id,credential_staff_id) VALUES(NEW.staff_id,NEW.staff_id) ON CONFLICT(credential_staff_id) DO NOTHING;
  INSERT INTO staff_account_memberships SELECT s.id,a.id,s.org_id,s.site_id FROM staff s JOIN staff_accounts a ON a.credential_staff_id=s.id
    WHERE s.id=NEW.staff_id ON CONFLICT(staff_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_account_link AFTER INSERT ON staff_credentials FOR EACH ROW EXECUTE FUNCTION link_credential_account();
INSERT INTO staff_accounts(id,credential_staff_id) SELECT staff_id,staff_id FROM staff_credentials;
INSERT INTO staff_account_memberships SELECT s.id,a.id,s.org_id,s.site_id FROM staff_accounts a JOIN staff s ON s.id=a.credential_staff_id;

-- Older links did not bind account-access revisions; do not reuse them across this upgrade.
UPDATE staff_recovery_tokens SET revoked_at=clock_timestamp() WHERE used_at IS NULL AND revoked_at IS NULL;
UPDATE staff_recovery_mail SET state='expired',payload=NULL,lease_token=NULL,lease_until=NULL WHERE state IN ('queued','processing');
