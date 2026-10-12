CREATE OR REPLACE FUNCTION protect_export_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.publication_id,NEW.requested_by,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.publication_id,OLD.requested_by,OLD.created_at,OLD.expires_at)
    OR (NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json AND NOT
      (NEW.status='expired' AND NEW.snapshot_json IS NULL AND
        (OLD.expires_at<=clock_timestamp() OR EXISTS(
          SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id
          WHERE a.publication_id=OLD.publication_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id AND OLD.created_at<=d.created_at)))) THEN
    RAISE EXCEPTION 'Export request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
