CREATE TABLE site_access_controls (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  state text NOT NULL CHECK(state IN ('active','paused')),reason text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE site_access_requests (
  request_id text NOT NULL,org_id text NOT NULL,origin_site_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL,revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,request_id),FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(actor_id,org_id,origin_site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION immutable_site_access_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Site access receipt is immutable'; END $$;
CREATE TRIGGER site_access_request_frozen BEFORE UPDATE OR DELETE ON site_access_requests FOR EACH ROW EXECUTE FUNCTION immutable_site_access_request();
