CREATE TABLE restore_briefing_redactions (
  briefing_id text PRIMARY KEY,org_id text NOT NULL,site_id text NOT NULL,
  backup_id uuid NOT NULL,ledger_id uuid NOT NULL,ledger_fingerprint text NOT NULL CHECK(ledger_fingerprint ~ '^[a-f0-9]{64}$'),
  source_origin_json jsonb NOT NULL CHECK(jsonb_typeof(source_origin_json)='object' AND octet_length(source_origin_json::text)<=3145728),
  source_captured_at timestamptz NOT NULL,imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(briefing_id,org_id,site_id) REFERENCES briefings(id,org_id,site_id)
);
CREATE TRIGGER restore_briefing_redactions_frozen BEFORE UPDATE OR DELETE ON restore_briefing_redactions
  FOR EACH ROW EXECUTE FUNCTION protect_settings_receipt();

CREATE FUNCTION briefing_origin_valid(origin jsonb) RETURNS boolean LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE context jsonb:=origin->'context_json'; receipt jsonb:=origin->'source_receipt_json'; policy jsonb:=origin->'source_policy_json';
  shapes jsonb:='{"briefing":["id","org_id","site_id","revision","next_version","state","created_at","updated_at"],"archive":["request_id","org_id","site_id","briefing_id","request_sha256","publication_ids","archived_by","occurred_at"],"publications":["id","org_id","site_id","briefing_id","version","state","published_at"],"assignments":["id","org_id","site_id","publication_id","worker_id","language","due_at","created_at"],"attempts":["id","org_id","site_id","assignment_id","submission_id","assessment_status","outcome","received_at","text_expired"],"recordings":["id","org_id","site_id","assignment_id","submission_id","status","sha256","bytes","received_at"],"clarifications":["id","org_id","site_id","assignment_id","attempt_id","status","created_at","resolved_at"],"generated_bundles":["id","org_id","site_id","briefing_id","revision","manifest_hash","dependency_hash","state","removed_at"],"jobs":["id","org_id","site_id","briefing_id","revision","kind","status"],"schedules":["id","org_id","site_id","briefing_id","state","publication_id","created_at","finished_at"]}';
  kind text; keys text[]; rows jsonb; row_data jsonb; cell record; proofs record; completed timestamptz; cutoff timestamptz;
