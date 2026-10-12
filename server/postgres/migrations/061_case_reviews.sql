CREATE TABLE case_reviews (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id text NOT NULL UNIQUE,
  org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL,assignment_id text NOT NULL,
  actor_id text NOT NULL,actor_role text NOT NULL CHECK(actor_role IN ('owner','supervisor')),
  kind text NOT NULL CHECK(kind IN ('deadline','disagree')),request_hash text NOT NULL CHECK(length(request_hash)=64),
  due_at timestamptz,expected_due_at timestamptz,reason text,attempt_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(attempt_id,org_id,site_id,assignment_id) REFERENCES attempts(id,org_id,site_id,assignment_id),
  CHECK((kind='deadline' AND due_at IS NOT NULL AND reason IS NULL AND attempt_id IS NULL)
    OR (kind='disagree' AND due_at IS NULL AND expected_due_at IS NULL AND attempt_id IS NOT NULL AND reason IS NOT NULL AND length(reason) BETWEEN 5 AND 1000))
);
CREATE INDEX case_reviews_history ON case_reviews(case_id,sequence DESC);
CREATE FUNCTION guard_case_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case review is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id AND s.active AND s.role=NEW.actor_role
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND a.id=NEW.assignment_id
        AND (NEW.kind='deadline' OR c.attempt_id=NEW.attempt_id))
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
    THEN RAISE EXCEPTION 'Case review scope mismatch'; END IF;
  ELSIF (NEW.sequence,NEW.id,NEW.org_id,NEW.site_id,NEW.case_id,NEW.assignment_id,NEW.actor_id,NEW.actor_role,NEW.kind,NEW.request_hash,NEW.due_at,NEW.expected_due_at,NEW.attempt_id,NEW.created_at)
    IS DISTINCT FROM (OLD.sequence,OLD.id,OLD.org_id,OLD.site_id,OLD.case_id,OLD.assignment_id,OLD.actor_id,OLD.actor_role,OLD.kind,OLD.request_hash,OLD.due_at,OLD.expected_due_at,OLD.attempt_id,OLD.created_at)
    OR NEW.kind<>'disagree' OR NEW.reason IS DISTINCT FROM '[Deleted]' OR NOT EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=OLD.assignment_id)
  THEN RAISE EXCEPTION 'Case review is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_review_guard BEFORE INSERT OR UPDATE OR DELETE ON case_reviews FOR EACH ROW EXECUTE FUNCTION guard_case_review();
