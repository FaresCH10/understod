CREATE TABLE workspace_bootstraps (
  request_id text PRIMARY KEY,request_hash text NOT NULL CHECK(length(request_hash)=64),
  org_id text NOT NULL UNIQUE REFERENCES organizations(id),site_id text NOT NULL UNIQUE,
  owner_id text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(owner_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_workspace_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Workspace bootstrap receipt is immutable'; END $$;
CREATE TRIGGER workspace_bootstrap_frozen BEFORE UPDATE OR DELETE ON workspace_bootstraps
  FOR EACH ROW EXECUTE FUNCTION freeze_workspace_bootstrap();
