ALTER TABLE generated_bundles ADD CONSTRAINT generated_bundles_regeneration_scope UNIQUE(id,org_id,site_id,briefing_id,revision);

CREATE TABLE briefing_regeneration_requests (
  request_id text NOT NULL CHECK(request_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  org_id text NOT NULL,
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  accepted_revision integer NOT NULL CHECK(accepted_revision>1),
  baseline_revision integer NOT NULL CHECK(baseline_revision=accepted_revision-1),
  baseline_bundle_id uuid NOT NULL,
  job_id text NOT NULL,
  request_json jsonb NOT NULL CHECK(jsonb_typeof(request_json)='object' AND octet_length(request_json::text)<=1000),
  baseline_review_json jsonb CHECK(jsonb_typeof(baseline_review_json)='object' AND octet_length(baseline_review_json::text)<=100000),
  requested_by text NOT NULL,
  requested_role text NOT NULL CHECK(requested_role IN ('owner','supervisor')),
  requested_session_hash text CHECK(requested_session_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(request_id,org_id,site_id),
  UNIQUE(job_id),
  FOREIGN KEY(job_id,org_id,site_id,briefing_id,accepted_revision) REFERENCES jobs(id,org_id,site_id,briefing_id,revision),
  FOREIGN KEY(baseline_bundle_id,org_id,site_id,briefing_id,baseline_revision) REFERENCES generated_bundles(id,org_id,site_id,briefing_id,revision),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TRIGGER regeneration_request_frozen BEFORE UPDATE OR DELETE ON briefing_regeneration_requests
  FOR EACH ROW EXECUTE FUNCTION protect_generated_audio();
