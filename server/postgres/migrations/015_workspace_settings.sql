CREATE TABLE organization_settings (
  org_id text PRIMARY KEY REFERENCES organizations(id),revision integer NOT NULL CHECK(revision>=0),support_email text NOT NULL DEFAULT ''
);
CREATE TABLE site_settings (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>=0),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE settings_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('organization','site')),
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_settings_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Settings receipt is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER settings_requests_immutable BEFORE UPDATE OR DELETE ON settings_requests FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
