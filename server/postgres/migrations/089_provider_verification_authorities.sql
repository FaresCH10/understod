CREATE TABLE provider_verification_authorities (
  request_id text PRIMARY KEY REFERENCES provider_verifications(request_id),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL
);

-- Historical rows without a live approving session remain closed.
INSERT INTO provider_verification_authorities(request_id,expires_at,revoked)
SELECT v.request_id,LEAST(v.deadline_at,COALESCE(s.expires_at,v.deadline_at)),
  v.state<>'pending' OR s.token_hash IS NULL OR s.revoked_at IS NOT NULL
  OR s.expires_at<=clock_timestamp() OR NOT o.active OR o.revision<>s.operator_revision OR s.operator_id<>v.operator_id
FROM provider_verifications v LEFT JOIN operator_sessions s ON s.token_hash=v.session_hash
LEFT JOIN platform_operators o ON o.id=s.operator_id;

CREATE FUNCTION protect_verification_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.request_id,NEW.expires_at) IS DISTINCT FROM (OLD.request_id,OLD.expires_at)
    OR OLD.revoked OR NOT NEW.revoked THEN
    RAISE EXCEPTION 'Provider verification authority is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_authority_frozen BEFORE UPDATE OR DELETE ON provider_verification_authorities
FOR EACH ROW EXECUTE FUNCTION protect_verification_authority();

CREATE FUNCTION capture_verification_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expiry timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':verification-authority',0));
  IF TG_OP='INSERT' THEN
    SELECT LEAST(NEW.deadline_at,s.expires_at) INTO expiry FROM operator_sessions s
    JOIN platform_operators o ON o.id=s.operator_id
    WHERE s.token_hash=NEW.session_hash AND s.operator_id=NEW.operator_id AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND o.active AND o.revision=s.operator_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider verification authority unavailable'; END IF;
    INSERT INTO provider_verification_authorities(request_id,expires_at,revoked)
    VALUES(NEW.request_id,expiry,NEW.state<>'pending');
  ELSIF NEW.state<>'pending' THEN
    UPDATE provider_verification_authorities SET revoked=true WHERE request_id=NEW.request_id AND NOT revoked;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_authority_capture AFTER INSERT OR UPDATE ON provider_verifications
FOR EACH ROW EXECUTE FUNCTION capture_verification_authority();

CREATE FUNCTION revoke_verification_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='operator_sessions' THEN
    IF TG_OP='UPDATE' AND NEW.revoked_at IS NULL AND
      (NEW.token_hash,NEW.operator_id,NEW.operator_revision,NEW.expires_at)
      IS NOT DISTINCT FROM (OLD.token_hash,OLD.operator_id,OLD.operator_revision,OLD.expires_at) THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':verification-authority',0));
    UPDATE provider_verification_authorities a SET revoked=true FROM provider_verifications v
      WHERE a.request_id=v.request_id AND v.session_hash=OLD.token_hash AND NOT a.revoked;
  ELSE
    IF NEW.active AND (NEW.revision,NEW.password_salt,NEW.password_hash)
      IS NOT DISTINCT FROM (OLD.revision,OLD.password_salt,OLD.password_hash) THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':verification-authority',0));
    UPDATE provider_verification_authorities a SET revoked=true FROM provider_verifications v
      WHERE a.request_id=v.request_id AND v.operator_id=OLD.id AND NOT a.revoked;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER verification_authority_session AFTER UPDATE OR DELETE ON operator_sessions
FOR EACH ROW EXECUTE FUNCTION revoke_verification_authority();
CREATE TRIGGER verification_authority_operator AFTER UPDATE ON platform_operators
FOR EACH ROW EXECUTE FUNCTION revoke_verification_authority();
