CREATE TABLE templates (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL CHECK(status IN ('active','archived')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,org_id,site_id),FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE template_versions (
  template_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL CHECK(status IN ('active','archived')),content_json jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(template_id,revision),FOREIGN KEY(template_id,org_id,site_id) REFERENCES templates(id,org_id,site_id),
  FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE TABLE template_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,template_id text NOT NULL,briefing_id text,
  request_json jsonb NOT NULL,result_json jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(org_id,site_id,request_id),FOREIGN KEY(template_id,org_id,site_id) REFERENCES templates(id,org_id,site_id),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),FOREIGN KEY(created_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_template_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_identity BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION freeze_template_identity();
CREATE FUNCTION freeze_template_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Template evidence is immutable'; END $$;
CREATE TRIGGER template_version_frozen BEFORE UPDATE OR DELETE ON template_versions FOR EACH ROW EXECUTE FUNCTION freeze_template_evidence();
CREATE TRIGGER template_request_frozen BEFORE UPDATE OR DELETE ON template_requests FOR EACH ROW EXECUTE FUNCTION freeze_template_evidence();
