ALTER TABLE operational_audit_receipts DROP CONSTRAINT operational_audit_receipts_action_check;
ALTER TABLE operational_audit_receipts ADD CHECK(action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
  'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
  'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings',
  'backup.restore.cleanup.transition'));

CREATE OR REPLACE FUNCTION capture_operational_audit_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
    'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
    'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings',
    'backup.restore.cleanup.transition') THEN
    INSERT INTO operational_audit_receipts VALUES(NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,NEW.actor_id,NEW.action,NEW.object_id,NEW.occurred_at);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION require_operational_activity_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM audit a WHERE a.id=NEW.event_id AND a.action IN
    ('worker.disabled','credential.recovered','backup.restore.quarantined','backup.restore.elapsed_policies_reconciled',
      'backup.restore.privacy.deletions','backup.restore.privacy.policies','backup.restore.privacy.restrictions',
      'backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings','backup.restore.cleanup.transition')
    AND NOT EXISTS(SELECT 1 FROM operational_audit_receipts r WHERE
      (r.id,r.org_id,r.site_id,r.actor_type,r.actor_id,r.action,r.object_id,r.occurred_at)
        IS NOT DISTINCT FROM (a.id,a.org_id,a.site_id,a.actor_type,a.actor_id,a.action,a.object_id,a.occurred_at))) THEN
    RAISE EXCEPTION 'Operational provenance required before activity identity expiry';
  END IF;
  RETURN NEW;
END $$;
