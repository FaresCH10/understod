CREATE TABLE preparation_stage_events (
  job_id text NOT NULL,
  org_id text NOT NULL,
  site_id text NOT NULL,
  briefing_id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  run_id uuid NOT NULL,
  step integer NOT NULL CHECK(step BETWEEN 0 AND 101),
  stage text NOT NULL CHECK(stage IN ('worker','preparation','grounding_check','translation','translation_check','speech','storage','finalization')),
  language text CHECK(language IN ('en','ar','ur')),
  track text CHECK(track IN ('body','question')),
  state text NOT NULL CHECK(state IN ('started','completed','reused','failed')),
  origin text NOT NULL CHECK(origin IN ('generated','retained','override','cache','system')),
  error_code text CHECK(error_code IN ('preparation_failed','grounding_check_failed','translation_failed','translation_check_failed','speech_failed',
    'invalid_preparation','invalid_preparation_check','invalid_grounding_evidence','invalid_question_evidence','ambiguous_source',
    'ungrounded_preparation','preparation_check_failed','question_alignment_failed','invalid_translation','invalid_translation_check',
    'translation_check_failed','invalid_speech','speech_bundle_exceeds_limit','manifest_exceeds_limit','regeneration_dependencies_changed',
    'invalid_regeneration','invalid_bundle','invalid_bundle_audio','invalid_manifest','invalid_dependencies','invalid_speech_reference',
    'invalid_bundle_input','invalid_review','invalid_glossary','invalid_provider','translation_language_unavailable','language_capability_unavailable',
    'terminology_exceeds_limit','obsolete_or_unauthorized','preparation_unavailable')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,run_id,step,state),
  FOREIGN KEY(job_id,org_id,site_id,briefing_id,revision) REFERENCES jobs(id,org_id,site_id,briefing_id,revision),
  CHECK((stage='speech' AND track IS NOT NULL AND language IS NOT NULL) OR (stage<>'speech' AND track IS NULL)),
  CHECK((stage IN ('worker','storage','finalization') AND language IS NULL AND origin='system')
    OR (stage NOT IN ('worker','storage','finalization') AND language IS NOT NULL)),
  CHECK((state='failed' AND error_code IS NOT NULL) OR (state<>'failed' AND error_code IS NULL)),
  CHECK((state='reused' AND origin IN ('retained','override','cache')) OR (state<>'reused' AND origin IN ('generated','system'))),
  CHECK((stage='worker' AND step=0) OR (stage='storage' AND step=100) OR (stage='finalization' AND step=101)
    OR (stage NOT IN ('worker','storage','finalization') AND step BETWEEN 1 AND 64))
);

CREATE FUNCTION protect_preparation_stage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Preparation stage evidence is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER preparation_stage_frozen BEFORE UPDATE OR DELETE ON preparation_stage_events
  FOR EACH ROW EXECUTE FUNCTION protect_preparation_stage();
CREATE INDEX preparation_stage_scope ON preparation_stage_events(org_id,site_id,job_id,occurred_at);
