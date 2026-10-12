CREATE OR REPLACE FUNCTION protect_import_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.requested_by,NEW.filename,NEW.sha256,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.requested_by,OLD.filename,OLD.sha256,OLD.created_at,OLD.expires_at)
    OR (NEW.rows_json IS DISTINCT FROM OLD.rows_json AND NOT
      (NEW.status='expired' AND NEW.rows_json IS NULL AND (OLD.expires_at<=clock_timestamp() OR EXISTS(
        SELECT 1 FROM worker_deletion_requests d JOIN workers w ON w.id=d.worker_id,
          jsonb_array_elements(COALESCE(OLD.rows_json,'[]'::jsonb)) entry
        WHERE d.org_id=OLD.org_id AND OLD.created_at<=d.created_at AND entry->>'workerId'=w.code)))) THEN
    RAISE EXCEPTION 'Import request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
