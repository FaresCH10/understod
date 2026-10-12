CREATE TABLE staff_recovery_mail (
  id text PRIMARY KEY,purpose text NOT NULL CHECK(purpose IN ('reset','notice')),
  email_hash text NOT NULL CHECK(email_hash ~ '^[a-f0-9]{64}$'),payload text CHECK(length(payload)<=12000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL CHECK(state IN ('queued','processing','sent','ignored','failed','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  lease_token text,lease_until timestamptz,provider_id text,
  CHECK((state='processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state<>'processing' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK(state NOT IN ('sent','ignored','failed','expired') OR payload IS NULL)
);
CREATE INDEX staff_recovery_mail_due ON staff_recovery_mail(state,next_at,lease_until);
CREATE TABLE staff_recovery_tokens (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  mail_id text NOT NULL UNIQUE REFERENCES staff_recovery_mail(id),
  staff_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,
  credential_hash text NOT NULL CHECK(credential_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,used_at timestamptz,revoked_at timestamptz,
  FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX staff_recovery_tokens_staff ON staff_recovery_tokens(staff_id);
CREATE FUNCTION protect_staff_recovery_token() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.token_hash,NEW.mail_id,NEW.staff_id,NEW.org_id,NEW.site_id,NEW.credential_hash,NEW.expires_at)
    IS DISTINCT FROM (OLD.token_hash,OLD.mail_id,OLD.staff_id,OLD.org_id,OLD.site_id,OLD.credential_hash,OLD.expires_at)
    OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    THEN RAISE EXCEPTION 'Recovery token identity and consumption are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_recovery_token_frozen BEFORE UPDATE ON staff_recovery_tokens
  FOR EACH ROW EXECUTE FUNCTION protect_staff_recovery_token();
