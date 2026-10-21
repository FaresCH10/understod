CREATE TABLE clarification_action_receipts (
  request_id text PRIMARY KEY CHECK(request_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  org_id text NOT NULL,site_id text NOT NULL,case_id text NOT NULL,actor_id text NOT NULL,
  actor_role text NOT NULL CHECK(actor_role IN ('owner','supervisor')),
  kind text NOT NULL CHECK(kind IN ('assign','resolve')),request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  effect text NOT NULL CHECK(effect IN ('applied','unchanged','rejected')),
  result_status text NOT NULL CHECK(result_status IN ('open','resolved')),result_owner_id text,
  reason_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(case_id,org_id,site_id) REFERENCES clarifications(id,org_id,site_id),
  FOREIGN KEY(actor_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  FOREIGN KEY(result_owner_id,org_id,site_id) REFERENCES staff(id,org_id,site_id),
  CHECK((effect='rejected' AND reason_code IS NOT NULL AND reason_code IN ('owner_changed','owner_unavailable','case_resolved','resolution_conflict'))
    OR (effect<>'rejected' AND reason_code IS NULL)),
  CHECK(kind<>'resolve' OR effect='rejected' OR result_status='resolved')
);
CREATE INDEX clarification_action_history ON clarification_action_receipts(org_id,site_id,case_id,created_at,request_id);
CREATE FUNCTION guard_clarification_action_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Clarification action receipt is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clarifications c JOIN staff s ON s.id=NEW.actor_id AND s.org_id=c.org_id AND s.site_id=c.site_id
    WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id)
  THEN RAISE EXCEPTION 'Clarification action scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clarification_action_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON clarification_action_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_clarification_action_receipt();
