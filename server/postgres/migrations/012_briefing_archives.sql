CREATE TABLE briefing_archives (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,
  briefing_id text NOT NULL UNIQUE,request_json jsonb NOT NULL,publication_ids_json jsonb NOT NULL CHECK(jsonb_typeof(publication_ids_json)='array'),
  archived_by text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(archived_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_briefing_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Briefing archive is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER briefing_archives_immutable BEFORE UPDATE OR DELETE ON briefing_archives
  FOR EACH ROW EXECUTE FUNCTION protect_briefing_archive();
