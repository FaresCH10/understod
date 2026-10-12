CREATE TABLE worker_deletion_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,worker_id text NOT NULL UNIQUE,
  actor_id text NOT NULL,fingerprint text NOT NULL CHECK(length(fingerprint)=64),
  reason text NOT NULL CHECK(reason IN ('worker_request','customer_policy')),created_at timestamptz NOT NULL,
  FOREIGN KEY(worker_id,org_id,site_id) REFERENCES workers(id,org_id,site_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER worker_deletion_immutable BEFORE UPDATE OR DELETE ON worker_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION validate_deleted_worker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM workers WHERE id=NEW.worker_id AND org_id=NEW.org_id AND site_id=NEW.site_id AND NOT active) THEN
    RAISE EXCEPTION 'Deletion scope mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER worker_deletion_scope BEFORE INSERT ON worker_deletion_requests FOR EACH ROW EXECUTE FUNCTION validate_deleted_worker();
CREATE FUNCTION fence_deleted_worker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=OLD.id) THEN
    RAISE EXCEPTION 'Worker deletion pending' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER worker_deletion_access_fence BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION fence_deleted_worker();
