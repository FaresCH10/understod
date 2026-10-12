CREATE TABLE briefing_copies (
  request_id text NOT NULL, org_id text NOT NULL, site_id text NOT NULL,
  source_briefing_id text NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
  copy_briefing_id text NOT NULL UNIQUE, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 120),
  requested_by text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id), CHECK(source_briefing_id<>copy_briefing_id),
  FOREIGN KEY(source_briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(copy_briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_briefing_copy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Draft copy receipt is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER briefing_copies_immutable BEFORE UPDATE OR DELETE ON briefing_copies
  FOR EACH ROW EXECUTE FUNCTION protect_briefing_copy();
