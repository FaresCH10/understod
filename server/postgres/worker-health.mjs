import {domainTransaction} from './domain.mjs';
import {recordVerificationWorkerInTransaction} from './verification-workers.mjs';

export function recordWorkerHealth(pool,id,{state,stage=null,failures=[]},{schema='public'}={}) {
  checkWorkerHealth(id,{state,stage,failures});
  return domainTransaction(pool,schema,client=>recordWorkerHealthInTransaction(client,id,{state,stage,failures}));
}

function checkWorkerHealth(id,{state,stage=null,failures=[]}) {
  const safeStage=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(value);
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id) || !['busy','idle','stopped'].includes(state) || stage!==null && !safeStage(stage)
    || !Array.isArray(failures) || failures.length>40 || !failures.every(safeStage))throw Error('Invalid worker health');
}

async function recordWorkerHealthInTransaction(client,id,{state,stage=null,failures=[]}) {
  await client.query("DELETE FROM worker_health WHERE seen_at<clock_timestamp()-interval '24 hours'");
  await client.query(`INSERT INTO worker_health(id,state,stage,failure_stages,last_failure_at) VALUES($1,$2,$3,$4,CASE WHEN $5::boolean THEN clock_timestamp() END)
    ON CONFLICT(id) DO UPDATE SET state=excluded.state,stage=excluded.stage,seen_at=clock_timestamp(),failure_stages=excluded.failure_stages,
    last_failure_at=COALESCE(excluded.last_failure_at,worker_health.last_failure_at)`,[id,state,stage,JSON.stringify(failures),failures.length>0]);
}

export function recordWorkerPresence(pool,id,snapshot,config) {
  checkWorkerHealth(id,snapshot);
  const captured={...snapshot,failures:[...(snapshot.failures ?? [])]};
  return domainTransaction(pool,config.schema ?? 'public',async client=>{
    await recordWorkerHealthInTransaction(client,id,captured);
    if(config.runtimeRoleProfile!=='application')await recordVerificationWorkerInTransaction(client,id,config.providerVerification,captured.state);
  });
}
export async function readWorkerHealth(client) {
  const items=(await client.query(`SELECT id,state,stage,started_at AS "startedAt",seen_at AS "seenAt",failure_stages AS "failureStages",last_failure_at AS "lastFailureAt",
    seen_at>clock_timestamp()-interval '5 minutes' AS fresh FROM worker_health WHERE seen_at>clock_timestamp()-interval '24 hours' ORDER BY seen_at DESC LIMIT 50`)).rows;
  const running=items.filter(row=>row.fresh && row.state!=='stopped');
  return {status:running.length?(running.some(row=>row.failureStages.length)?'degraded':'responding'):items.length?'not recently observed':'unverified',items};
}
