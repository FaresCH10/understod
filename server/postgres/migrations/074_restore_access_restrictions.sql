CREATE TABLE restore_access_restrictions (
  backup_id uuid NOT NULL,ledger_id uuid NOT NULL,ledger_fingerprint text NOT NULL CHECK(ledger_fingerprint ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN ('staff','worker','site-access','site-lifecycle','tenant','account','operator')),
  reference_id text NOT NULL CHECK(length(reference_id) BETWEEN 1 AND 100),org_id text,site_id text,
  source_state_json jsonb NOT NULL CHECK(jsonb_typeof(source_state_json)='object' AND octet_length(source_state_json::text)<=16000),
  source_receipts_json jsonb NOT NULL CHECK(jsonb_typeof(source_receipts_json)='array' AND octet_length(source_receipts_json::text)<=64000),
  target_state_json jsonb NOT NULL CHECK(jsonb_typeof(target_state_json)='object' AND octet_length(target_state_json::text)<=16000),
  source_captured_at timestamptz NOT NULL,imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(backup_id,ledger_id,kind,reference_id),FOREIGN KEY(org_id) REFERENCES organizations(id),
  FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TRIGGER restore_access_restrictions_frozen BEFORE UPDATE OR DELETE ON restore_access_restrictions
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

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
      OR EXISTS(SELECT 1 FROM sites s WHERE NOT EXISTS(SELECT 1 FROM audit a WHERE a.org_id=s.org_id AND a.site_id=s.id
        AND a.actor_type='system' AND a.actor_id='restore-operator' AND a.action='backup.restore.quarantined' AND a.object_id=backup::text)))
$$;

CREATE FUNCTION guard_restore_access_restriction() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE source jsonb; matched boolean:=false;
BEGIN
  source:=NEW.source_state_json;
  IF NOT restore_privacy_quarantined(NEW.backup_id) OR NEW.source_captured_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Restore access provenance or quarantine unavailable';
  END IF;
  CASE NEW.kind
    WHEN 'staff' THEN
      SELECT EXISTS(SELECT 1 FROM staff s LEFT JOIN staff_access_revisions r ON r.staff_id=s.id WHERE s.id=NEW.reference_id
        AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id AND source->>'id'=s.id AND source->>'org_id'=s.org_id AND source->>'site_id'=s.site_id
        AND s.role=source->>'role' AND (NOT s.active OR (source->>'active')::boolean)
        AND COALESCE(r.revision,1)>=(source->>'access_revision')::integer
        AND NEW.target_state_json=jsonb_build_object('id',s.id,'org_id',s.org_id,'site_id',s.site_id,'role',s.role,'active',s.active,'access_revision',COALESCE(r.revision,1))) INTO matched;
    WHEN 'worker' THEN
      SELECT EXISTS(SELECT 1 FROM workers w WHERE w.id=NEW.reference_id AND w.org_id=NEW.org_id AND w.site_id=NEW.site_id
        AND source->>'id'=w.id AND source->>'org_id'=w.org_id AND source->>'site_id'=w.site_id AND (NOT w.active OR (source->>'active')::boolean)
        AND NEW.target_state_json=jsonb_build_object('id',w.id,'org_id',w.org_id,'site_id',w.site_id,'active',w.active)) INTO matched;
    WHEN 'site-access' THEN
      SELECT EXISTS(SELECT 1 FROM site_access_controls c WHERE c.site_id=NEW.reference_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id
        AND source->>'org_id'=c.org_id AND source->>'site_id'=c.site_id AND (source->>'state'<>'paused' OR c.state='paused')
        AND NEW.target_state_json=to_jsonb(c)) INTO matched;
    WHEN 'site-lifecycle' THEN
      SELECT EXISTS(SELECT 1 FROM site_lifecycle c WHERE c.site_id=NEW.reference_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id
        AND source->>'org_id'=c.org_id AND source->>'site_id'=c.site_id AND (source->>'state'<>'archived' OR c.state='archived')
        AND NEW.target_state_json=to_jsonb(c)) INTO matched;
    WHEN 'tenant' THEN
      SELECT EXISTS(SELECT 1 FROM tenant_controls c WHERE c.org_id=NEW.reference_id AND c.org_id=NEW.org_id AND NEW.site_id IS NULL
        AND source->>'org_id'=c.org_id AND c.state='suspended' AND c.reason='maintenance' AND NEW.target_state_json=to_jsonb(c)) INTO matched;
    WHEN 'account' THEN
      SELECT EXISTS(SELECT 1 FROM staff_accounts a JOIN staff s ON s.id=a.credential_staff_id WHERE a.id=NEW.reference_id
        AND s.org_id=NEW.org_id AND s.site_id=NEW.site_id AND source->>'id'=a.id AND source->>'credential_staff_id'=a.credential_staff_id
        AND NOT a.active AND NEW.target_state_json=to_jsonb(a)) INTO matched;
    WHEN 'operator' THEN
      SELECT EXISTS(SELECT 1 FROM platform_operators o WHERE o.id=NEW.reference_id AND NEW.org_id IS NULL AND NEW.site_id IS NULL
        AND source->>'id'=o.id AND NOT o.active AND NEW.target_state_json=jsonb_build_object('id',o.id,'active',o.active,'revision',o.revision,'changed_at',o.changed_at)) INTO matched;
  END CASE;
  IF NOT matched THEN RAISE EXCEPTION 'Restore access identity or restrictive target state mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restore_access_restriction_scope BEFORE INSERT ON restore_access_restrictions
  FOR EACH ROW EXECUTE FUNCTION guard_restore_access_restriction();