BEGIN
  IF jsonb_typeof(origin) IS DISTINCT FROM 'object' OR origin-ARRAY['briefing_id','org_id','site_id','context_json','source_receipt_json','source_policy_json','captured_at']<>'{}'
    OR jsonb_typeof(context) IS DISTINCT FROM 'object' OR context-ARRAY(SELECT jsonb_object_keys(shapes))<>'{}'
    OR (SELECT count(*) FROM jsonb_object_keys(context))<>10
    OR receipt-ARRAY['briefing_id','org_id','site_id','policy_revision','days','proofs_json','completed_at']<>'{}'
    OR (receipt->>'briefing_id',receipt->>'org_id',receipt->>'site_id') IS DISTINCT FROM (origin->>'briefing_id',origin->>'org_id',origin->>'site_id')
    OR (receipt->>'days')::integer NOT IN (7,30,90,365) OR (receipt->>'policy_revision')::integer<1
    OR policy->>'org_id' IS DISTINCT FROM origin->>'org_id' OR policy->>'site_id' IS DISTINCT FROM origin->>'site_id'
    OR (policy->>'revision')::integer IS DISTINCT FROM (receipt->>'policy_revision')::integer
    OR policy->'request_json' IS DISTINCT FROM jsonb_build_object('revision',(receipt->>'policy_revision')::integer-1,'days',(receipt->>'days')::integer,'confirmed',true)
    OR (origin->>'captured_at')::timestamptz IS NULL OR (origin->>'captured_at')::timestamptz>clock_timestamp() THEN RETURN false; END IF;
  completed:=(receipt->>'completed_at')::timestamptz;cutoff:=completed-(receipt->>'days')::integer*interval '1 day';
  IF completed IS NULL OR completed>(origin->>'captured_at')::timestamptz
    OR (policy->>'created_at')::timestamptz IS NULL OR (policy->>'created_at')::timestamptz>completed
    OR jsonb_typeof(receipt->'proofs_json') IS DISTINCT FROM 'object'
    OR receipt->'proofs_json'->'briefings'->>(origin->>'briefing_id') IS NULL THEN RETURN false; END IF;
  FOR proofs IN SELECT * FROM jsonb_each(receipt->'proofs_json') LOOP
    IF proofs.key NOT IN ('briefings','publications','draft_reviews','briefing_review_requests','briefing_regeneration_requests','generated_bundles','briefing_copies','source_audio_requests')
      OR jsonb_typeof(proofs.value)<>'object' THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each_text(proofs.value) WHERE length(key) NOT BETWEEN 1 AND 100 OR value !~ '^[a-f0-9]{64}$') THEN RETURN false; END IF;
  END LOOP;
  FOR kind IN SELECT jsonb_object_keys(shapes) LOOP
    keys:=ARRAY(SELECT jsonb_array_elements_text(shapes->kind));
    rows:=CASE WHEN kind IN ('briefing','archive') THEN jsonb_build_array(context->kind) ELSE context->kind END;
    IF jsonb_typeof(rows) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    FOR row_data IN SELECT jsonb_array_elements(rows) LOOP
      IF jsonb_typeof(row_data) IS DISTINCT FROM 'object' OR row_data-keys<>'{}' OR (SELECT count(*) FROM jsonb_object_keys(row_data))<>cardinality(keys)
        OR row_data->>'org_id' IS DISTINCT FROM origin->>'org_id' OR row_data->>'site_id' IS DISTINCT FROM origin->>'site_id'
        OR row_data ? 'briefing_id' AND row_data->>'briefing_id' IS DISTINCT FROM origin->>'briefing_id'
        OR length(COALESCE(row_data->>'id',row_data->>'request_id','')) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
      FOR cell IN SELECT * FROM jsonb_each(row_data) LOOP
        IF cell.key='publication_ids' THEN
          IF jsonb_typeof(cell.value)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(cell.value) v WHERE jsonb_typeof(v)<>'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 100) THEN RETURN false; END IF;
        ELSIF jsonb_typeof(cell.value) NOT IN ('null','string','number','boolean') OR jsonb_typeof(cell.value)='string' AND length(cell.value#>>'{}')>100 THEN RETURN false;
        END IF;
        IF cell.key IN ('created_at','updated_at','published_at','received_at','occurred_at') AND cell.value='null'::jsonb THEN RETURN false; END IF;
        IF cell.key~'_at$' AND cell.key<>'due_at' AND cell.value<>'null'::jsonb AND (cell.value#>>'{}')::timestamptz>completed THEN RETURN false; END IF;
        IF cell.key~'(sha256|_hash)$' AND COALESCE(cell.value#>>'{}','') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(rows))<>(SELECT count(DISTINCT COALESCE(v->>'id',v->>'request_id')) FROM jsonb_array_elements(rows) v) THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(context->'archive'->'publication_ids') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'publications') r WHERE r->>'id'=p#>>'{}'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'assignments') a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'publications') p WHERE p->>'id'=a->>'publication_id'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'attempts') a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'assignments') r WHERE r->>'id'=a->>'assignment_id'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'recordings') a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'assignments') r WHERE r->>'id'=a->>'assignment_id'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'clarifications') a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'assignments') r WHERE r->>'id'=a->>'assignment_id')
      OR a->>'attempt_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'attempts') r WHERE r->>'id'=a->>'attempt_id'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(context->'schedules') a WHERE a->>'publication_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'publications') p WHERE p->>'id'=a->>'publication_id'))
    THEN RETURN false; END IF;
  RETURN context->'briefing'->>'id'=origin->>'briefing_id' AND (context->'briefing'->>'revision')::integer>0 AND (context->'briefing'->>'next_version')::integer>0
    AND (context->'archive'->>'occurred_at')::timestamptz IS NOT NULL AND (context->'archive'->>'occurred_at')::timestamptz<=cutoff
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'publications') r WHERE r->>'state' NOT IN ('archived','superseded','withdrawn'))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'jobs') r WHERE r->>'status' IN ('queued','processing'))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'schedules') r WHERE r->>'state'='queued')
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'attempts') r WHERE (r->>'assessment_status'<>'complete' AND r->>'text_expired' IS DISTINCT FROM 'true') OR (r->>'received_at')::timestamptz IS NULL OR (r->>'received_at')::timestamptz>cutoff)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'recordings') r WHERE r->>'status' IN ('storing','received','processing') OR (r->>'received_at')::timestamptz>cutoff)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'clarifications') r WHERE r->>'status' IS DISTINCT FROM 'resolved' OR (r->>'resolved_at')::timestamptz IS NULL OR (r->>'resolved_at')::timestamptz>cutoff)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'generated_bundles') r WHERE r->>'state' IS DISTINCT FROM 'cleaned' OR (r->>'removed_at')::timestamptz IS NULL);
END $$;

