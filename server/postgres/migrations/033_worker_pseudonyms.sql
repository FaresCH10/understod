CREATE TABLE worker_deletion_pseudonyms (
  request_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,worker_id text NOT NULL UNIQUE,
  code_hash text NOT NULL CHECK(code_hash ~ '^[0-9a-f]{64}$'),pseudonym text NOT NULL UNIQUE,completed_at timestamptz NOT NULL,
  UNIQUE(org_id,code_hash),
  FOREIGN KEY(request_id,org_id,site_id,worker_id) REFERENCES worker_deletion_requests(id,org_id,site_id,worker_id),
  FOREIGN KEY(request_id) REFERENCES worker_deletion_redactions(request_id)
);
CREATE TRIGGER worker_pseudonyms_immutable BEFORE UPDATE OR DELETE ON worker_deletion_pseudonyms
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

CREATE FUNCTION check_worker_pseudonym_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM workers w WHERE w.id=NEW.worker_id AND NOT w.active
    AND (encode(sha256(convert_to(w.code,'UTF8')),'hex')=NEW.code_hash OR w.code=NEW.pseudonym)) THEN
    RAISE EXCEPTION 'Pseudonym scope mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER worker_pseudonym_scope BEFORE INSERT ON worker_deletion_pseudonyms
  FOR EACH ROW EXECUTE FUNCTION check_worker_pseudonym_scope();

CREATE FUNCTION guard_deleted_worker_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=OLD.id) AND
    ((NEW.id,NEW.org_id,NEW.site_id,NEW.language) IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.language)
      OR (NEW.code IS DISTINCT FROM OLD.code AND NOT EXISTS(SELECT 1 FROM worker_deletion_pseudonyms p WHERE p.worker_id=OLD.id AND p.pseudonym=NEW.code))) THEN
    RAISE EXCEPTION 'Worker deletion pending' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM worker_deletion_pseudonyms p WHERE p.org_id=NEW.org_id AND p.code_hash=encode(sha256(convert_to(NEW.code,'UTF8')),'hex')) THEN
    RAISE EXCEPTION 'Worker code unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER deleted_worker_identity_fence BEFORE INSERT OR UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION guard_deleted_worker_identity();

CREATE OR REPLACE FUNCTION protect_export_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.publication_id,NEW.requested_by,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.publication_id,OLD.requested_by,OLD.created_at,OLD.expires_at)
    OR (NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json AND NOT
      (NEW.status='expired' AND NEW.snapshot_json IS NULL AND (OLD.expires_at<=clock_timestamp() OR EXISTS(
        SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id
        WHERE a.publication_id=OLD.publication_id AND d.org_id=OLD.org_id AND d.site_id=OLD.site_id
          AND (OLD.created_at<=d.created_at OR NOT EXISTS(SELECT 1 FROM worker_deletion_pseudonyms p WHERE p.request_id=d.id)))))) THEN
    RAISE EXCEPTION 'Export request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
