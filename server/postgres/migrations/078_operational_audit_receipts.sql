CREATE TABLE operational_audit_receipts (
  id text PRIMARY KEY REFERENCES audit(id),org_id text NOT NULL,site_id text NOT NULL,
  actor_type text NOT NULL,actor_id text NOT NULL,action text NOT NULL,object_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  CHECK(action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
    'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions',
    'backup.restore.privacy.policies','backup.restore.privacy.restrictions','backup.restore.privacy.retirements')),
  CHECK(actor_id<>'' AND object_id<>''),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE INDEX operational_audit_receipts_scope ON operational_audit_receipts(org_id,site_id,action);
CREATE TRIGGER operational_audit_receipts_frozen BEFORE UPDATE OR DELETE ON operational_audit_receipts
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();
CREATE FUNCTION guard_operational_audit_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM audit a WHERE
    (a.id,a.org_id,a.site_id,a.actor_type,a.actor_id,a.action,a.object_id,a.occurred_at)
      IS NOT DISTINCT FROM
    (NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,NEW.actor_id,NEW.action,NEW.object_id,NEW.occurred_at)) THEN
    RAISE EXCEPTION 'Original operational activity evidence unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operational_audit_receipt_scope BEFORE INSERT ON operational_audit_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_operational_audit_receipt();
CREATE FUNCTION capture_operational_audit_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
    'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions',
    'backup.restore.privacy.policies','backup.restore.privacy.restrictions','backup.restore.privacy.retirements') THEN
    INSERT INTO operational_audit_receipts VALUES(NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,
      NEW.actor_id,NEW.action,NEW.object_id,NEW.occurred_at);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operational_audit_receipt_capture AFTER INSERT ON audit
  FOR EACH ROW EXECUTE FUNCTION capture_operational_audit_receipt();

-- Preserve only still-present original provenance; never invent already-erased identifiers.
INSERT INTO operational_audit_receipts
  SELECT id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at FROM audit
  WHERE actor_id<>'' AND object_id<>'' AND action IN ('worker.disabled','credential.recovered',
    'backup.restore.quarantined','backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions',
    'backup.restore.privacy.policies','backup.restore.privacy.restrictions','backup.restore.privacy.retirements');

CREATE FUNCTION require_operational_activity_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM audit a WHERE a.id=NEW.event_id AND a.action IN
    ('worker.disabled','credential.recovered','backup.restore.quarantined','backup.restore.elapsed_policies_reconciled',
      'backup.restore.privacy.deletions','backup.restore.privacy.policies','backup.restore.privacy.restrictions','backup.restore.privacy.retirements')
    AND NOT EXISTS(SELECT 1 FROM operational_audit_receipts r WHERE
      (r.id,r.org_id,r.site_id,r.actor_type,r.actor_id,r.action,r.object_id,r.occurred_at)
        IS NOT DISTINCT FROM (a.id,a.org_id,a.site_id,a.actor_type,a.actor_id,a.action,a.object_id,a.occurred_at))) THEN
    RAISE EXCEPTION 'Operational provenance required before activity identity expiry';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_operational_provenance BEFORE INSERT ON activity_identity_purges
  FOR EACH ROW EXECUTE FUNCTION require_operational_activity_provenance();

CREATE OR REPLACE FUNCTION restore_privacy_quarantined(backup uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM system_controls WHERE id='global' AND jobs_paused AND provider_paused)
    AND NOT (EXISTS(SELECT 1 FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id WHERE t.state IS DISTINCT FROM 'suspended')
      OR EXISTS(SELECT 1 FROM sessions WHERE revoked_at IS NULL) OR EXISTS(SELECT 1 FROM worker_grants WHERE revoked_at IS NULL)
      OR EXISTS(SELECT 1 FROM operator_sessions WHERE revoked_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_accounts WHERE active=true) OR EXISTS(SELECT 1 FROM platform_operators WHERE active=true)
      OR EXISTS(SELECT 1 FROM staff_recovery_tokens WHERE revoked_at IS NULL AND used_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_invitation_tokens WHERE revoked_at IS NULL AND used_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_invitations WHERE state='pending')
      OR EXISTS(SELECT 1 FROM staff_recovery_mail WHERE state IN ('queued','processing'))
      OR EXISTS(SELECT 1 FROM staff_invitation_mail WHERE state IN ('queued','processing'))
      OR EXISTS(SELECT 1 FROM pilot_inquiries WHERE state IN ('saved','queued','processing'))
      OR EXISTS(SELECT 1 FROM provider_policies WHERE enabled) OR EXISTS(SELECT 1 FROM provider_requests WHERE state='started')
      OR EXISTS(SELECT 1 FROM provider_verifications WHERE state='pending')
      OR EXISTS(SELECT 1 FROM worker_health WHERE state<>'stopped' AND seen_at>clock_timestamp()-interval '2 minutes')
      OR EXISTS(SELECT 1 FROM sites s WHERE NOT EXISTS(SELECT 1 FROM operational_audit_receipts a WHERE a.org_id=s.org_id AND a.site_id=s.id
        AND a.actor_type='system' AND a.actor_id='restore-operator' AND a.action='backup.restore.quarantined' AND a.object_id=backup::text)))
$$;
