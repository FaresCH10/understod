CREATE TABLE usage_change_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,created_by text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('plan','quota','contact')),
  message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000 AND message=trim(message)),
  confirmed boolean NOT NULL CHECK(confirmed),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX usage_requests_scope ON usage_change_requests(org_id,site_id,created_at DESC,id);
CREATE FUNCTION protect_usage_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Usage request is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER usage_requests_immutable BEFORE UPDATE OR DELETE ON usage_change_requests FOR EACH ROW EXECUTE FUNCTION protect_usage_request();
