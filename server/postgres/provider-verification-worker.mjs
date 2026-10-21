import {randomUUID} from 'node:crypto';
import {domainTransaction} from './domain.mjs';
import {dispatchAllowed} from './operations-gates.mjs';
import {currentVerificationAuthority} from './verification-authority.mjs';
import {providerRequestJournal} from './provider-budget.mjs';
import {providerVerificationDescriptor} from '../ai/verification-descriptor.mjs';
import {checkedStageResult} from '../ai/provider-stage-verification.mjs';
import {readVerificationWorkers,requireVerificationWorkers} from './verification-workers.mjs';

export async function processOneProviderVerification(pool,config,{schema='public',signal}={}) {
  if(signal?.aborted)return false;
  const expired=await domainTransaction(pool,schema,async client=>{
    const row=(await client.query(`SELECT request_id,status FROM provider_verification_jobs
      WHERE status IN ('queued','processing') AND deadline_at<=clock_timestamp() ORDER BY deadline_at,request_id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if(!row)return false;
    await client.query(`UPDATE provider_verification_jobs SET status=$2,lease_token=NULL,lease_until=NULL,
      finished_at=clock_timestamp(),result_json=NULL,diagnostic_code='test_interrupted' WHERE request_id=$1`,[row.request_id,row.status==='processing'?'uncertain':'failed']);return true;
  });
  if(expired)return true;
  let descriptor;try{descriptor=providerVerificationDescriptor(config);}catch{return false;}
  const run=config.run,runStage=config.runStage;
  if(typeof run!=='function' || typeof runStage!=='function')return false;
  const job=await domainTransaction(pool,schema,async client=>{
    if(signal?.aborted)return null;
    if(!await dispatchAllowed(client,null,{provider:true}))return null;
    const workers=await readVerificationWorkers(client);
    if(workers.status!=='available' || workers.descriptor.fingerprint!==descriptor.fingerprint)return null;
    const row=(await client.query(`SELECT * FROM provider_verification_jobs WHERE status='queued' AND config_hash=$1 AND deadline_at>clock_timestamp()
      ORDER BY created_at,request_id FOR UPDATE SKIP LOCKED LIMIT 1`,[descriptor.fingerprint])).rows[0];
    if(!row)return null;
    let authorized=row.model===(row.test_stage==='speech'?descriptor.metadata.models.speech:descriptor.metadata.models.text);
    try{await currentVerificationAuthority(client,row.request_id);}catch(error){if(error.message!=='Provider verification authority changed')throw error;authorized=false;}
    if(!authorized){
      await client.query("UPDATE provider_verification_jobs SET status='failed',finished_at=clock_timestamp(),diagnostic_code='authority_changed' WHERE request_id=$1",[row.request_id]);
      return {closed:true};
    }
    const token=randomUUID();
    if(signal?.aborted)return null;
    await client.query("UPDATE provider_verification_jobs SET status='processing',attempts=1,lease_token=$2,lease_until=deadline_at WHERE request_id=$1",[row.request_id,token]);
    return {...row,token};
  });
  if(!job)return false;if(job.closed)return true;
  let state='verified',result=null,diagnostic=null;
  try{
    const metered=providerRequestJournal(pool,{id:job.operation_id,orgId:null,maxRequests:job.max_requests,verificationToken:job.token},{schema});
    const journal={...metered,async beforeRequest(){
      if(signal?.aborted)throw Error('Worker heartbeat unavailable');
      const id=await metered.beforeRequest();
      if(signal?.aborted)throw Error('Worker heartbeat unavailable');
      return id;
    }};
    const staged=job.test_stage!=='connection';
    const output=staged?await runStage({stage:job.test_stage,language:job.language,maxRequests:job.max_requests},journal):await run(journal);
    if(staged)result=checkedStageResult(output,{stage:job.test_stage,language:job.language,maxRequests:job.max_requests},job.model);
    else if(output?.capability!=='synthetic-text-preparation' || output.model!==job.model)throw Error('Provider test evidence unavailable');
    const evidence=await domainTransaction(pool,schema,async client=>(await client.query("SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE state='accepted')::int accepted FROM provider_requests WHERE operation_id=$1",[job.operation_id])).rows[0]);
    if(evidence.total!==job.max_requests || evidence.accepted!==job.max_requests)throw Error('Provider test evidence unavailable');
  }catch{
    state=await domainTransaction(pool,schema,async client=>(await client.query("SELECT 1 FROM provider_requests WHERE operation_id=$1 AND state IN ('started','uncertain') LIMIT 1",[job.operation_id])).rows.length?'uncertain':'failed');
    diagnostic=state==='uncertain'?'transport_uncertain':'invalid_output';result=null;
  }
  await domainTransaction(pool,schema,async client=>{
    const dispatch=await dispatchAllowed(client,null,{provider:true});
    const row=(await client.query(`SELECT lease_until>clock_timestamp() AS current FROM provider_verification_jobs
      WHERE request_id=$1 AND status='processing' AND lease_token=$2 FOR UPDATE`,[job.request_id,job.token])).rows[0];
    if(!row)return;
    if(!row.current){state='uncertain';diagnostic='test_interrupted';result=null;}
    else {
      let authority=dispatch && !signal?.aborted && config.fingerprint===job.config_hash;
      try{await currentVerificationAuthority(client,job.request_id);await requireVerificationWorkers(client,job.config_hash);}
      catch(error){if(!['Provider verification authority changed','Provider verification worker unavailable'].includes(error.message))throw error;authority=false;}
      if(!authority){state='failed';diagnostic='authority_changed';result=null;}
    }
    await client.query(`WITH boundary AS MATERIALIZED(SELECT clock_timestamp() AS now)
      UPDATE provider_verification_jobs SET status=CASE WHEN deadline_at<=boundary.now THEN 'uncertain' ELSE $3 END,
      finished_at=boundary.now,lease_token=NULL,lease_until=NULL,
      result_json=CASE WHEN deadline_at<=boundary.now THEN NULL ELSE $4::jsonb END,
      diagnostic_code=CASE WHEN deadline_at<=boundary.now THEN 'test_interrupted' ELSE $5 END
      FROM boundary WHERE request_id=$1 AND status='processing' AND lease_token=$2`,[job.request_id,job.token,state,result===null?null:JSON.stringify(result),diagnostic]);
  });
  return true;
}
