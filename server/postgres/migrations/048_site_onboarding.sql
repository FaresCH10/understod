CREATE TABLE site_onboarding (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  step text NOT NULL CHECK(step IN ('organization','team','languages','provider','access','briefing')),
  first_briefing_id text,technical_json jsonb NOT NULL,updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(first_briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id)
);
CREATE TABLE onboarding_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,request_json jsonb NOT NULL,
  revision integer NOT NULL CHECK(revision>0),requested_by text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_onboarding_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Onboarding receipt is immutable'; END $$;
CREATE TRIGGER onboarding_request_frozen BEFORE UPDATE OR DELETE ON onboarding_requests FOR EACH ROW EXECUTE FUNCTION freeze_onboarding_request();
