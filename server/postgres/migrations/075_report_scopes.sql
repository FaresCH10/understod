CREATE TABLE publication_report_audience (
  assignment_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,publication_id text NOT NULL,
  crew_id text,crew_name text,CHECK((crew_id IS NULL)=(crew_name IS NULL)),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id)
);
CREATE FUNCTION guard_report_audience() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Report audience is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM assignments a WHERE a.id=NEW.assignment_id AND a.publication_id=NEW.publication_id AND a.org_id=NEW.org_id AND a.site_id=NEW.site_id)
    THEN RAISE EXCEPTION 'Report audience scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_audience_guard BEFORE INSERT OR UPDATE OR DELETE ON publication_report_audience FOR EACH ROW EXECUTE FUNCTION guard_report_audience();
ALTER TABLE report_exports ADD COLUMN filters_json jsonb NOT NULL DEFAULT '{"crewId":"","responseFrom":"","responseThrough":""}'::jsonb CHECK(jsonb_typeof(filters_json)='object');
CREATE FUNCTION protect_report_filters() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.filters_json IS DISTINCT FROM OLD.filters_json THEN RAISE EXCEPTION 'Export filters are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_filters_frozen BEFORE UPDATE ON report_exports FOR EACH ROW EXECUTE FUNCTION protect_report_filters();
