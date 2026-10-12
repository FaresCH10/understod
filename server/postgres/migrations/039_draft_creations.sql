CREATE TABLE draft_creations (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,
  briefing_id text NOT NULL UNIQUE,request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  requested_by text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),CHECK(request_id=briefing_id),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_draft_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Draft creation is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER draft_creation_frozen BEFORE UPDATE OR DELETE ON draft_creations FOR EACH ROW EXECUTE FUNCTION protect_draft_creation();
