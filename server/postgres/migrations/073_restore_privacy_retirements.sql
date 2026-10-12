CREATE TABLE restore_privacy_retirements (
  kind text NOT NULL CHECK(kind IN ('attempt-text','recording-text','case-content','generated-audio','recording-audio','source-audio','followup-audio','case-voice')),
  reference_id text NOT NULL CHECK(length(reference_id) BETWEEN 1 AND 100),
  org_id text NOT NULL,site_id text NOT NULL,
  backup_id uuid NOT NULL,ledger_id uuid NOT NULL,ledger_fingerprint text NOT NULL CHECK(ledger_fingerprint ~ '^[a-f0-9]{64}$'),
  source_identity_json jsonb NOT NULL CHECK(jsonb_typeof(source_identity_json)='object' AND octet_length(source_identity_json::text)<=16000),
  source_receipt_json jsonb NOT NULL CHECK(jsonb_typeof(source_receipt_json)='object' AND octet_length(source_receipt_json::text)<=16000),
  source_policy_json jsonb CHECK(source_policy_json IS NULL OR (jsonb_typeof(source_policy_json)='object' AND octet_length(source_policy_json::text)<=16000)),
  source_captured_at timestamptz NOT NULL,imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(kind,reference_id),FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id)
);
CREATE TRIGGER restore_privacy_retirements_frozen BEFORE UPDATE OR DELETE ON restore_privacy_retirements
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

CREATE FUNCTION restore_privacy_quarantined(backup uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM system_controls WHERE id='global' AND jobs_paused AND provider_paused)
    AND NOT (EXISTS(SELECT 1 FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id WHERE t.state IS DISTINCT FROM 'suspended')
      OR EXISTS(SELECT 1 FROM sessions WHERE revoked_at IS NULL) OR EXISTS(SELECT 1 FROM worker_grants WHERE revoked_at IS NULL)
      OR EXISTS(SELECT 1 FROM operator_sessions WHERE revoked_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_recovery_tokens WHERE revoked_at IS NULL AND used_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_invitation_tokens WHERE revoked_at IS NULL AND used_at IS NULL)
      OR EXISTS(SELECT 1 FROM staff_invitations WHERE state='pending')
      OR EXISTS(SELECT 1 FROM staff_recovery_mail WHERE state IN ('queued','processing'))
      OR EXISTS(SELECT 1 FROM staff_invitation_mail WHERE state IN ('queued','processing'))
      OR EXISTS(SELECT 1 FROM pilot_inquiries WHERE state IN ('saved','queued','processing'))
      OR EXISTS(SELECT 1 FROM provider_policies WHERE enabled)
      OR EXISTS(SELECT 1 FROM provider_requests WHERE state='started')
      OR EXISTS(SELECT 1 FROM provider_verifications WHERE state='pending')
      OR EXISTS(SELECT 1 FROM worker_health WHERE state<>'stopped' AND seen_at>clock_timestamp()-interval '2 minutes')
      OR EXISTS(SELECT 1 FROM sites s WHERE NOT EXISTS(SELECT 1 FROM audit a WHERE a.org_id=s.org_id AND a.site_id=s.id
        AND a.actor_type='system' AND a.actor_id='restore-operator' AND a.action='backup.restore.quarantined' AND a.object_id=backup::text)))
$$;

