import {withTransaction} from './db.mjs';
import {schemaName} from './migrate.mjs';
import {assessmentInput} from './assessment-claim.mjs';
import {assessmentInputHash} from '../ai/assessment-config.mjs';
import {bundleHash} from '../ai/prepared-bundle.mjs';
import {evaluationDataset,sampleInput,evaluationProvenance} from '../../evaluation/runner.mjs';
import {LOCAL_PROVENANCE} from '../../evaluation/evaluators.mjs';
import {validatedAssessment} from './assessment-worker.mjs';
import {recordingTranscriptionInputHash} from '../ai/audio-provenance.mjs';

export const UNKNOWN_EVALUATION_PROVENANCE=Object.freeze({adapter:'runtime-observation-v1',dataClass:'synthetic',model:'unavailable',
  promptVersion:'unavailable',schemaVersion:'unavailable'});
const scopedId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function evaluationBindings(value,dataset) {
  if(!Array.isArray(value) || !value.length || value.length>dataset.samples.length)throw Error('Invalid evaluation attempt bindings');
  const ids=new Set(),attempts=new Set();
  for(const binding of value) {
    const sample=dataset.samples.find(item=>item.id===binding?.sampleId);
    if(!binding || Object.keys(binding).length!==2 || !Object.hasOwn(binding,'sampleId') || !Object.hasOwn(binding,'attemptId')
      || !sample || sample.fixture!=='labeled_response' || !scopedId(binding.attemptId) || ids.has(binding.sampleId) || attempts.has(binding.attemptId))
      throw Error('Invalid evaluation attempt binding');
    ids.add(binding.sampleId);attempts.add(binding.attemptId);
  }
  return structuredClone(value);
}

export function readEvaluationObservations(pool,value,{orgId,siteId,bindings,confirmedSynthetic},{schema='public'}={}) {
  const dataset=evaluationDataset(value),mapping=evaluationBindings(bindings,dataset);
  if(confirmedSynthetic!==true || !scopedId(orgId) || !scopedId(siteId))throw Error('Confirm an isolated synthetic evaluation scope');
  schemaName(schema);
  return withTransaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SELECT set_config('search_path',quote_ident($1)||',pg_catalog',true),set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)",[schema]);
    const observations=[];
    for(const binding of mapping) {
      const row=(await client.query(`SELECT t.answer_text,t.assessment_status,t.outcome,t.reasons_json,t.evidence_json,
        a.language,a.publication_id,p.version,p.snapshot_json,j.status AS job_status,
        to_jsonb(rec) AS recording,to_jsonb(tr) AS transcription_operation,
        (SELECT count(*)::int FROM provider_requests r WHERE r.operation_id=tr.id AND r.sequence BETWEEN 1 AND 3 AND NOT r.cleanup AND r.state='accepted') AS transcription_inputs,
        o.id AS operation_id,o.input_hash,o.model,o.data_class,o.kind,o.reserved_requests,o.provenance_json,
        (SELECT count(*)::int FROM provider_requests r WHERE r.operation_id=o.id) AS request_count,
        (SELECT count(*)::int FROM provider_requests r WHERE r.operation_id=o.id AND r.state='accepted') AS accepted_requests
        FROM attempts t
        JOIN assignments a ON a.id=t.assignment_id AND a.org_id=t.org_id AND a.site_id=t.site_id
        JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
        LEFT JOIN assessment_jobs j ON j.attempt_id=t.id AND j.assignment_id=t.assignment_id AND j.org_id=t.org_id AND j.site_id=t.site_id
        LEFT JOIN recordings rec ON rec.assignment_id=t.assignment_id AND rec.submission_id=t.submission_id AND rec.org_id=t.org_id AND rec.site_id=t.site_id
        LEFT JOIN provider_operations o ON o.id=COALESCE(j.provider_operation_id,rec.assessment_operation_id)
          AND o.org_id=t.org_id AND o.reference_id=COALESCE(j.id,rec.id)
        LEFT JOIN provider_operations tr ON tr.id=rec.transcription_operation_id AND tr.org_id=rec.org_id AND tr.reference_id=rec.id
        WHERE t.id=$1 AND t.org_id=$2 AND t.site_id=$3`,[binding.attemptId,orgId,siteId])).rows[0];
      if(!row || !scopedId(row.publication_id))throw Error('Evaluation attempt unavailable');
      const sample=dataset.samples.find(item=>item.id===binding.sampleId),fixtureInput=sampleInput(dataset,sample),publication=dataset.publications.find(item=>item.id===fixtureInput.publicationId);
      const input={...fixtureInput,publicationId:row.publication_id};
      // Even a synthetic confirmation cannot authorize reporting arbitrary worker content.
      if(assessmentInputHash(assessmentInput(row))!==assessmentInputHash(input) || typeof row.snapshot_json?.source!=='string'
        || bundleHash(row.snapshot_json.source)!==bundleHash(publication.source))
        throw Error('Evaluation attempt does not match the exact synthetic fixture');
      let provenance=UNKNOWN_EVALUATION_PROVENANCE,status='pending',assessment,transcriptionEvidence;
      if(row.assessment_status==='complete') {
        const recorded=!!row.recording;
        if(recorded ? row.job_status || row.recording.status!=='transcribed' || row.recording.transcript!==input.answer
          : row.job_status!=='complete')throw Error('Evaluation completion provenance unavailable');
        if(row.operation_id) {
          if(row.kind!==(recorded?'recording-assessment':'typed-assessment') || row.data_class!=='synthetic' || row.input_hash!==assessmentInputHash(input)
            || row.reserved_requests!==1 || row.request_count!==1 || row.accepted_requests!==1)throw Error('Evaluation provider evidence unavailable');
          provenance=evaluationProvenance(row.provenance_json);
          if(provenance.model!==row.model)throw Error('Evaluation provider model mismatch');
          if(recorded) {
            const operation=row.transcription_operation;
            if(!operation || operation.kind!=='recording-transcription' || operation.data_class!=='synthetic' || operation.reserved_requests!==4
              || row.transcription_inputs!==3 || operation.input_hash!==recordingTranscriptionInputHash(row.recording,input))
              throw Error('Evaluation transcription provenance unavailable');
            const transcription=evaluationProvenance(operation.provenance_json);
            if(transcription.model!==operation.model)throw Error('Evaluation transcription model mismatch');
            transcriptionEvidence={inputHash:operation.input_hash,provenance:transcription};
          }
        }else {
          if(recorded || row.snapshot_json.provenance?.adapter!=='synthetic-local-v1')throw Error('Evaluation provider provenance unavailable');
          provenance=LOCAL_PROVENANCE;
        }
        status='completed';assessment=validatedAssessment({outcome:row.outcome,reasons:row.reasons_json,evidence:row.evidence_json},input.answer,input.askedFacts);
      }else if(row.job_status==='failed')status='failed';
      else if(row.job_status==='blocked')status='blocked';
      observations.push({id:sample.id,inputHash:assessmentInputHash(input),publicationId:input.publicationId,status,provenance,
        ...(assessment ? {assessment} : {}),...(transcriptionEvidence ? {transcriptionEvidence} : {})});
    }
    return observations;
  });
}
