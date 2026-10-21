import {domainTransaction} from './domain.mjs';
import {requireOperatorInTransaction,operatorAudit} from './operators.mjs';
import {lockOperationsGate,dispatchAllowed} from './operations-gates.mjs';
import {providerPolicyInput,providerVerificationInput,providerStageVerificationInput} from '../provider-input.mjs';
import {reserveProviderOperation,providerRequestJournal} from './provider-budget.mjs';
import {pipelineStatus} from '../ai/pipeline-status.mjs';
import {STAGE_TESTS,checkedStageResult,stageVerificationPipeline} from '../ai/provider-stage-verification.mjs';
import {checkedVerificationDescriptor} from '../ai/verification-descriptor.mjs';
import {readVerificationWorkers,requireVerificationWorkers} from './verification-workers.mjs';

const queuedVerificationSource=`(SELECT v.request_id,v.operator_id,v.operation_id,v.config_hash,v.request_json,v.deadline_at,v.created_at,v.test_stage,v.language,
  CASE WHEN v.state='pending' AND j.status IN ('verified','failed','uncertain') THEN j.status ELSE v.state END AS state,
  CASE WHEN v.state='pending' AND j.status IN ('verified','failed','uncertain') THEN j.finished_at ELSE v.finished_at END AS finished_at,
  CASE WHEN v.state='pending' AND j.status IN ('verified','failed','uncertain') THEN j.result_json ELSE v.result_json END AS result_json,
  CASE WHEN v.state='pending' AND j.status IN ('verified','failed','uncertain') THEN j.diagnostic_code ELSE v.diagnostic_code END AS diagnostic_code,
  j.model AS job_model,j.max_requests AS job_max_requests
  FROM provider_verifications v LEFT JOIN provider_verification_jobs j ON j.request_id=v.request_id)`;

function verificationResult(row) {
  const stage=row.test_stage!=='connection';
  if(stage && row.state==='verified' && row.job_model)row.result_json=checkedStageResult(row.result_json,
    {stage:row.test_stage,language:row.language,maxRequests:row.job_max_requests},row.job_model);
  return {kind:stage?'provider-stage-verification':'provider-verification',state:row.state==='pending' && !row.current?'interrupted':row.state,
    ...(row.job_model?{configFingerprint:row.config_hash}:{}),
    operationId:row.operationId,...(stage?{stage:row.test_stage,language:row.language}:{}),
    ...(row.result_json?{evidence:row.result_json}:{}),...(row.diagnostic_code?{diagnosticCode:row.diagnostic_code}:{})};
}
// Call only after the caller's scoped principal has been authorized. No identity or private config is projected.
export async function readProviderStageTests(client,config) {
  const rows=config?.fingerprint?(await client.query(`SELECT DISTINCT ON(test_stage,language) test_stage,language,state,
    deadline_at>clock_timestamp() AS current,created_at AS "createdAt",finished_at AS "finishedAt",result_json,diagnostic_code,
    ${config?.dispatch==='worker'?'job_model,job_max_requests':'NULL::text AS job_model,NULL::int AS job_max_requests'}
    FROM ${config?.dispatch==='worker'?queuedVerificationSource:'provider_verifications'} v WHERE config_hash=$1 AND test_stage<>'connection'
    ORDER BY test_stage,language,created_at DESC,request_id DESC`,[config.fingerprint])).rows:[];
  return STAGE_TESTS.map(test=>{
    const row=rows.find(row=>row.test_stage===test.stage && row.language===test.language);
    if(row?.state==='verified' && row.job_model)verificationResult(row);
    return {...test,state:row?(row.state==='pending' && !row.current?'interrupted':row.state):'untested',
      ...(row?{createdAt:row.createdAt,finishedAt:row.finishedAt,evidence:row.result_json,diagnosticCode:row.diagnostic_code}: {})};
  });
}