CREATE FUNCTION briefing_origin_target_matches(origin jsonb) RETURNS boolean LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE target jsonb:=briefing_expiry_context(origin->>'briefing_id',origin->>'org_id',origin->>'site_id'); source jsonb:=origin->'context_json';
  bindings jsonb:='{"publications":["id","org_id","site_id","briefing_id","version","published_at"],"assignments":["id","org_id","site_id","publication_id","worker_id","language","created_at"],"attempts":["id","org_id","site_id","assignment_id","submission_id","received_at"],"recordings":["id","org_id","site_id","assignment_id","submission_id","sha256","bytes","received_at"],"clarifications":["id","org_id","site_id","assignment_id","attempt_id","created_at"],"generated_bundles":["id","org_id","site_id","briefing_id","revision","manifest_hash","dependency_hash"],"jobs":["id","org_id","site_id","briefing_id","revision","kind"],"schedules":["id","org_id","site_id","briefing_id","created_at"]}';
  kind text; row_data jsonb; original jsonb; key text;
BEGIN
  IF target->'briefing' IS NULL OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','org_id','site_id','revision','next_version','created_at']) k WHERE target->'briefing'->k IS DISTINCT FROM source->'briefing'->k) THEN RETURN false; END IF;
  FOR kind IN SELECT jsonb_object_keys(bindings) LOOP
    FOR row_data IN SELECT jsonb_array_elements(target->kind) LOOP
      SELECT v INTO original FROM jsonb_array_elements(source->kind) v WHERE v->>'id'=row_data->>'id';
      IF original IS NULL THEN RETURN false; END IF;
      FOR key IN SELECT jsonb_array_elements_text(bindings->kind) LOOP
        IF row_data->key IS DISTINCT FROM original->key THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION guard_restore_briefing_redaction() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE origin jsonb:=NEW.source_origin_json; receipt jsonb:=origin->'source_receipt_json';
BEGIN
  IF NOT restore_privacy_quarantined(NEW.backup_id) OR briefing_origin_valid(origin) IS DISTINCT FROM true OR briefing_origin_target_matches(origin) IS DISTINCT FROM true
    OR (origin->>'briefing_id',origin->>'org_id',origin->>'site_id') IS DISTINCT FROM (NEW.briefing_id,NEW.org_id,NEW.site_id)
    OR NEW.source_captured_at<(origin->>'captured_at')::timestamptz OR NEW.source_captured_at>clock_timestamp()
    OR NEW.imported_at<transaction_timestamp() OR NEW.imported_at>clock_timestamp() OR NEW.imported_at<NEW.source_captured_at
    OR NOT EXISTS(SELECT 1 FROM briefing_retention_requests p WHERE to_jsonb(p)=origin->'source_policy_json')
    OR NOT (receipt->'proofs_json' @> briefing_content_proofs(NEW.briefing_id,NEW.org_id,NEW.site_id))
    OR EXISTS(SELECT 1 FROM briefing_content_purges WHERE briefing_id=NEW.briefing_id)
    OR EXISTS(SELECT 1 FROM generated_bundles g WHERE g.briefing_id=NEW.briefing_id AND (g.state<>'cleaned' OR NOT EXISTS(SELECT 1 FROM generated_audio_removals r WHERE r.bundle_id=g.id))) THEN
    RAISE EXCEPTION 'Original briefing restore proof, target content, fresh cleanup or quarantine unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restore_briefing_redaction_scope BEFORE INSERT ON restore_briefing_redactions FOR EACH ROW EXECUTE FUNCTION guard_restore_briefing_redaction();

CREATE OR REPLACE FUNCTION guard_briefing_content_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proofs_json IS DISTINCT FROM briefing_content_proofs(NEW.briefing_id,NEW.org_id,NEW.site_id) OR (
    NOT EXISTS(SELECT 1 FROM briefing_retention_policies p WHERE p.org_id=NEW.org_id AND p.site_id=NEW.site_id AND p.revision=NEW.policy_revision AND p.days=NEW.days AND briefing_content_due(NEW.briefing_id,NEW.org_id,NEW.site_id,p.days))
    AND NOT EXISTS(SELECT 1 FROM restore_briefing_redactions r WHERE r.briefing_id=NEW.briefing_id AND r.org_id=NEW.org_id AND r.site_id=NEW.site_id
      AND restore_privacy_quarantined(r.backup_id) AND (r.source_origin_json->'source_receipt_json'->>'policy_revision')::integer=NEW.policy_revision
      AND (r.source_origin_json->'source_receipt_json'->>'days')::integer=NEW.days AND r.source_origin_json->'source_receipt_json'->'proofs_json' @> NEW.proofs_json)) THEN
    RAISE EXCEPTION 'Briefing content retention scope, policy or proofs unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION capture_briefing_content_origin() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE policy jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM restore_briefing_redactions r WHERE r.briefing_id=NEW.briefing_id AND restore_privacy_quarantined(r.backup_id)) THEN RETURN NEW; END IF;
  SELECT to_jsonb(r) INTO policy FROM briefing_retention_requests r WHERE r.org_id=NEW.org_id AND r.site_id=NEW.site_id
    AND r.revision=NEW.policy_revision AND r.request_json=jsonb_build_object('revision',r.revision-1,'days',NEW.days,'confirmed',true);
  IF policy IS NULL OR (SELECT count(*) FROM briefing_retention_requests r WHERE r.org_id=NEW.org_id AND r.site_id=NEW.site_id
    AND r.revision=NEW.policy_revision)<>1 THEN RAISE EXCEPTION 'Original briefing expiry policy receipt unavailable or ambiguous'; END IF;
  INSERT INTO briefing_content_origins(briefing_id,org_id,site_id,context_json,source_receipt_json,source_policy_json)
    VALUES(NEW.briefing_id,NEW.org_id,NEW.site_id,briefing_expiry_context(NEW.briefing_id,NEW.org_id,NEW.site_id),to_jsonb(NEW),policy);
  RETURN NEW;
