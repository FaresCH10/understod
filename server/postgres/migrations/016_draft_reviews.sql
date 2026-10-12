CREATE TABLE draft_reviews (
  briefing_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,content_json jsonb NOT NULL,
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id)
);
CREATE FUNCTION freeze_draft_review_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.briefing_id IS DISTINCT FROM OLD.briefing_id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    RAISE EXCEPTION 'Scope mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER draft_review_scope_update BEFORE UPDATE ON draft_reviews FOR EACH ROW EXECUTE FUNCTION freeze_draft_review_scope();
CREATE TABLE briefing_review_requests (
  request_id text NOT NULL,org_id text NOT NULL,site_id text NOT NULL,briefing_id text NOT NULL,
  accepted_revision integer NOT NULL CHECK(accepted_revision>1),request_json jsonb NOT NULL,
  requested_by text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(org_id,site_id,request_id),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE FUNCTION freeze_briefing_review_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Draft review receipt is immutable'; END $$;
CREATE TRIGGER briefing_review_request_frozen BEFORE UPDATE OR DELETE ON briefing_review_requests FOR EACH ROW EXECUTE FUNCTION freeze_briefing_review_request();
