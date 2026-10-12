CREATE TABLE restore_activity_redactions (
  event_id text PRIMARY KEY REFERENCES audit(id),org_id text NOT NULL,site_id text NOT NULL,
  backup_id uuid NOT NULL,ledger_id uuid NOT NULL,ledger_fingerprint text NOT NULL CHECK(ledger_fingerprint ~ '^[a-f0-9]{64}$'),
  original_event_json jsonb NOT NULL CHECK(jsonb_typeof(original_event_json)='object' AND octet_length(original_event_json::text)<=16000),
  source_receipt_json jsonb NOT NULL CHECK(jsonb_typeof(source_receipt_json)='object' AND octet_length(source_receipt_json::text)<=16000),
  source_policy_json jsonb NOT NULL CHECK(jsonb_typeof(source_policy_json)='object' AND octet_length(source_policy_json::text)<=16000),
  source_captured_at timestamptz NOT NULL,imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TRIGGER restore_activity_redactions_frozen BEFORE UPDATE OR DELETE ON restore_activity_redactions
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION guard_restore_activity_redaction() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE event jsonb; receipt jsonb; policy jsonb; days integer; completed timestamptz;
BEGIN
  receipt:=NEW.source_receipt_json;policy:=NEW.source_policy_json;
  SELECT jsonb_build_object('id',id,'org_id',org_id,'site_id',site_id,'actor_type',actor_type,'action',action,'occurred_at',occurred_at)
    INTO event FROM audit WHERE id=NEW.event_id AND org_id=NEW.org_id AND site_id=NEW.site_id;
  days:=(receipt->>'days')::integer;completed:=(receipt->>'completed_at')::timestamptz;
  IF NOT restore_privacy_quarantined(NEW.backup_id) OR NEW.source_captured_at>clock_timestamp()
    OR event IS NULL OR event IS DISTINCT FROM NEW.original_event_json
    OR receipt->>'event_id' IS DISTINCT FROM NEW.event_id OR receipt->>'org_id' IS DISTINCT FROM NEW.org_id
    OR receipt->>'site_id' IS DISTINCT FROM NEW.site_id OR days IS NULL OR days NOT IN (7,30,90,365)
    OR receipt-ARRAY['event_id','org_id','site_id','policy_revision','days','completed_at']<>'{}'::jsonb
    OR completed IS NULL OR completed>NEW.source_captured_at
    OR (event->>'occurred_at')::timestamptz>completed-days*interval '1 day'
    OR policy->>'org_id' IS DISTINCT FROM NEW.org_id OR policy->>'site_id' IS DISTINCT FROM NEW.site_id
    OR (policy->>'revision')::integer IS DISTINCT FROM (receipt->>'policy_revision')::integer
    OR policy->'request_json'->>'confirmed' IS DISTINCT FROM 'true'
    OR (policy->'request_json'->>'days')::integer IS DISTINCT FROM days
    OR (policy->'request_json'->>'revision')::integer IS DISTINCT FROM (policy->>'revision')::integer-1
    OR (policy->>'created_at')::timestamptz IS NULL OR (policy->>'created_at')::timestamptz>completed
    OR NOT EXISTS(SELECT 1 FROM activity_retention_requests r WHERE to_jsonb(r)=policy) THEN
    RAISE EXCEPTION 'Restore activity original decision, event or quarantine unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restore_activity_redaction_scope BEFORE INSERT ON restore_activity_redactions
  FOR EACH ROW EXECUTE FUNCTION guard_restore_activity_redaction();

CREATE OR REPLACE FUNCTION guard_activity_identity_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM audit e JOIN activity_retention_policies p ON p.org_id=e.org_id AND p.site_id=e.site_id
    WHERE e.id=NEW.event_id AND e.org_id=NEW.org_id AND e.site_id=NEW.site_id
      AND p.revision=NEW.policy_revision AND p.days=NEW.days
      AND e.occurred_at<=clock_timestamp()-p.days*interval '1 day')
    AND NOT EXISTS(SELECT 1 FROM restore_activity_redactions r WHERE r.event_id=NEW.event_id
      AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id AND restore_privacy_quarantined(r.backup_id)
      AND (r.source_receipt_json->>'policy_revision')::integer=NEW.policy_revision
      AND (r.source_receipt_json->>'days')::integer=NEW.days) THEN
    RAISE EXCEPTION 'Activity retention scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE operational_audit_receipts DROP CONSTRAINT operational_audit_receipts_action_check;
ALTER TABLE operational_audit_receipts ADD CHECK(action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
  'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
  'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity'));
CREATE OR REPLACE FUNCTION capture_operational_audit_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
    'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
    'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity') THEN
    INSERT INTO operational_audit_receipts VALUES(NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,
      NEW.actor_id,NEW.action,NEW.object_id,NEW.occurred_at);
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION require_operational_activity_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM audit a WHERE a.id=NEW.event_id AND a.action IN
    ('worker.disabled','credential.recovered','backup.restore.quarantined','backup.restore.elapsed_policies_reconciled',
      'backup.restore.privacy.deletions','backup.restore.privacy.policies','backup.restore.privacy.restrictions',
      'backup.restore.privacy.retirements','backup.restore.privacy.activity')
    AND NOT EXISTS(SELECT 1 FROM operational_audit_receipts r WHERE
      (r.id,r.org_id,r.site_id,r.actor_type,r.actor_id,r.action,r.object_id,r.occurred_at)
        IS NOT DISTINCT FROM (a.id,a.org_id,a.site_id,a.actor_type,a.actor_id,a.action,a.object_id,a.occurred_at))) THEN
    RAISE EXCEPTION 'Operational provenance required before activity identity expiry';
  END IF;
  RETURN NEW;
END $$;