CREATE FUNCTION guard_restore_privacy_retirement() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE identity jsonb; receipt jsonb; policy jsonb; matched boolean:=false; retired timestamptz; accepted timestamptz; days integer;
BEGIN
  identity:=NEW.source_identity_json;receipt:=NEW.source_receipt_json;policy:=NEW.source_policy_json;
  IF NOT restore_privacy_quarantined(NEW.backup_id) OR NEW.source_captured_at>clock_timestamp()
    OR identity->>'org_id' IS DISTINCT FROM NEW.org_id OR identity->>'site_id' IS DISTINCT FROM NEW.site_id
    OR receipt->>'org_id' IS DISTINCT FROM NEW.org_id OR receipt->>'site_id' IS DISTINCT FROM NEW.site_id THEN
    RAISE EXCEPTION 'Restore privacy provenance or quarantine unavailable';
  END IF;
  CASE NEW.kind
    WHEN 'attempt-text' THEN
      SELECT EXISTS(SELECT 1 FROM attempts r WHERE r.id=NEW.reference_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
        AND r.id=identity->>'id' AND r.assignment_id=identity->>'assignment_id' AND r.submission_id=identity->>'submission_id'
        AND r.received_at=(identity->>'received_at')::timestamptz) INTO matched;
      accepted:=(identity->>'received_at')::timestamptz;
    WHEN 'recording-text','recording-audio' THEN
      SELECT EXISTS(SELECT 1 FROM recordings r WHERE r.id=NEW.reference_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
        AND r.id=identity->>'id' AND r.assignment_id=identity->>'assignment_id' AND r.submission_id=identity->>'submission_id'
        AND r.sha256=identity->>'sha256' AND r.bytes=(identity->>'bytes')::integer
        AND r.received_at IS NOT DISTINCT FROM (identity->>'received_at')::timestamptz) INTO matched;
      accepted:=(identity->>'received_at')::timestamptz;
    WHEN 'case-content' THEN
      SELECT EXISTS(SELECT 1 FROM clarifications c WHERE c.id=NEW.reference_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id
        AND c.id=identity->>'id' AND c.assignment_id=identity->>'assignment_id' AND c.attempt_id IS NOT DISTINCT FROM identity->>'attempt_id'
        AND c.created_at=(identity->>'created_at')::timestamptz) INTO matched;
      accepted:=(identity->>'resolved_at')::timestamptz;
      IF identity->>'status' IS DISTINCT FROM 'resolved' THEN matched:=false; END IF;
    WHEN 'generated-audio' THEN
      SELECT EXISTS(SELECT 1 FROM generated_bundles b WHERE b.id::text=NEW.reference_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id
        AND b.id::text=identity->>'id' AND b.briefing_id=identity->>'briefing_id' AND b.revision=(identity->>'revision')::integer
        AND b.manifest_hash=identity->>'manifest_hash' AND b.dependency_hash=identity->>'dependency_hash'
        AND b.stored_at=(identity->>'stored_at')::timestamptz) INTO matched;
      accepted:=(identity->>'stored_at')::timestamptz;
    WHEN 'source-audio' THEN
      SELECT EXISTS(SELECT 1 FROM source_audio_requests r WHERE r.request_id=NEW.reference_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
        AND r.id=identity->>'id' AND r.request_id=identity->>'request_id' AND r.sha256=identity->>'sha256' AND r.bytes=(identity->>'bytes')::integer
        AND r.original_id=identity->>'original_id' AND r.original_sha256=identity->>'original_sha256' AND r.original_bytes=(identity->>'original_bytes')::integer
        AND r.received_at IS NOT DISTINCT FROM (identity->>'received_at')::timestamptz) INTO matched;
    WHEN 'followup-audio' THEN
      SELECT EXISTS(SELECT 1 FROM case_followup_audio r WHERE r.id=NEW.reference_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
        AND r.id=identity->>'id' AND r.request_id=identity->>'request_id' AND r.sha256=identity->>'sha256' AND r.bytes=(identity->>'bytes')::integer
        AND r.job_lease=identity->>'job_lease' AND r.text_hash=identity->>'text_hash' AND r.created_at=(identity->>'created_at')::timestamptz) INTO matched;
    WHEN 'case-voice' THEN
      SELECT EXISTS(SELECT 1 FROM case_voice r WHERE r.id=NEW.reference_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
        AND r.id=identity->>'id' AND r.assignment_id=identity->>'assignment_id' AND r.worker_id=identity->>'worker_id'
        AND r.sha256=identity->>'sha256' AND r.bytes=(identity->>'bytes')::integer
        AND r.received_at IS NOT DISTINCT FROM (identity->>'received_at')::timestamptz) INTO matched;
  END CASE;
  IF NOT matched THEN RAISE EXCEPTION 'Restore privacy immutable input mismatch'; END IF;
  IF NEW.kind IN ('attempt-text','recording-text','case-content','generated-audio') THEN
    days:=(receipt->>'days')::integer;retired:=COALESCE(receipt->>'completed_at',receipt->>'retired_at')::timestamptz;
    IF days IS NULL OR days NOT IN (7,30,90,365) OR accepted IS NULL OR retired IS NULL OR accepted>retired-days*interval '1 day'
      OR retired>NEW.source_captured_at OR policy IS NULL OR policy->>'org_id' IS DISTINCT FROM NEW.org_id
      OR policy->>'site_id' IS DISTINCT FROM NEW.site_id OR (policy->>'revision')::integer IS DISTINCT FROM (receipt->>'policy_revision')::integer
      OR policy->'request_json'->>'confirmed' IS DISTINCT FROM 'true' OR (policy->'request_json'->>'days')::integer IS DISTINCT FROM days
      OR (policy->'request_json'->>'revision')::integer IS DISTINCT FROM (policy->>'revision')::integer-1
      OR (policy->>'created_at')::timestamptz>retired THEN RAISE EXCEPTION 'Restore privacy original policy evidence unavailable'; END IF;
    CASE NEW.kind
      WHEN 'attempt-text','recording-text' THEN
        SELECT EXISTS(SELECT 1 FROM text_retention_requests r WHERE to_jsonb(r)=policy) INTO matched;
        IF receipt->>'kind' IS DISTINCT FROM (CASE NEW.kind WHEN 'attempt-text' THEN 'attempt' ELSE 'recording' END)
          OR receipt->>'reference_id' IS DISTINCT FROM NEW.reference_id OR receipt->>'assignment_id' IS DISTINCT FROM identity->>'assignment_id' THEN matched:=false; END IF;
      WHEN 'case-content' THEN
        SELECT EXISTS(SELECT 1 FROM case_retention_requests r WHERE to_jsonb(r)=policy) INTO matched;
        IF receipt->>'case_id' IS DISTINCT FROM NEW.reference_id OR receipt->>'assignment_id' IS DISTINCT FROM identity->>'assignment_id'
          OR EXISTS(SELECT 1 FROM case_messages WHERE case_id=NEW.reference_id AND created_at>retired-days*interval '1 day')
          OR EXISTS(SELECT 1 FROM case_followups WHERE case_id=NEW.reference_id AND GREATEST(created_at,delivered_at)>retired-days*interval '1 day')
          OR EXISTS(SELECT 1 FROM case_reviews WHERE case_id=NEW.reference_id AND created_at>retired-days*interval '1 day')
          OR EXISTS(SELECT 1 FROM case_voice WHERE requested_case_id=NEW.reference_id AND GREATEST(created_at,received_at)>retired-days*interval '1 day') THEN matched:=false; END IF;
      WHEN 'generated-audio' THEN
        SELECT EXISTS(SELECT 1 FROM generated_retention_requests r WHERE to_jsonb(r)=policy) INTO matched;
        IF receipt->>'bundle_id' IS DISTINCT FROM NEW.reference_id THEN matched:=false; END IF;
    END CASE;
    IF NOT matched THEN RAISE EXCEPTION 'Restore privacy original receipt mismatch'; END IF;
  ELSE
    retired:=(receipt->>'created_at')::timestamptz;
    IF retired IS NULL OR retired>NEW.source_captured_at THEN RAISE EXCEPTION 'Restore audio retirement time unavailable'; END IF;
    IF NEW.kind='recording-audio' AND receipt->>'recording_id' IS DISTINCT FROM NEW.reference_id
      OR NEW.kind='source-audio' AND receipt->>'request_id' IS DISTINCT FROM NEW.reference_id
      OR NEW.kind IN ('followup-audio','case-voice') AND receipt->>'id' IS DISTINCT FROM NEW.reference_id THEN
      RAISE EXCEPTION 'Restore audio retirement receipt mismatch';
    END IF;
    IF NEW.kind IN ('recording-audio','source-audio') AND COALESCE(receipt->>'status','') NOT IN ('queued','processing','complete')
      OR NEW.kind='source-audio' AND COALESCE(receipt->>'reason','') NOT IN ('audio_retention','staged_expired')
      OR NEW.kind='followup-audio' AND COALESCE(receipt->>'state','') NOT IN ('attached','cleaning','cleaned')
      OR NEW.kind='case-voice' AND COALESCE(receipt->>'cleanup_state','') NOT IN ('active','cleaning','cleaned') THEN
      RAISE EXCEPTION 'Restore audio retirement state unavailable';
    END IF;
    IF NEW.kind='followup-audio' AND receipt->>'state'='attached' AND NOT EXISTS(
      SELECT 1 FROM case_followups f JOIN assignments a ON a.id=f.assignment_id WHERE f.id=identity->>'request_id'
        AND (EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=f.case_id) OR EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=a.worker_id)))
      OR NEW.kind='case-voice' AND receipt->>'cleanup_state'='active' AND NOT EXISTS(
        SELECT 1 FROM case_voice v WHERE v.id=NEW.reference_id AND (EXISTS(SELECT 1 FROM case_content_purges WHERE case_id=v.requested_case_id)
          OR EXISTS(SELECT 1 FROM worker_deletion_requests WHERE worker_id=v.worker_id))) THEN
      RAISE EXCEPTION 'Restore parent audio retirement unavailable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restore_privacy_retirement_scope BEFORE INSERT ON restore_privacy_retirements
  FOR EACH ROW EXECUTE FUNCTION guard_restore_privacy_retirement();

