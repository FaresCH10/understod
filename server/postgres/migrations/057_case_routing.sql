CREATE TABLE case_routing (
  case_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,routed_owner_id text,
  due_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
  manual boolean NOT NULL DEFAULT false,escalated_at timestamptz,
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(routed_owner_id,org_id,site_id) REFERENCES staff(id,org_id,site_id)
);
CREATE INDEX case_routing_due ON case_routing(due_at) WHERE manual=false AND escalated_at IS NULL;
CREATE FUNCTION freeze_case_routing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case routing evidence is immutable'; END IF;
  IF NEW.case_id IS DISTINCT FROM OLD.case_id OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.routed_owner_id IS DISTINCT FROM OLD.routed_owner_id
    OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.manual AND NOT NEW.manual)
    OR (OLD.escalated_at IS NOT NULL AND NEW.escalated_at IS DISTINCT FROM OLD.escalated_at)
  THEN RAISE EXCEPTION 'Case routing identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_routing_frozen BEFORE UPDATE OR DELETE ON case_routing FOR EACH ROW EXECUTE FUNCTION freeze_case_routing();
