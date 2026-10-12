CREATE TABLE case_repeats (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL,assignment_id text NOT NULL,
  publication_id text NOT NULL,actor_id text NOT NULL,actor_role text NOT NULL CHECK(actor_role IN ('owner','supervisor')),
  due_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','cancelled','expired')),
  submission_id text,submitted_at timestamptz,
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,submission_id) REFERENCES submission_receipts(assignment_id,submission_id),
  CHECK(due_at>created_at),
  CHECK((status='submitted' AND submission_id IS NOT NULL AND submitted_at IS NOT NULL) OR
    (status<>'submitted' AND submission_id IS NULL AND submitted_at IS NULL))
);
CREATE UNIQUE INDEX case_repeats_pending ON case_repeats(assignment_id) WHERE status='pending';
CREATE UNIQUE INDEX case_repeats_submission ON case_repeats(assignment_id,submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX case_repeats_case ON case_repeats(case_id,created_at DESC,id DESC);
CREATE FUNCTION guard_case_repeat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Repeat evidence is immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NOT EXISTS(SELECT 1 FROM clarifications c
      JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
      JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
      JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
      JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id AND s.role=NEW.actor_role AND s.active
      WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND c.status='open' AND w.active
        AND p.state='published' AND a.id=NEW.assignment_id AND p.id=NEW.publication_id)
      OR EXISTS(SELECT 1 FROM worker_deletion_requests d JOIN assignments a ON a.worker_id=d.worker_id WHERE a.id=NEW.assignment_id)
    THEN RAISE EXCEPTION 'Repeat scope mismatch'; END IF;
  ELSIF (NEW.id,NEW.org_id,NEW.site_id,NEW.case_id,NEW.assignment_id,NEW.publication_id,NEW.actor_id,NEW.actor_role,NEW.due_at,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.case_id,OLD.assignment_id,OLD.publication_id,OLD.actor_id,OLD.actor_role,OLD.due_at,OLD.created_at)
    OR (OLD.status<>'pending' AND (NEW.status,NEW.submission_id,NEW.submitted_at) IS DISTINCT FROM (OLD.status,OLD.submission_id,OLD.submitted_at))
  THEN RAISE EXCEPTION 'Repeat evidence is immutable'; END IF;
  IF NEW.status='submitted' AND NOT EXISTS(SELECT 1 FROM submission_receipts r WHERE r.assignment_id=NEW.assignment_id
    AND r.submission_id=NEW.submission_id AND r.org_id=NEW.org_id AND r.received_at=NEW.submitted_at
    AND r.received_at>=NEW.created_at AND r.received_at<NEW.due_at)
  THEN RAISE EXCEPTION 'Repeat receipt mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_repeat_guard BEFORE INSERT OR UPDATE OR DELETE ON case_repeats FOR EACH ROW EXECUTE FUNCTION guard_case_repeat();
