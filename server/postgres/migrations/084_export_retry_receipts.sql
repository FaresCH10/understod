CREATE UNIQUE INDEX report_exports_identity ON report_exports(id,org_id,site_id);
CREATE TABLE report_export_retries (
  request_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,export_id text NOT NULL,
  requested_by text NOT NULL,attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 2),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(export_id,org_id,site_id) REFERENCES report_exports(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_export_retry_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Export retry evidence is immutable'; END $$;
CREATE TRIGGER export_retry_receipt_frozen BEFORE UPDATE OR DELETE ON report_export_retries
  FOR EACH ROW EXECUTE FUNCTION protect_export_retry_receipt();
