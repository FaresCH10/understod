-- Add persisted export/import workflows without rewriting applied migrations.
CREATE TABLE report_exports (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  publication_id text NOT NULL,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  status text NOT NULL CHECK (status IN ('queued','processing','ready','failed','expired')),
  snapshot_json jsonb CHECK (snapshot_json IS NULL OR (jsonb_typeof(snapshot_json)='array' AND octet_length(snapshot_json::text)<=2000000)),
  csv text CHECK (csv IS NULL OR octet_length(csv)<=2000000),
  checksum text CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_token text,
  lease_until timestamptz,
  error text,
  FOREIGN KEY (publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY (requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  CHECK (status!='ready' OR (snapshot_json IS NOT NULL AND csv IS NOT NULL AND checksum IS NOT NULL)),
  CHECK (status!='expired' OR (snapshot_json IS NULL AND csv IS NULL AND checksum IS NULL))
);

CREATE FUNCTION protect_export_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.publication_id,NEW.requested_by,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM
     (OLD.id,OLD.org_id,OLD.site_id,OLD.publication_id,OLD.requested_by,OLD.created_at,OLD.expires_at)
    OR (NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json AND NOT
       (NEW.status='expired' AND NEW.snapshot_json IS NULL AND OLD.expires_at<=clock_timestamp())) THEN
    RAISE EXCEPTION 'Export request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER report_exports_request_frozen BEFORE UPDATE ON report_exports
  FOR EACH ROW EXECUTE FUNCTION protect_export_request();
CREATE INDEX idx_report_exports_scope ON report_exports(org_id,site_id,created_at DESC,id);
CREATE INDEX idx_report_exports_jobs ON report_exports(status,lease_until,created_at);

CREATE TABLE worker_imports (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  site_id text NOT NULL,
  requested_by text NOT NULL,
  filename text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('validated','imported','expired')),
  rows_json jsonb CHECK (rows_json IS NULL OR (jsonb_typeof(rows_json)='array' AND jsonb_array_length(rows_json)<=1000)),
  errors_json jsonb CHECK (errors_json IS NULL OR jsonb_typeof(errors_json)='array'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count BETWEEN 0 AND 1000),
  FOREIGN KEY (requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  CHECK (status='expired' OR (rows_json IS NOT NULL AND errors_json IS NOT NULL)),
  CHECK (status!='expired' OR (rows_json IS NULL AND errors_json IS NULL))
);

CREATE FUNCTION protect_import_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.requested_by,NEW.filename,NEW.sha256,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM
     (OLD.id,OLD.org_id,OLD.site_id,OLD.requested_by,OLD.filename,OLD.sha256,OLD.created_at,OLD.expires_at)
    OR (NEW.rows_json IS DISTINCT FROM OLD.rows_json AND NOT
       (NEW.status='expired' AND NEW.rows_json IS NULL AND OLD.expires_at<=clock_timestamp())) THEN
    RAISE EXCEPTION 'Import request is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER worker_imports_request_frozen BEFORE UPDATE ON worker_imports
  FOR EACH ROW EXECUTE FUNCTION protect_import_request();
CREATE INDEX idx_worker_imports_expiry ON worker_imports(expires_at,status);

CREATE TABLE sqlite_import_runs (
  id text PRIMARY KEY,
  backup_id text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  data_class text NOT NULL CHECK (data_class='synthetic'),
  counts_json jsonb NOT NULL CHECK (jsonb_typeof(counts_json)='object'),
  imported_at timestamptz NOT NULL DEFAULT now()
);
