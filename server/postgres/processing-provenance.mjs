import {requirePrincipal} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {processingRowsSql} from '../processing-rows.mjs';
import {processingJobId} from '../processing.mjs';
import {processingOperationKinds,processingOperation,processingProvenanceFilters,processingProvenancePage} from '../processing-provenance.mjs';
export function getProcessingProvenance(pool,session,id,input={}, {schema='public'}={}){
  processingJobId(id);const filters=processingProvenanceFilters(input);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',['owner','supervisor','auditor']);
    const job=(await client.query(`${processingRowsSql('postgres')} SELECT * FROM processing_rows WHERE id=$4 AND org_id=$1 AND site_id=$2`,[session.org_id,session.site_id,session.principal_id,id])).rows[0];
    if(!job)throw Error('Processing job unavailable');
    const reference=job.kind==='prepare'?id:id.slice(job.kind.length+1),table={prepare:'jobs',source_transcription:'source_audio_requests',response_transcription:'recordings',answer_check:'assessment_jobs'}[job.kind],key=job.kind==='source_transcription'?'request_id':'id';
    const current=`EXISTS(SELECT 1 FROM ${table} current_job WHERE current_job.${key}=$2 AND current_job.org_id=$1 AND current_job.site_id=$3
      AND current_job.status='processing' AND current_job.lease_token=o.claim_token AND current_job.lease_until>clock_timestamp())`;
    const result=job.kind==='prepare'?`CASE WHEN EXISTS(SELECT 1 FROM generated_bundle_operations g WHERE g.operation_id=o.id AND g.org_id=$1 AND g.site_id=$3 AND g.job_id=$2) THEN 'bundle' END`
      :job.kind==='source_transcription'?`CASE WHEN EXISTS(SELECT 1 FROM source_audio_requests r WHERE r.request_id=$2 AND r.org_id=$1 AND r.site_id=$3 AND r.transcription_operation_id=o.id) THEN 'transcription' END`
        :job.kind==='response_transcription'?`CASE WHEN EXISTS(SELECT 1 FROM recordings r WHERE r.id=$2 AND r.org_id=$1 AND r.site_id=$3 AND r.transcription_operation_id=o.id) THEN 'transcription'
          WHEN EXISTS(SELECT 1 FROM recordings r WHERE r.id=$2 AND r.org_id=$1 AND r.site_id=$3 AND r.assessment_operation_id=o.id) THEN 'assessment' END`
          :`CASE WHEN EXISTS(SELECT 1 FROM assessment_jobs j WHERE j.id=$2 AND j.org_id=$1 AND j.site_id=$3 AND j.provider_operation_id=o.id AND j.status='complete') THEN 'assessment' END`;
    const row=(await client.query(`WITH scoped AS (SELECT o.*,
      first_value(o.id) OVER(PARTITION BY COALESCE(o.claim_token,o.id) ORDER BY o.created_at,o.id) AS run_id,
      min(o.created_at) OVER(PARTITION BY COALESCE(o.claim_token,o.id)) AS run_started_at,
      ${current} AS current_run,${result} AS result_reference
      FROM provider_operations o WHERE o.org_id=$1 AND o.reference_id=$2 AND o.kind=ANY($4::text[])),
      paged AS (SELECT * FROM scoped ORDER BY created_at DESC,id LIMIT $5 OFFSET $6)
      SELECT (SELECT count(*)::int FROM scoped) AS total,
        (SELECT COALESCE(jsonb_agg(result ORDER BY result.created_at DESC,result.id),'[]') FROM
          (SELECT p.*,(SELECT COALESCE(jsonb_agg(r ORDER BY r.sequence),'[]') FROM
            (SELECT sequence,cleanup,state,http_status,created_at,finished_at FROM provider_requests WHERE operation_id=p.id ORDER BY sequence LIMIT 65) r) AS requests FROM paged p) result) AS items`,
      [session.org_id,reference,session.site_id,processingOperationKinds[job.kind],filters.pageSize,(filters.page-1)*filters.pageSize])).rows[0];
    return processingProvenancePage(job,filters,row.total,row.items.map(item=>processingOperation(item,job)));
  });
}