CREATE FUNCTION restored_privacy_receipt_matches(wanted_kind text,wanted_reference text,wanted_org text,wanted_site text,wanted_receipt jsonb) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM restore_privacy_retirements p WHERE p.kind=wanted_kind AND p.reference_id=wanted_reference AND p.org_id=wanted_org AND p.site_id=wanted_site
    AND restore_privacy_quarantined(p.backup_id)
    AND COALESCE(wanted_receipt->>'completed_at',wanted_receipt->>'retired_at')::timestamptz BETWEEN p.imported_at AND clock_timestamp()
    AND (p.source_receipt_json-ARRAY['completed_at','retired_at'])=(wanted_receipt-ARRAY['completed_at','retired_at']))
$$;

CREATE OR REPLACE FUNCTION guard_text_retention_purge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_time timestamptz;
BEGIN
  IF NEW.kind='attempt' THEN
    SELECT received_at INTO receipt_time FROM attempts WHERE id=NEW.reference_id AND org_id=NEW.org_id AND site_id=NEW.site_id AND assignment_id=NEW.assignment_id;
  ELSE
    SELECT received_at INTO receipt_time FROM recordings WHERE id=NEW.reference_id AND org_id=NEW.org_id AND site_id=NEW.site_id AND assignment_id=NEW.assignment_id;
  END IF;
  IF receipt_time IS NULL OR NOT (EXISTS(SELECT 1 FROM text_retention_policies WHERE org_id=NEW.org_id AND site_id=NEW.site_id
      AND revision=NEW.policy_revision AND days=NEW.days AND receipt_time<=clock_timestamp()-days*interval '1 day')
    OR restored_privacy_receipt_matches(NEW.kind||'-text',NEW.reference_id,NEW.org_id,NEW.site_id,to_jsonb(NEW))) THEN
    RAISE EXCEPTION 'Text retention scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_case_content_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Case retention evidence is immutable'; END IF;
  IF NOT (EXISTS(SELECT 1 FROM clarifications c JOIN case_retention_policies p ON p.org_id=c.org_id AND p.site_id=c.site_id
    WHERE c.id=NEW.case_id AND c.org_id=NEW.org_id AND c.site_id=NEW.site_id AND c.assignment_id=NEW.assignment_id
      AND c.status='resolved' AND c.resolved_at<=clock_timestamp()-p.days*interval '1 day' AND p.revision=NEW.policy_revision AND p.days=NEW.days
      AND NOT EXISTS(SELECT 1 FROM case_messages m WHERE m.case_id=c.id AND m.created_at>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_followups f WHERE f.case_id=c.id AND GREATEST(f.created_at,f.delivered_at)>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_reviews r WHERE r.case_id=c.id AND r.created_at>clock_timestamp()-p.days*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM case_voice v WHERE v.requested_case_id=c.id AND GREATEST(v.created_at,v.received_at)>clock_timestamp()-p.days*interval '1 day'))
    OR restored_privacy_receipt_matches('case-content',NEW.case_id,NEW.org_id,NEW.site_id,to_jsonb(NEW))) THEN
    RAISE EXCEPTION 'Case retention scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_generated_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM generated_bundles b WHERE b.id=NEW.bundle_id AND b.org_id=NEW.org_id AND b.site_id=NEW.site_id AND b.state='attached'
    AND (EXISTS(SELECT 1 FROM generated_retention_policies p WHERE p.org_id=b.org_id AND p.site_id=b.site_id
      AND b.stored_at<=clock_timestamp()-p.days*interval '1 day' AND p.days=NEW.days AND p.revision=NEW.policy_revision)
      OR restored_privacy_receipt_matches('generated-audio',NEW.bundle_id::text,NEW.org_id,NEW.site_id,to_jsonb(NEW)))) THEN
    RAISE EXCEPTION 'Generated audio retirement scope or policy unavailable';
  END IF;
  RETURN NEW;
END $$;
