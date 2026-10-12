CREATE TABLE briefing_language_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,briefing_id text NOT NULL,
  accepted_revision integer NOT NULL CHECK(accepted_revision>1),request_json jsonb NOT NULL,
  requested_by text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),UNIQUE(briefing_id,accepted_revision),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  CHECK(request_json->'generationLanguages' IN ('null'::jsonb,'["en"]'::jsonb,'["en","ar"]'::jsonb,'["en","ur"]'::jsonb,'["en","ar","ur"]'::jsonb))
);
CREATE FUNCTION freeze_briefing_language_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Draft languages receipt is immutable'; END $$;
CREATE TRIGGER briefing_language_request_frozen BEFORE UPDATE OR DELETE ON briefing_language_requests FOR EACH ROW EXECUTE FUNCTION freeze_briefing_language_request();
