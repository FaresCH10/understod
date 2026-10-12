CREATE TABLE worker_deletion_completions (
  request_id text PRIMARY KEY REFERENCES worker_deletion_pseudonyms(request_id),org_id text NOT NULL,site_id text NOT NULL,
  worker_id text NOT NULL UNIQUE,completed_at timestamptz NOT NULL,
  FOREIGN KEY(request_id,org_id,site_id,worker_id) REFERENCES worker_deletion_requests(id,org_id,site_id,worker_id)
);
CREATE TRIGGER worker_deletion_completions_immutable BEFORE UPDATE OR DELETE ON worker_deletion_completions
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