export async function providerVerificationReceipt(client,actor,id) {
  const row=(await client.query(`SELECT request_json AS request,state,deadline_at>clock_timestamp() AS current,operation_id AS "operationId",
    test_stage,language,result_json,diagnostic_code,job_model,job_max_requests,config_hash
    FROM ${queuedVerificationSource} v WHERE request_id=$1 AND operator_id=$2`,[id,actor.operator_id])).rows[0];
  if(!row)return null;
  return {found:true,request:row.request,result:verificationResult(row)};
}
export function saveProviderPolicy(pool,identity,input,{schema='public'}={}) {
  const value=providerPolicyInput(input);
  return domainTransaction(pool,schema,async client=>{
    const actor=await requireOperatorInTransaction(client,identity);await lockOperationsGate(client,true);
    const old=(await client.query('SELECT *,request_json=$2::jsonb AS matches FROM operator_requests WHERE request_id=$1',[input.requestId,JSON.stringify(value)])).rows[0];
    if(old){if(old.operator_id!==actor.operator_id || !old.matches)throw Error('Operator request conflict');return {...old.result_json,duplicate:true};}
    if((await client.query('SELECT 1 FROM provider_verifications WHERE request_id=$1',[input.requestId])).rows.length)throw Error('Operator request conflict');
    if(value.orgId!==null && !(await client.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE',[value.orgId])).rows.length)throw Error('Tenant unavailable');
    const scope=value.orgId===null?'global':`tenant:${value.orgId}`,current=(await client.query('SELECT revision FROM provider_policies WHERE scope_key=$1',[scope])).rows[0];
    if((current?.revision ?? 0)!==value.revision)throw Error('Operator revision changed');
    const revision=value.revision+1;
    await client.query(`INSERT INTO provider_policies(scope_key,org_id,revision,enabled,max_daily_requests) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(scope_key) DO UPDATE SET revision=excluded.revision,enabled=excluded.enabled,max_daily_requests=excluded.max_daily_requests,changed_at=clock_timestamp()`,[scope,value.orgId,revision,value.enabled,value.maxDailyRequests]);
    const result={kind:'provider-policy',orgId:value.orgId,revision,enabled:value.enabled,maxDailyRequests:value.maxDailyRequests};
    await client.query('INSERT INTO operator_requests(request_id,operator_id,request_json,result_json) VALUES($1,$2,$3,$4)',[input.requestId,actor.operator_id,JSON.stringify(value),JSON.stringify(result)]);
    await operatorAudit(client,actor.operator_id,'provider.quota_changed',value.orgId===null?'system':'organization',value.orgId ?? 'global');
    return {...result,duplicate:false};
  });
}
export function readProviderControls(pool,identity,config,input={}, {schema='public',pipeline=pipelineStatus(),workerVerification=false}={}) {
  if(Object.keys(input).some(key=>key!=='orgId') || input.orgId!==undefined && (typeof input.orgId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.orgId)))throw Error('Invalid operator filters');
  return domainTransaction(pool,schema,async client=>{await requireOperatorInTransaction(client,identity);
    let worker;
    if(workerVerification || config?.dispatch==='worker'){
      const {descriptor,...availability}=await readVerificationWorkers(client);worker={...availability,configFingerprint:descriptor?.fingerprint ?? null};config=descriptor;
    }
    const orgId=input.orgId ?? null;
    if(orgId!==null && !(await client.query('SELECT 1 FROM organizations WHERE id=$1',[orgId])).rows.length)throw Error('Tenant unavailable');
    const keys=['global',...(orgId===null?[]:[`tenant:${orgId}`])],rules=(await client.query('SELECT scope_key,org_id AS "orgId",revision,enabled,max_daily_requests AS "maxDailyRequests" FROM provider_policies WHERE scope_key=ANY($1::text[])',[keys])).rows;
    const rule=id=>{const row=rules.find(row=>row.orgId===id);if(!row)return {orgId:id,revision:0,enabled:false,maxDailyRequests:0};const {scope_key,...value}=row;return value;};
    const usage=(await client.query(`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day,COUNT(*)::int AS operations,
      COALESCE(SUM(reserved_requests),0)::int AS "reservedRequests",COALESCE(SUM(reserved_requests) FILTER(WHERE org_id=$1),0)::int AS "tenantReservedRequests"
      FROM provider_operations WHERE quota_day=(clock_timestamp() AT TIME ZONE 'UTC')::date`,[orgId])).rows[0];
    const requests=(await client.query(`SELECT r.state,COUNT(*)::int AS count FROM provider_requests r JOIN provider_operations o ON o.id=r.operation_id
      WHERE o.quota_day=(clock_timestamp() AT TIME ZONE 'UTC')::date GROUP BY r.state`)).rows;
    const latest=config?.fingerprint?(await client.query(`SELECT state,deadline_at>clock_timestamp() AS current,created_at AS "createdAt",finished_at AS "finishedAt"
      FROM ${config?.dispatch==='worker'?queuedVerificationSource:'provider_verifications'} v WHERE config_hash=$1 AND test_stage='connection' ORDER BY created_at DESC,request_id DESC LIMIT 1`,[config.fingerprint])).rows[0]:null;
    const stageTests=await readProviderStageTests(client,config);
    return {configuration:config?.metadata ?? {provider:'Gemini Free',credentialsConfigured:false,testEnabled:false,dataClass:'synthetic',realDataAllowed:false},...(worker?{worker}:{}),pipeline:stageVerificationPipeline(pipeline,stageTests),stageTests,
      global:rule(null),tenant:orgId===null?null:rule(orgId),usage:{...usage,requests},
      connection:latest?{state:latest.state==='pending' && !latest.current?'interrupted':latest.state,createdAt:latest.createdAt,finishedAt:latest.finishedAt,capability:'synthetic-text-preparation'}:{state:'untested'},
      billing:{estimatedUsd:null,actualUsd:null,reconciled:false,reason:'Request-slot quotas are enforced. Free-tier account eligibility and actual billing are not verified; reservations are not invoices.'},
      productionReady:false,sourceConnection:'unverified',speechConnection:'unverified'};
  });
}
export function queueProviderVerification(pool,identity,input,descriptor,{schema='public',workerVerification=false,expectedFingerprint}={}) {
  const staged=input?.kind==='provider-stage-verification',value=staged?providerStageVerificationInput(input):providerVerificationInput(input);
  return domainTransaction(pool,schema,async client=>{
    const actor=await requireOperatorInTransaction(client,identity);await lockOperationsGate(client,true);
    if((await client.query('SELECT 1 FROM operator_requests WHERE request_id=$1',[input.requestId])).rows.length)throw Error('Operator request conflict');
    const old=(await client.query('SELECT operator_id,request_json=$2::jsonb AS matches FROM provider_verifications WHERE request_id=$1',[input.requestId,JSON.stringify(value)])).rows[0];
    if(old){if(old.operator_id!==actor.operator_id || !old.matches)throw Error('Operator request conflict');return {...(await providerVerificationReceipt(client,actor,input.requestId)).result,duplicate:true};}
    const workers=await readVerificationWorkers(client);
    if(workers.status!=='available')throw Error('Provider verification worker unavailable');
    const config=workerVerification?workers.descriptor:checkedVerificationDescriptor(descriptor);
    if(workerVerification && (!/^[a-f0-9]{64}$/.test(expectedFingerprint || '') || config.fingerprint!==expectedFingerprint))throw Error('Provider verification configuration changed');
    await requireVerificationWorkers(client,config.fingerprint);
    const stage=staged?value.stage:'connection',language=staged?value.language:'en';
    const model=stage==='speech'?config.metadata.models.speech:config.metadata.models.text;
    const operation=await reserveProviderOperation(client,{orgId:null,kind:staged?'stage-test':'connection-test',referenceId:input.requestId,model,dataClass:'synthetic',maxRequests:value.maxRequests});
    await client.query(`INSERT INTO provider_verifications(request_id,operator_id,session_hash,operation_id,config_hash,request_json,state,deadline_at,test_stage,language)
      VALUES($1,$2,$3,$4,$5,$6,'pending',clock_timestamp()+interval '90 seconds',$7,$8)`,
      [input.requestId,actor.operator_id,actor.token_hash,operation.id,config.fingerprint,JSON.stringify(value),stage,language]);
    await client.query(`INSERT INTO provider_verification_jobs(request_id,operation_id,config_hash,model,test_stage,language,max_requests,deadline_at)
      SELECT request_id,operation_id,config_hash,$2,test_stage,language,$3,deadline_at FROM provider_verifications WHERE request_id=$1`,[input.requestId,model,value.maxRequests]);
    await operatorAudit(client,actor.operator_id,'provider.verification_requested','provider','gemini-free');
    return {...(await providerVerificationReceipt(client,actor,input.requestId)).result,duplicate:false};
  });
}
export async function runProviderVerification(pool,identity,input,config,{schema='public',workerVerification=false,expectedFingerprint}={}) {
  if(workerVerification || config?.dispatch==='worker')return queueProviderVerification(pool,identity,input,config,{schema,workerVerification,expectedFingerprint});
  const staged=input?.kind==='provider-stage-verification',value=staged?providerStageVerificationInput(input):providerVerificationInput(input);
  const stage=staged?value.stage:'connection',language=staged?value.language:'en',maxRequests=value.maxRequests;
  const admitted=await domainTransaction(pool,schema,async client=>{
    const actor=await requireOperatorInTransaction(client,identity);await lockOperationsGate(client,true);
    if((await client.query('SELECT 1 FROM operator_requests WHERE request_id=$1',[input.requestId])).rows.length)throw Error('Operator request conflict');
    const existing=(await client.query('SELECT operator_id,request_json=$2::jsonb AS matches FROM provider_verifications WHERE request_id=$1',[input.requestId,JSON.stringify(value)])).rows[0];
    if(existing){if(existing.operator_id!==actor.operator_id || !existing.matches)throw Error('Operator request conflict');return {duplicate:true,receipt:await providerVerificationReceipt(client,actor,input.requestId)};}
    if(typeof config?.[staged?'runStage':'run']!=='function' || !config.metadata?.testEnabled || config.metadata?.realDataAllowed!==false || !/^[a-f0-9]{64}$/.test(config.fingerprint || ''))throw Error('Provider verification unavailable');
    const model=stage==='speech'?config.metadata.models.speech:config.metadata.models.text;
    const operation=await reserveProviderOperation(client,{orgId:null,kind:staged?'stage-test':'connection-test',referenceId:input.requestId,model,dataClass:'synthetic',maxRequests});
    await client.query(`INSERT INTO provider_verifications(request_id,operator_id,session_hash,operation_id,config_hash,request_json,state,deadline_at,test_stage,language)
      VALUES($1,$2,$3,$4,$5,$6,'pending',clock_timestamp()+interval '90 seconds',$7,$8)`,[input.requestId,actor.operator_id,actor.token_hash,operation.id,config.fingerprint,JSON.stringify(value),stage,language]);
    await operatorAudit(client,actor.operator_id,'provider.verification_requested','provider','gemini-free');
    return {operation,actor,model};
  });
  if(admitted.duplicate)return {...admitted.receipt.result,duplicate:true};
  let state='verified',result=null,diagnostic=null;
  try {
    const journal=providerRequestJournal(pool,admitted.operation,{schema});
    const output=staged?await config.runStage({stage,language,maxRequests},journal):await config.run(journal);
    if(staged)result=checkedStageResult(output,{stage,language,maxRequests},admitted.model);
    else if(output?.capability!=='synthetic-text-preparation' || output.model!==admitted.model)throw Error('Provider test evidence unavailable');
    const evidence=await domainTransaction(pool,schema,async client=>(await client.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE state='accepted')::int accepted FROM provider_requests WHERE operation_id=$1",[admitted.operation.id])).rows[0]);
    if(evidence.total!==maxRequests || evidence.accepted!==maxRequests)throw Error('Provider test evidence unavailable');
  }
  catch {state=await domainTransaction(pool,schema,async client=>(await client.query("SELECT 1 FROM provider_requests WHERE operation_id=$1 AND state IN ('started','uncertain') LIMIT 1",[admitted.operation.id])).rows.length?'uncertain':'failed');diagnostic=state==='uncertain'?'transport_uncertain':'invalid_output';result=null;}
  const receipt=await domainTransaction(pool,schema,async client=>{
    let authority=true;
    try{await requireOperatorInTransaction(client,{token_hash:admitted.actor.token_hash});}
    catch(error){if(error.message!=='Operator sign in required')throw error;authority=false;}
    if(!await dispatchAllowed(client,null,{provider:true}))authority=false;
    const row=(await client.query('SELECT state,deadline_at>clock_timestamp() AS current FROM provider_verifications WHERE request_id=$1 FOR UPDATE',[input.requestId])).rows[0];
    if(row?.state==='pending') {
      if(!row.current){state='uncertain';diagnostic='test_interrupted';result=null;}
      else if(!authority){state='failed';diagnostic='authority_changed';result=null;}
      await client.query(`WITH boundary AS MATERIALIZED(SELECT clock_timestamp() AS now)
        UPDATE provider_verifications SET state=CASE WHEN deadline_at<=boundary.now THEN 'uncertain' ELSE $2 END,
        finished_at=boundary.now,result_json=CASE WHEN deadline_at<=boundary.now THEN NULL ELSE $3::jsonb END,
        diagnostic_code=CASE WHEN deadline_at<=boundary.now THEN 'test_interrupted' ELSE $4 END FROM boundary WHERE request_id=$1`,
        [input.requestId,state,result===null?null:JSON.stringify(result),diagnostic]);
      const completed=await providerVerificationReceipt(client,admitted.actor,input.requestId);
      await operatorAudit(client,admitted.actor.operator_id,`provider.verification_${completed.result.state}`,'provider','gemini-free');
    }
    return providerVerificationReceipt(client,admitted.actor,input.requestId);
  });
  return {...receipt.result,duplicate:false};
}
