ALTER TABLE assignments ADD COLUMN language text CHECK (language IN ('en','ar','ur'));
-- Legacy synthetic rows have no original language evidence; use their cutover preference, not a claim about real history.
UPDATE assignments a SET language=w.language FROM workers w WHERE w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id;
ALTER TABLE assignments ALTER COLUMN language SET NOT NULL;

CREATE OR REPLACE FUNCTION protect_assignment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.org_id,NEW.site_id,NEW.publication_id,NEW.worker_id,NEW.created_at,NEW.language)
    IS DISTINCT FROM (OLD.id,OLD.org_id,OLD.site_id,OLD.publication_id,OLD.worker_id,OLD.created_at,OLD.language) THEN
    RAISE EXCEPTION 'Assignment snapshot is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
