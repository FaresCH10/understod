CREATE TABLE site_creations (
  request_id text NOT NULL,org_id text NOT NULL REFERENCES organizations(id),origin_site_id text NOT NULL,
  site_id text NOT NULL UNIQUE,created_by text NOT NULL,owner_id text NOT NULL,request_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(org_id,request_id),
  FOREIGN KEY(origin_site_id,org_id) REFERENCES sites(id,org_id),FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(created_by,org_id,origin_site_id) REFERENCES staff(id,org_id,site_id),
  FOREIGN KEY(owner_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_site_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Site creation receipt is immutable'; END $$;
CREATE TRIGGER site_creation_frozen BEFORE UPDATE OR DELETE ON site_creations FOR EACH ROW EXECUTE FUNCTION freeze_site_creation();
