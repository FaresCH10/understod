import {domainTransaction} from './domain.mjs';
import {requireOperatorInTransaction,operatorAudit} from './operators.mjs';
import {operatorControlInput,operatorFilters,operatorRetryInput} from '../operator-input.mjs';
import {lockOperationsGate,requireTenantActive} from './operations-gates.mjs';
import {deletionExportExpiry} from '../exports.mjs';
import {readWorkerHealth} from './worker-health.mjs';
import {providerVerificationReceipt} from './provider-controls.mjs';
import {readStorageHealth} from './storage-health.mjs';

export function operationsOverview(pool,identity,{schema='public'}={}) {
  return domainTransaction(pool,schema,async client=>{await requireOperatorInTransaction(client,identity);
    const control=(await client.query("SELECT revision,jobs_paused AS \"jobsPaused\",provider_paused AS \"providerPaused\" FROM system_controls WHERE id='global'")).rows[0] ?? {revision:0,jobsPaused:false,providerPaused:false};
    const backlog=(await client.query(`SELECT kind,status,COUNT(*)::int AS count FROM (
      SELECT 'preparation' AS kind,status FROM jobs UNION ALL SELECT 'assessment',status FROM assessment_jobs
      UNION ALL SELECT 'source transcription',status FROM source_audio_requests UNION ALL SELECT 'export',status FROM report_exports
      UNION ALL SELECT 'scheduled publication',state FROM publication_schedules) q GROUP BY kind,status ORDER BY kind,status`)).rows;
    const tenants=(await client.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE COALESCE(t.state,'active')='suspended')::int AS suspended FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id")).rows[0];
    const workerHealth=await readWorkerHealth(client),storageHealth=await readStorageHealth(client);
    return {asOf:new Date().toISOString(),backend:'postgres',control,backlog,tenants,workerHealth,storageHealth,
      readiness:{api:'responding',database:'responding',worker:workerHealth.status,storage:storageHealth.status,storagePrivacy:storageHealth.privacy,liveAI:'unverified'},
      limits:{realDataAllowed:false,providerTestAvailable:false,reason:'Live/provider verification and production release gates remain incomplete. Pausing dispatch cannot retract a request already sent to an external service.'}};
  });
}
export function operationsTenants(pool,identity,input={}, {schema='public'}={}) {
  const f=operatorFilters(input);
  return domainTransaction(pool,schema,async client=>{await requireOperatorInTransaction(client,identity);
    const where="(strpos(lower(o.name),$1)>0 OR strpos(lower(o.id),$1)>0) AND ($2='all' OR COALESCE(t.state,'active')=$2)",values=[f.search,f.state];
    const total=(await client.query(`SELECT COUNT(*)::int n FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id WHERE ${where}`,values)).rows[0].n;
    const items=(await client.query(`SELECT o.id,o.name,COALESCE(t.state,'active') AS state,COALESCE(t.revision,0) AS revision,t.reason,
      (SELECT COUNT(*)::int FROM sites s WHERE s.org_id=o.id) AS sites,(SELECT COUNT(*)::int FROM workers w WHERE w.org_id=o.id AND active=true) AS workers
      FROM organizations o LEFT JOIN tenant_controls t ON t.org_id=o.id WHERE ${where} ORDER BY lower(o.name),o.id LIMIT $3 OFFSET $4`,[...values,f.pageSize,(f.page-1)*f.pageSize])).rows;
    return {items,total,page:f.page,pageSize:f.pageSize};});
}
export function saveOperatorControl(pool,identity,input,{schema='public'}={}) {
  const value=operatorControlInput(input);
  return domainTransaction(pool,schema,async client=>{
    const actor=await requireOperatorInTransaction(client,identity);await lockOperationsGate(client,true);
    const old=(await client.query('SELECT *,request_json=$2::jsonb AS matches FROM operator_requests WHERE request_id=$1',[input.requestId,JSON.stringify(value)])).rows[0];
    if(old){if(old.operator_id!==actor.operator_id || !old.matches)throw Error('Operator request conflict');return {...old.result_json,duplicate:true};}
    if((await client.query('SELECT 1 FROM provider_verifications WHERE request_id=$1',[input.requestId])).rows.length)throw Error('Operator request conflict');
    let result;
    if(value.kind==='tenant') {
      if(!(await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[value.orgId])).rows.length)throw Error('Tenant unavailable');
      const current=(await client.query('SELECT revision FROM tenant_controls WHERE org_id=$1',[value.orgId])).rows[0];
      if((current?.revision ?? 0)!==value.revision)throw Error('Operator revision changed');
      const revision=value.revision+1;
      await client.query(`INSERT INTO tenant_controls VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(org_id) DO UPDATE SET revision=excluded.revision,state=excluded.state,reason=excluded.reason,updated_at=excluded.updated_at`,[value.orgId,revision,value.state,value.reason]);
      if(value.state==='suspended')await client.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE org_id=$1 AND revoked_at IS NULL',[value.orgId]);
      result={kind:'tenant',orgId:value.orgId,revision,state:value.state};
      await operatorAudit(client,actor.operator_id,`tenant.${value.state}`,'organization',value.orgId);
    }else {
      const current=(await client.query("SELECT revision FROM system_controls WHERE id='global'")).rows[0];
      if((current?.revision ?? 0)!==value.revision)throw Error('Operator revision changed');
      const revision=value.revision+1;
      await client.query("INSERT INTO system_controls VALUES('global',$1,$2,$3,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,jobs_paused=excluded.jobs_paused,provider_paused=excluded.provider_paused,updated_at=excluded.updated_at",[revision,value.jobsPaused,value.providerPaused]);
      result={kind:'system',revision,jobsPaused:value.jobsPaused,providerPaused:value.providerPaused};
      await operatorAudit(client,actor.operator_id,'dispatch.controls_changed','system','global');
    }
    await client.query('INSERT INTO operator_requests(request_id,operator_id,request_json,result_json) VALUES($1,$2,$3,$4)',[input.requestId,actor.operator_id,JSON.stringify(value),JSON.stringify(result)]);
    return {...result,duplicate:false};
  });
}
export function operatorReceipt(pool,identity,id,{schema='public'}={}) {
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid operator command');
  return domainTransaction(pool,schema,async client=>{const actor=await requireOperatorInTransaction(client,identity);
    const row=(await client.query('SELECT request_json AS request,result_json AS result FROM operator_requests WHERE request_id=$1 AND operator_id=$2',[id,actor.operator_id])).rows[0];return row?{found:true,...row}:await providerVerificationReceipt(client,actor,id) ?? {found:false};});
}
export function operationsAudit(pool,identity,input={}, {schema='public'}={}) {
  const {page,pageSize}=operatorFilters(input);
  return domainTransaction(pool,schema,async client=>{await requireOperatorInTransaction(client,identity);
    const total=(await client.query('SELECT COUNT(*)::int n FROM operator_audit')).rows[0].n;
    const items=(await client.query('SELECT id,operator_id AS "operatorId",action,object_type AS "objectType",object_id AS "objectId",created_at AS "createdAt" FROM operator_audit ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize])).rows;
    return {items,total,page,pageSize};});
}

const queues=`SELECT id,org_id,'preparation' AS kind,status,attempts,created_at,lease_until FROM jobs WHERE kind='prepare'
  UNION ALL SELECT id,org_id,'assessment',status,attempts,created_at,lease_until FROM assessment_jobs
  UNION ALL SELECT id,org_id,'export',status,attempts,created_at,lease_until FROM report_exports
  UNION ALL SELECT request_id,org_id,'source',status,attempts,created_at,lease_until FROM source_audio_requests
  UNION ALL SELECT id,org_id,'publication',state,attempts,created_at,NULL::timestamptz FROM publication_schedules`;
export function operationsJobs(pool,identity,input={}, {schema='public'}={}) {
  if(Object.keys(input).some(key=>!['page','pageSize','status','kind'].includes(key)))throw Error('Invalid operator filters');
  const {page,pageSize}=operatorFilters({page:input.page,pageSize:input.pageSize});
  const status=input.status ?? 'all',kind=input.kind ?? 'all';
  if(!['all','queued','processing','failed','blocked','ready','complete','received','transcribed','expired','published','cancelled'].includes(status)
    || !['all','preparation','assessment','export','source','publication'].includes(kind))throw Error('Invalid operator filters');
  return domainTransaction(pool,schema,async client=>{await requireOperatorInTransaction(client,identity);
    const where="($1='all' OR q.status=$1) AND ($2='all' OR q.kind=$2)",args=[status,kind];
    const total=(await client.query(`SELECT COUNT(*)::int n FROM (${queues}) q WHERE ${where}`,args)).rows[0].n;
    const items=(await client.query(`SELECT q.id,q.org_id AS "orgId",q.kind,q.status,q.attempts,q.created_at AS "createdAt",q.lease_until AS "leaseUntil",
      CASE WHEN q.status='failed' THEN 'processing_failed' WHEN q.status='blocked' THEN 'authority_or_provider_unavailable' ELSE NULL END AS "diagnosticCode",
      (q.status='failed' OR (q.status='blocked' AND q.kind='assessment')) AND q.attempts>0 AND q.kind IN ('preparation','assessment','export') AS "canRequestRetry"
      FROM (${queues}) q WHERE ${where} ORDER BY q.created_at DESC,q.kind,q.id LIMIT $3 OFFSET $4`,[...args,pageSize,(page-1)*pageSize])).rows;
    return {items,total,page,pageSize};});
}
export function retryOperationsJob(pool,identity,input,{schema='public'}={}) {
  const value=operatorRetryInput(input);
  return domainTransaction(pool,schema,async client=>{
    const actor=await requireOperatorInTransaction(client,identity);await lockOperationsGate(client,true);
    const old=(await client.query('SELECT *,request_json=$2::jsonb AS matches FROM operator_requests WHERE request_id=$1',[input.requestId,JSON.stringify(value)])).rows[0];
    if(old){if(old.operator_id!==actor.operator_id || !old.matches)throw Error('Operator request conflict');return {...old.result_json,duplicate:true};}
    if((await client.query('SELECT 1 FROM provider_verifications WHERE request_id=$1',[input.requestId])).rows.length)throw Error('Operator request conflict');
    const table={preparation:'jobs',assessment:'assessment_jobs',export:'report_exports'}[value.kind];
    const reference=(await client.query(`SELECT org_id${value.kind==='preparation'?',briefing_id':''} FROM ${table} WHERE id=$1`,[value.jobId])).rows[0];
    if(!reference)throw Error('Job is not retryable');await requireTenantActive(client,reference.org_id);
    if(value.kind==='preparation')await client.query('SELECT id FROM briefings WHERE id=$1 FOR UPDATE',[reference.briefing_id]);
    const job=(await client.query(`SELECT id,org_id,site_id,status,attempts,lease_token${value.kind==='preparation'?',briefing_id,revision,kind':value.kind==='assessment'?',attempt_id':''} FROM ${table} WHERE id=$1 FOR UPDATE`,[value.jobId])).rows[0];
    if(!(job.status==='failed' || value.kind==='assessment' && job.status==='blocked') || job.attempts!==value.attempts || job.lease_token!==null)throw Error('Job is not retryable');
    if(value.kind==='preparation') {
      const draft=(await client.query(`SELECT revision,state FROM briefings WHERE id=$1 AND org_id=$2 AND site_id=$3
        AND NOT EXISTS(SELECT 1 FROM briefing_archives WHERE briefing_id=$1)
        AND NOT EXISTS(SELECT 1 FROM briefing_regeneration_requests WHERE job_id=$4)`,[job.briefing_id,job.org_id,job.site_id,job.id])).rows[0];
      if(job.kind!=='prepare' || !draft || draft.revision!==job.revision || draft.state!=='failed')throw Error('Job is not retryable');
      await client.query("UPDATE briefings SET state='processing',prepared_json=NULL,updated_at=clock_timestamp() WHERE id=$1",[job.briefing_id]);
    }else if(value.kind==='assessment') {
      if(!(await client.query(`SELECT 1 FROM attempts t JOIN assignments a ON a.id=t.assignment_id AND a.org_id=t.org_id AND a.site_id=t.site_id
        JOIN workers w ON w.id=a.worker_id AND w.org_id=a.org_id AND w.site_id=a.site_id
        WHERE t.id=$1 AND t.org_id=$2 AND t.site_id=$3 AND t.assessment_status='pending' AND w.active=true
        AND NOT EXISTS(SELECT 1 FROM worker_deletion_requests d WHERE d.worker_id=w.id AND d.org_id=w.org_id)`,[job.attempt_id,job.org_id,job.site_id])).rows.length)throw Error('Job is not retryable');
    }else if(!(await client.query(`SELECT 1 FROM report_exports e JOIN staff s ON s.id=e.requested_by AND s.org_id=e.org_id AND s.site_id=e.site_id
      WHERE e.id=$1 AND e.expires_at>clock_timestamp() AND e.snapshot_available AND NOT (${deletionExportExpiry})
      AND s.active=true AND s.role IN ('owner','supervisor','auditor')`,[job.id])).rows.length)throw Error('Job is not retryable');
    await client.query(`UPDATE ${table} SET status='queued',attempts=0,lease_token=NULL,lease_until=NULL,error=NULL${value.kind!=='export'?',due_at=clock_timestamp()':''} WHERE id=$1`,[job.id]);
    const result={kind:value.kind,jobId:job.id,status:'queued',attempts:0};
    await client.query('INSERT INTO operator_requests(request_id,operator_id,request_json,result_json) VALUES($1,$2,$3,$4)',[input.requestId,actor.operator_id,JSON.stringify(value),JSON.stringify(result)]);
    await operatorAudit(client,actor.operator_id,'job.retry_requested',value.kind,job.id);
    return {...result,duplicate:false};
  });
}
