import {domainTransaction} from './domain.mjs';
import {providerVerificationDescriptor,registeredVerificationDescriptor,verificationCapabilityHash} from '../ai/verification-descriptor.mjs';

export function recordVerificationWorker(pool,id,config,state,{schema='public'}={}) {
  verificationWorkerInput(id,config,state);
  return domainTransaction(pool,schema,client=>recordVerificationWorkerInTransaction(client,id,config,state));
}

function verificationWorkerInput(id,config,state) {
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id) || !['busy','idle','stopped'].includes(state))throw Error('Invalid verification worker');
  let descriptor;
  if(state!=='stopped' && typeof config?.run==='function' && typeof config?.runStage==='function')descriptor=providerVerificationDescriptor(config);
  return descriptor;
}

export async function recordVerificationWorkerInTransaction(client,id,config,state) {
  const descriptor=verificationWorkerInput(id,config,state);
  await client.query("DELETE FROM provider_verification_workers WHERE seen_at<clock_timestamp()-interval '24 hours'");
  if(!descriptor){
    await client.query("UPDATE provider_verification_workers SET state='stopped' WHERE worker_id=$1 AND state='active'",[id]);return false;
  }
  await client.query(`INSERT INTO provider_verification_workers(worker_id,config_hash,capability_hash,state) VALUES($1,$2,$3,'active')
    ON CONFLICT(worker_id) DO UPDATE SET state='active'`,[id,descriptor.fingerprint,verificationCapabilityHash]);
  const row=(await client.query('SELECT config_hash,capability_hash FROM provider_verification_workers WHERE worker_id=$1',[id])).rows[0];
  if(row?.config_hash!==descriptor.fingerprint || row.capability_hash!==verificationCapabilityHash)throw Error('Verification worker configuration changed');
  return true;
}

export async function readVerificationWorkers(client) {
  const rows=(await client.query(`SELECT config_hash,capability_hash,COUNT(*)::int AS workers FROM provider_verification_workers
    WHERE state='active' AND seen_at>clock_timestamp()-interval '30 seconds'
    GROUP BY config_hash,capability_hash ORDER BY config_hash,capability_hash LIMIT 2`)).rows;
  if(rows.length>1)return {status:'conflicting',workers:0,freshnessSeconds:30};
  if(rows.length===1){
    const row=rows[0];
    if(row.capability_hash!==verificationCapabilityHash)return {status:'incompatible',workers:0,freshnessSeconds:30};
    return {status:'available',workers:row.workers,freshnessSeconds:30,descriptor:registeredVerificationDescriptor(row.config_hash)};
  }
  const totals=(await client.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE state='active')::int AS active FROM provider_verification_workers`)).rows[0];
  return {status:!totals?.total?'not_observed':totals.active?'stale':'stopped',workers:0,freshnessSeconds:30};
}

export async function requireVerificationWorkers(client,fingerprint) {
  const current=await readVerificationWorkers(client);
  if(current.status!=='available' || current.descriptor.fingerprint!==fingerprint)throw Error('Provider verification worker unavailable');
  return current.descriptor;
}
