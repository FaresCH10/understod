CREATE OR REPLACE FUNCTION protect_directory_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id
    AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id
    AND NEW.worker_id IS NOT DISTINCT FROM OLD.worker_id AND NEW.crew_id IS NOT DISTINCT FROM OLD.crew_id
    AND NEW.requested_by IS NOT DISTINCT FROM OLD.requested_by AND NEW.occurred_at IS NOT DISTINCT FROM OLD.occurred_at
    AND NEW.expected_label='[Deleted]' AND EXISTS(SELECT 1 FROM worker_deletion_requests d
      WHERE d.worker_id=OLD.worker_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Reactivation receipt is immutable' USING ERRCODE='23514';
END;
$$;

CREATE FUNCTION reject_deleted_worker_reactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=NEW.worker_id) THEN
    RAISE EXCEPTION 'Worker deletion pending' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER directory_reactivation_deletion_fence BEFORE INSERT ON directory_reactivations
  FOR EACH ROW EXECUTE FUNCTION reject_deleted_worker_reactivation();
