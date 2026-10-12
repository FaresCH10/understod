CREATE TABLE publication_schedules (
  id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,briefing_id text NOT NULL,
  request_json jsonb NOT NULL,snapshot_hash text NOT NULL,recipients_json jsonb NOT NULL,requested_by text NOT NULL,authority_json jsonb NOT NULL,
  publish_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL CHECK(state IN ('queued','published','cancelled','failed')),publication_id text,error text,finished_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),retry_at timestamptz,
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id),
  FOREIGN KEY(requested_by,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  FOREIGN KEY(publication_id,org_id,site_id) REFERENCES publications(id,org_id,site_id),
  CHECK((state='queued' AND publication_id IS NULL AND error IS NULL AND finished_at IS NULL)
    OR (state='published' AND publication_id IS NOT NULL AND error IS NULL AND finished_at IS NOT NULL)
    OR (state='cancelled' AND publication_id IS NULL AND error IS NULL AND finished_at IS NOT NULL)
    OR (state='failed' AND publication_id IS NULL AND error IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX publication_schedules_pending ON publication_schedules(briefing_id) WHERE state='queued';
CREATE INDEX publication_schedules_due ON publication_schedules(state,publish_at,id);
CREATE INDEX publication_schedules_history ON publication_schedules(org_id,site_id,briefing_id,created_at DESC,id);
CREATE FUNCTION protect_publication_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Schedule evidence is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state!='queued' OR (NEW.state='queued' AND (NEW.attempts!=OLD.attempts+1 OR NEW.retry_at IS NULL))
    OR (to_jsonb(NEW)-ARRAY['state','publication_id','error','finished_at','attempts','retry_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','publication_id','error','finished_at','attempts','retry_at'])
    OR (NEW.publication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.id=NEW.publication_id AND p.briefing_id=NEW.briefing_id))
    THEN RAISE EXCEPTION 'Schedule evidence is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER publication_schedule_frozen BEFORE UPDATE OR DELETE ON publication_schedules FOR EACH ROW EXECUTE FUNCTION protect_publication_schedule();