END $$;
-- Separate source capture from restored erasure; root evidence lives in the restore journal.
CREATE FUNCTION require_restore_briefing_redacted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT restore_privacy_quarantined(NEW.backup_id) OR NOT EXISTS(SELECT 1 FROM briefing_content_purges p
    WHERE p.briefing_id=NEW.briefing_id AND p.org_id=NEW.org_id AND p.site_id=NEW.site_id AND p.completed_at>=NEW.imported_at
      AND p.policy_revision=(NEW.source_origin_json->'source_receipt_json'->>'policy_revision')::integer
      AND p.days=(NEW.source_origin_json->'source_receipt_json'->>'days')::integer
      AND NEW.source_origin_json->'source_receipt_json'->'proofs_json' @> p.proofs_json) THEN
    RAISE EXCEPTION 'Restored briefing physical redaction incomplete or quarantine unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER restore_briefing_redaction_complete AFTER INSERT ON restore_briefing_redactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_restore_briefing_redacted();

CREATE FUNCTION publication_content_available(wanted_id text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM publications p WHERE p.id=wanted_id AND NOT EXISTS(SELECT 1 FROM briefing_content_purges r WHERE r.briefing_id=p.briefing_id))
$$;
CREATE FUNCTION assignment_content_available(wanted_id text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS(SELECT 1 FROM assignments a WHERE a.id=wanted_id AND publication_content_available(a.publication_id))
$$;
CREATE FUNCTION reject_expired_briefing_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM assignments a JOIN publications p ON p.id=a.publication_id JOIN briefing_content_purges r ON r.briefing_id=p.briefing_id
    WHERE a.id=NEW.assignment_id) THEN RAISE EXCEPTION 'Expired briefing cannot accept new work'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expired_briefing_attempt BEFORE INSERT ON attempts FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_recording BEFORE INSERT ON recordings FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_submission BEFORE INSERT ON submission_receipts FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_case BEFORE INSERT ON clarifications FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_help BEFORE INSERT ON help_requests FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_message BEFORE INSERT ON case_messages FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_followup BEFORE INSERT ON case_followups FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_voice BEFORE INSERT ON case_voice FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();
CREATE TRIGGER expired_briefing_repeat BEFORE INSERT ON case_repeats FOR EACH ROW EXECUTE FUNCTION reject_expired_briefing_work();

ALTER TABLE operational_audit_receipts DROP CONSTRAINT operational_audit_receipts_action_check;
ALTER TABLE operational_audit_receipts ADD CHECK(action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
  'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
  'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings'));
CREATE OR REPLACE FUNCTION capture_operational_audit_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('worker.disabled','credential.recovered','backup.restore.quarantined',
    'backup.restore.elapsed_policies_reconciled','backup.restore.privacy.deletions','backup.restore.privacy.policies',
    'backup.restore.privacy.restrictions','backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings') THEN
    INSERT INTO operational_audit_receipts VALUES(NEW.id,NEW.org_id,NEW.site_id,NEW.actor_type,NEW.actor_id,NEW.action,NEW.object_id,NEW.occurred_at);
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION require_operational_activity_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM audit a WHERE a.id=NEW.event_id AND a.action IN
    ('worker.disabled','credential.recovered','backup.restore.quarantined','backup.restore.elapsed_policies_reconciled',
      'backup.restore.privacy.deletions','backup.restore.privacy.policies','backup.restore.privacy.restrictions',
      'backup.restore.privacy.retirements','backup.restore.privacy.activity','backup.restore.privacy.briefings')
    AND NOT EXISTS(SELECT 1 FROM operational_audit_receipts r WHERE
      (r.id,r.org_id,r.site_id,r.actor_type,r.actor_id,r.action,r.object_id,r.occurred_at)
        IS NOT DISTINCT FROM (a.id,a.org_id,a.site_id,a.actor_type,a.actor_id,a.action,a.object_id,a.occurred_at))) THEN
    RAISE EXCEPTION 'Operational provenance required before activity identity expiry';
  END IF;
  RETURN NEW;
END $$;
