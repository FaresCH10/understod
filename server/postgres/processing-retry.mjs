import {domainTransaction,domainAudit} from './domain.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {processingRetryJob,processingRetryId,processingRetryInput,processingRetryReceipt} from '../processing-retry-input.mjs';
async function generation(client,job){
  return (await client.query(`SELECT ((SELECT count(*) FROM processing_retries WHERE kind=$1 AND job_id=$2)+
    (SELECT count(*) FROM operator_requests WHERE $1='answer_check' AND request_json->>'kind'='assessment' AND request_json->>'jobId'=$2))::int AS n`,[job.kind,job.id])).rows[0].n;
}
async function jobRow(client,session,job,lock=false){
  const table=job.kind==='answer_check'?'assessment_jobs':'recordings';
  const reference=(await client.query(`SELECT assignment_id FROM ${table} WHERE id=$1 AND org_id=$2 AND site_id=$3`,[job.id,session.org_id,session.site_id])).rows[0];
  if(!reference)throw Error('Processing retry unavailable');
  if(lock){
    await client.query(`SELECT w.id FROM workers w JOIN assignments a ON a.worker_id=w.id AND a.org_id=w.org_id AND a.site_id=w.site_id WHERE a.id=$1 AND a.org_id=$2 AND a.site_id=$3 FOR SHARE OF w`,[reference.assignment_id,session.org_id,session.site_id]);
    await client.query('SELECT id FROM assignments WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[reference.assignment_id,session.org_id,session.site_id]);
  }
  const voice=job.kind==='response_transcription';
  const row=(await client.query(`SELECT j.*,a.publication_id,a.worker_id,p.briefing_id,w.active AS worker_active,
    publication_content_available(p.id) AS content_available,
    ${voice?"EXISTS(SELECT 1 FROM attempts t WHERE t.assignment_id=j.assignment_id AND t.submission_id=j.submission_id) AS assessed":"t.assessment_status"},
    NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id AND d.org_id=w.org_id) AND
    NOT EXISTS(SELECT 1 FROM text_retention_purges d WHERE d.kind='${voice?'recording':'attempt'}' AND d.reference_id=${voice?'j.id':'t.id'})
    AND NOT EXISTS(SELECT 1 FROM text_retention_policies tp WHERE tp.org_id=j.org_id AND tp.site_id=j.site_id AND tp.days IS NOT NULL
      AND ${voice?'j':'t'}.received_at<=clock_timestamp()-tp.days*interval '1 day')
    ${voice?"AND NOT EXISTS(SELECT 1 FROM recording_purges rp WHERE rp.recording_id=j.id) AND NOT EXISTS(SELECT 1 FROM retention_policies ap WHERE ap.org_id=j.org_id AND ap.site_id=j.site_id AND ap.audio_days IS NOT NULL AND j.received_at<=clock_timestamp()-ap.audio_days*interval '1 day')":''} AS privacy_available
    FROM ${table} j JOIN assignments a ON a.id=j.assignment_id AND a.org_id=j.org_id AND a.site_id=j.site_id
    JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
    JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
    ${voice?'':'JOIN attempts t ON t.id=j.attempt_id AND t.assignment_id=j.assignment_id AND t.org_id=j.org_id AND t.site_id=j.site_id'}
    WHERE j.id=$1 AND j.org_id=$2 AND j.site_id=$3 ${lock?`FOR UPDATE OF j FOR SHARE OF p${voice?'':',t'}`:''}`,[job.id,session.org_id,session.site_id])).rows[0];
  if(!row || voice && !row.received_at)throw Error('Processing retry unavailable');return row;
}
const available=(row,job)=>row.worker_active && row.content_available && row.privacy_available && ['failed','blocked'].includes(row.status) && row.lease_token===null && row.lease_until===null && (job.kind==='answer_check'?row.assessment_status==='pending':!row.assessed);
export function getProcessingRetryContext(pool,session,jobId,{schema='public'}={}){
  const job=processingRetryJob(jobId);
  return domainTransaction(pool,schema,async client=>{await scheduleAuthority(client,session);const row=await jobRow(client,session,job,true);return {jobId,publicationId:row.publication_id,assignmentId:row.assignment_id,generation:await generation(client,job),status:row.status==='received'?'queued':row.status==='transcribed'?'complete':row.status,available:available(row,job)};});
}
export function getProcessingRetryReceipt(pool,session,jobId,requestId,{schema='public'}={}){
  const job=processingRetryJob(jobId);processingRetryId(requestId);
  return domainTransaction(pool,schema,async client=>{await scheduleAuthority(client,session);const row=(await client.query('SELECT * FROM processing_retries WHERE request_id=$1 AND kind=$2 AND job_id=$3 AND org_id=$4 AND site_id=$5 AND requested_by=$6',[requestId,job.kind,job.id,session.org_id,session.site_id,session.principal_id])).rows[0];return row?processingRetryReceipt(row):{found:false};});
}
export function retryProcessing(pool,session,jobId,input,{schema='public'}={}){
  const request=processingRetryInput(jobId,input),{requestId,...body}=request,job=processingRetryJob(jobId);
  return domainTransaction(pool,schema,async client=>{
    await scheduleAuthority(client,session);await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`processing-retry:${requestId}`]);
    const old=(await client.query('SELECT *,request_json=$2::jsonb AS matches FROM processing_retries WHERE request_id=$1',[requestId,JSON.stringify(body)])).rows[0];
    if(old){if(old.org_id!==session.org_id || old.site_id!==session.site_id || old.requested_by!==session.principal_id || old.kind!==job.kind || old.job_id!==job.id || !old.matches)throw Error('Processing retry request conflict');return processingRetryReceipt(old).result;}
    const row=await jobRow(client,session,job,true);
    if(row.publication_id!==request.publicationId || row.assignment_id!==request.assignmentId || await generation(client,job)!==request.generation || !available(row,job))throw Error('Processing retry state changed');
    const saved=(await client.query(`INSERT INTO processing_retries(request_id,org_id,site_id,requested_by,kind,job_id,publication_id,assignment_id,generation,request_json)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[requestId,session.org_id,session.site_id,session.principal_id,job.kind,job.id,request.publicationId,request.assignmentId,request.generation,JSON.stringify(body)])).rows[0];
    if(job.kind==='answer_check')await client.query("UPDATE assessment_jobs SET status='queued',attempts=0,lease_token=NULL,lease_until=NULL,error=NULL,due_at=clock_timestamp() WHERE id=$1",[job.id]);
    else await client.query("UPDATE recordings SET status='received',attempts=0,lease_token=NULL,lease_until=NULL,retry_at=NULL,error=NULL WHERE id=$1",[job.id]);
    await domainAudit(client,session,'answer.processing_retry_requested',job.id);
    return processingRetryReceipt(saved).result;
  });
}
