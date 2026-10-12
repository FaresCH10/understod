ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE provider_operations ADD CHECK(kind IN ('source-transcription','connection-test','stage-test','case-followup','recording-transcription','recording-assessment','preparation','typed-assessment'));
ALTER TABLE provider_operations DROP CONSTRAINT provider_operations_check;
ALTER TABLE provider_operations ADD CHECK((kind IN ('connection-test','stage-test') AND org_id IS NULL AND claim_token IS NULL)
  OR (kind IN ('source-transcription','case-followup','recording-transcription','recording-assessment','preparation','typed-assessment') AND org_id IS NOT NULL AND claim_token IS NOT NULL));

ALTER TABLE provider_verifications ADD COLUMN test_stage text NOT NULL DEFAULT 'connection' CHECK(test_stage IN ('connection','translation','speech'));
ALTER TABLE provider_verifications ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar','ur'));
ALTER TABLE provider_verifications ADD COLUMN result_json jsonb CHECK(result_json IS NULL OR (jsonb_typeof(result_json)='object' AND octet_length(result_json::text)<=2000));
ALTER TABLE provider_verifications ADD COLUMN diagnostic_code text CHECK(diagnostic_code IS NULL OR diagnostic_code IN ('invalid_output','transport_uncertain','authority_changed','test_interrupted'));
ALTER TABLE provider_verifications ADD CHECK((test_stage='connection' AND language='en')
  OR (test_stage='translation' AND language IN ('ar','ur')) OR (test_stage='speech' AND language IN ('en','ar')));
ALTER TABLE provider_verifications ADD CHECK(test_stage='connection' OR request_json=jsonb_build_object('kind','provider-stage-verification','stage',test_stage,'language',language,'maxRequests',CASE WHEN test_stage='translation' THEN 2 ELSE 1 END,'confirmed',true));
ALTER TABLE provider_verifications ADD CHECK(result_json IS NULL OR (state='verified' AND diagnostic_code IS NULL));
ALTER TABLE provider_verifications ADD CHECK(test_stage='connection' OR state<>'verified' OR result_json IS NOT NULL);
CREATE INDEX provider_verifications_stage ON provider_verifications(config_hash,test_stage,language,created_at DESC);

CREATE OR REPLACE FUNCTION protect_provider_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='provider_operations' OR TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Provider evidence is immutable';
  END IF;
  IF TG_TABLE_NAME='provider_requests' THEN
    IF OLD.state<>'started' OR (NEW.id,NEW.operation_id,NEW.sequence,NEW.cleanup,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.operation_id,OLD.sequence,OLD.cleanup,OLD.created_at) THEN
      RAISE EXCEPTION 'Provider request evidence is immutable';
    END IF;
  ELSIF TG_TABLE_NAME='provider_verifications' THEN
    IF OLD.state<>'pending' OR (NEW.request_id,NEW.operator_id,NEW.session_hash,NEW.operation_id,NEW.config_hash,NEW.request_json,NEW.created_at,NEW.deadline_at,NEW.test_stage,NEW.language)
      IS DISTINCT FROM (OLD.request_id,OLD.operator_id,OLD.session_hash,OLD.operation_id,OLD.config_hash,OLD.request_json,OLD.created_at,OLD.deadline_at,OLD.test_stage,OLD.language) THEN
      RAISE EXCEPTION 'Provider verification evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
