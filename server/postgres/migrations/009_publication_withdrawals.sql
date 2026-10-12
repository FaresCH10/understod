CREATE TABLE publication_withdrawals (
  request_id text NOT NULL,
  org_id text NOT NULL,
  site_id text NOT NULL,
  publication_id text NOT NULL UNIQUE,
  version integer NOT NULL CHECK(version>0),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
  withdrawn_by text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY(withdrawn_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_publication_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Withdrawal is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER publication_withdrawals_immutable BEFORE UPDATE OR DELETE ON publication_withdrawals
  FOR EACH ROW EXECUTE FUNCTION protect_publication_withdrawal();
CREATE FUNCTION check_withdrawal_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM publications p WHERE p.id=NEW.publication_id AND p.org_id=NEW.org_id
    AND p.site_id=NEW.site_id AND p.version=NEW.version) THEN
    RAISE EXCEPTION 'Scope mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER publication_withdrawal_scope BEFORE INSERT ON publication_withdrawals
  FOR EACH ROW EXECUTE FUNCTION check_withdrawal_version();
