CREATE TABLE recording_notices (
  site_id text PRIMARY KEY,org_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
  notices_json jsonb NOT NULL CHECK(jsonb_typeof(notices_json)='object'),updated_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TABLE recording_notice_requests (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,actor_id text NOT NULL,
  request_json jsonb NOT NULL CHECK(jsonb_typeof(request_json)='object'),revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL,
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id),FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION protect_recording_notice_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recording notice receipt is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER recording_notice_requests_immutable BEFORE UPDATE OR DELETE ON recording_notice_requests
  FOR EACH ROW EXECUTE FUNCTION protect_recording_notice_receipt();
CREATE FUNCTION protect_recording_notice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.site_id<>OLD.site_id OR NEW.org_id<>OLD.org_id THEN RAISE EXCEPTION 'Scope mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recording_notices_identity BEFORE UPDATE ON recording_notices
  FOR EACH ROW EXECUTE FUNCTION protect_recording_notice_identity();
