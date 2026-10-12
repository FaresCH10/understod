ALTER TABLE staff DROP CONSTRAINT staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK(role IN ('owner','administrator','supervisor','auditor'));
CREATE TABLE staff_access_revisions (
  staff_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,revision integer NOT NULL CHECK(revision>=2),
  FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TABLE staff_access_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,staff_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('role','revoke','restore')),request_json jsonb NOT NULL,result_json jsonb NOT NULL,
  created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,site_id,request_id),
  FOREIGN KEY(staff_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_staff_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id) IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id) THEN RAISE EXCEPTION 'Staff scope is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_identity_frozen BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION protect_staff_scope();
CREATE FUNCTION bump_staff_access_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.role,NEW.active) IS DISTINCT FROM (OLD.role,OLD.active) THEN
    INSERT INTO staff_access_revisions VALUES(NEW.id,NEW.org_id,NEW.site_id,2)
    ON CONFLICT(staff_id) DO UPDATE SET revision=staff_access_revisions.revision+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_access_revision AFTER UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION bump_staff_access_revision();
CREATE FUNCTION protect_staff_access_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Staff access receipt is immutable'; END $$;
CREATE TRIGGER staff_access_receipt_frozen BEFORE UPDATE OR DELETE ON staff_access_requests FOR EACH ROW EXECUTE FUNCTION protect_staff_access_receipt();
