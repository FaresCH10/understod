CREATE TABLE clarification_creations (
  request_id text PRIMARY KEY CHECK(request_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL UNIQUE,
  assignment_id text NOT NULL,publication_id text NOT NULL,publication_version integer NOT NULL CHECK(publication_version>0),attempt_id text,
  actor_id text NOT NULL,actor_role text NOT NULL CHECK(actor_role IN ('owner','supervisor')),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,
  CHECK(case_id=request_id),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(assignment_id,org_id,site_id) REFERENCES assignments(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  FOREIGN KEY(attempt_id,org_id,site_id,assignment_id) REFERENCES attempts(id,org_id,site_id,assignment_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX clarification_creation_actor ON clarification_creations(org_id,site_id,actor_id,created_at,request_id);
CREATE FUNCTION guard_clarification_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Clarification creation receipt is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN assignments a ON a.id=c.assignment_id AND a.org_id=c.org_id AND a.site_id=c.site_id
    JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
    WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND c.assignment_id=NEW.assignment_id
      AND c.attempt_id IS NOT DISTINCT FROM NEW.attempt_id AND c.created_at=NEW.created_at
      AND p.id=NEW.publication_id AND p.version=NEW.publication_version)
  THEN RAISE EXCEPTION 'Clarification creation scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clarification_creation_guard BEFORE INSERT OR UPDATE OR DELETE ON clarification_creations
  FOR EACH ROW EXECUTE FUNCTION guard_clarification_creation();
