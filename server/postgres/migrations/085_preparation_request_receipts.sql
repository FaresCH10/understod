CREATE TABLE preparation_requests (
  request_id text PRIMARY KEY, org_id text NOT NULL, site_id text NOT NULL,
  briefing_id text NOT NULL, revision integer NOT NULL CHECK(revision>0), job_id text NOT NULL,
  generation integer NOT NULL CHECK(generation BETWEEN 0 AND 1000000), request_json jsonb NOT NULL,
  requested_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(job_id,generation),
  FOREIGN KEY(job_id,org_id,site_id,briefing_id,revision) REFERENCES jobs(id,org_id,site_id,briefing_id,revision),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  CHECK(jsonb_typeof(request_json)='object'),
  CHECK(request_json=jsonb_build_object('revision',revision,'jobId',request_json->'jobId','generation',generation)),
  CHECK((request_json->'jobId'='null'::jsonb AND generation=0) OR request_json->>'jobId'=job_id)
);
CREATE FUNCTION protect_preparation_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Preparation request evidence is immutable'; END $$;
CREATE TRIGGER preparation_request_frozen BEFORE UPDATE OR DELETE ON preparation_requests
  FOR EACH ROW EXECUTE FUNCTION protect_preparation_request();
