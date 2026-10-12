ALTER TABLE worker_imports ADD COLUMN filename_hash text CHECK(filename_hash IS NULL OR filename_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION protect_import_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  deletion_match boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN workers w ON w.id=d.worker_id
    WHERE d.org_id=OLD.org_id AND (strpos(OLD.filename,w.code)>0 OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(COALESCE(OLD.rows_json,'[]'::jsonb)) entry WHERE entry->>'workerId'=w.code))) INTO deletion_match;
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.requested_by,NEW.sha256,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.requested_by,OLD.sha256,OLD.created_at,OLD.expires_at)
    OR ((NEW.filename,NEW.filename_hash) IS DISTINCT FROM (OLD.filename,OLD.filename_hash) AND NOT (
      OLD.filename_hash IS NULL AND NEW.filename='[Deleted].csv' AND NEW.filename_hash IS NOT NULL
      AND NEW.status='expired' AND NEW.rows_json IS NULL AND NEW.errors_json IS NULL
      AND NEW.imported_count IS NOT DISTINCT FROM OLD.imported_count AND deletion_match))
    OR (OLD.filename_hash IS NOT NULL AND (NEW.status<>'expired' OR NEW.rows_json IS NOT NULL
      OR NEW.errors_json IS NOT NULL OR NEW.imported_count IS DISTINCT FROM OLD.imported_count))
    OR (NEW.rows_json IS DISTINCT FROM OLD.rows_json AND NOT
      (NEW.status='expired' AND NEW.rows_json IS NULL AND (OLD.expires_at<=clock_timestamp() OR deletion_match))) THEN
    RAISE EXCEPTION 'Import request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
