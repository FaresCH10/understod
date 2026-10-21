import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {domainTransaction} from './domain.mjs';
import {provisionOperator,authenticateOperator} from './operators.mjs';
import {saveProviderPolicy,runProviderVerification,readProviderControls} from './provider-controls.mjs';
import {operatorReceipt} from './operations.mjs';
import {resolveProviderVerification} from '../ai/provider-verification-config.mjs';
import {STAGE_FIXTURE_VERSION} from '../ai/provider-stage-verification.mjs';
import {recordWorkerPresence} from './worker-health.mjs';
import {runRehearsalWorker} from './runtime.mjs';
import {schemaName} from './migrate.mjs';

const quote=value=>'"'+value.replaceAll('"','""')+'"';
export async function exerciseVerificationHeartbeat(ownerPool,workerPool,operatorPool,{schema,signal}={}){
  schemaName(schema);if(signal?.aborted)throw Error('Synthetic LOGIN test interrupted');
  const options={schema},tx=fn=>domainTransaction(ownerPool,schema,fn),password=randomBytes(32).toString('base64url'),email='synthetic-heartbeat@example.test';
  const workerRole=(await domainTransaction(workerPool,schema,client=>client.query('SELECT current_user AS role'))).rows[0].role;
  await provisionOperator(ownerPool,{id:randomUUID(),email,password,name:'Synthetic heartbeat operator'},options);
  const identity=(await authenticateOperator(operatorPool,{email,password},'synthetic-heartbeat',options)).session;
  const policy=(await tx(client=>client.query("SELECT revision FROM provider_policies WHERE scope_key='global'"))).rows[0];
  await saveProviderPolicy(operatorPool,identity,{requestId:randomUUID(),kind:'provider-policy',orgId:null,revision:policy?.revision??0,enabled:true,maxDailyRequests:12,confirmed:true},options);
  const baseline=resolveProviderVerification({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_PROVIDER_TESTS:'gemini-free',GEMINI_API_KEY:'synthetic-native-heartbeat-no-external-key'},
    {fetchImpl:()=>assert.fail('No external or unmetered transport is allowed in the heartbeat rehearsal')});
  let requests=0,onRequest,stop,failedNotify;
  const config=Object.freeze({...baseline,async runStage({stage,language,maxRequests},journal){
    for(let n=0;n<maxRequests;n++){
      const id=await journal.beforeRequest();requests++;await onRequest(n);await journal.afterRequest(id,{httpStatus:200});
    }
    return {fixtureVersion:STAGE_FIXTURE_VERSION,language,requestCount:maxRequests,capability:`synthetic-${stage}`,model:baseline.metadata.models.text,
      checks:['structured_translation','automated_comparison'],outputHash:'a'.repeat(64)};
  }});
  const runtimeConfig={schema,runtimeRoleProfile:'worker',runtimePermissionsRequired:true,providerVerification:config,mail:{available:false}};
  const storage=Object.fromEntries(['save','read','remove','exists'].map(name=>[name,()=>assert.fail(`Unexpected heartbeat rehearsal storage ${name}`)]));
  const seed=async()=>{
    const id=randomUUID(),input={requestId:randomUUID(),kind:'provider-stage-verification',stage:'translation',language:'ar',maxRequests:2,confirmed:true};
    await recordWorkerPresence(workerPool,id,{state:'idle'},runtimeConfig);
    try{await runProviderVerification(operatorPool,identity,input,null,{schema,workerVerification:true,expectedFingerprint:config.fingerprint});}
    finally{await recordWorkerPresence(workerPool,id,{state:'stopped'},runtimeConfig);}
    return input;
  };
  const observed=async()=>{
    const report=await readProviderControls(operatorPool,identity,null,{}, {schema,workerVerification:true});
    const row=await tx(async client=>(await client.query("SELECT h.state,h.stage,c.seen_at,c.seen_at>c.created_at+interval '25 seconds' AS advanced FROM worker_health h JOIN provider_verification_workers c ON c.worker_id=h.id WHERE c.state='active'")).rows[0]);
    return {report,row};
  };
  let healthyObserved=false,drainObserved=false,faultInstalled=false;
  const healthy=await seed(),healthyErrors=[];stop=new AbortController();
  const interrupt=()=>stop.abort();signal?.addEventListener('abort',interrupt,{once:true});
  if(signal?.aborted)interrupt();
  const watchdog=setTimeout(()=>stop.abort(),120000);
  try{
    onRequest=async n=>{
      await delay(18000,undefined,{signal});if(n!==1)return;
      const first=await observed();assert.equal(first.report.worker.status,'available');assert.equal(first.report.worker.workers,1);
      assert.equal(first.row.state,'busy');assert.equal(first.row.stage,'providerVerification');assert.equal(first.row.advanced,true);healthyObserved=true;
      stop.abort();await delay(5500,undefined,{signal});
      const second=await observed();assert.equal(second.report.worker.status,'available');assert.ok(new Date(second.row.seen_at)>new Date(first.row.seen_at));drainObserved=true;
    };
    await runRehearsalWorker(workerPool,storage,runtimeConfig,{signal:stop.signal,onError:stage=>healthyErrors.push(stage)});
    assert.deepEqual(healthyErrors,[]);assert.equal(healthyObserved,true);assert.equal(drainObserved,true);assert.equal(requests,2);
    assert.equal((await operatorReceipt(operatorPool,identity,healthy.requestId,options)).result.state,'verified');
    assert.equal((await observed()).report.worker.status,'stopped');
    if(signal?.aborted)throw Error('Synthetic LOGIN test interrupted');
    const fault=await seed(),faultErrors=[];stop=new AbortController();
    if(signal?.aborted)interrupt();
    const failure=new Promise(resolve=>{failedNotify=resolve;});
    onRequest=async()=>{
      await tx(client=>client.query(`CREATE FUNCTION ${quote(schema)}.synthetic_heartbeat_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.state<>'stopped' THEN RAISE EXCEPTION 'Synthetic heartbeat failure'; END IF; RETURN NEW; END $$`));
      faultInstalled=true;
      await tx(client=>client.query(`GRANT EXECUTE ON FUNCTION ${quote(schema)}.synthetic_heartbeat_failure() TO ${quote(workerRole)}`));
      await tx(client=>client.query(`CREATE TRIGGER synthetic_heartbeat_failure BEFORE INSERT OR UPDATE ON ${quote(schema)}.worker_health FOR EACH ROW EXECUTE FUNCTION ${quote(schema)}.synthetic_heartbeat_failure()`));
      let timer;try{assert.equal(await Promise.race([failure,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),15000);})]),true);}finally{clearTimeout(timer);}
    };
    await assert.rejects(runRehearsalWorker(workerPool,storage,runtimeConfig,{signal:stop.signal,onError:stage=>{faultErrors.push(stage);if(stage==='workerHealth')failedNotify(true);}}),error=>error.message==='Worker heartbeat unavailable');
    assert.deepEqual(faultErrors,['workerHealth']);assert.equal(requests,3);
    const receipt=await operatorReceipt(operatorPool,identity,fault.requestId,options);assert.equal(receipt.result.state,'failed');assert.equal(receipt.result.diagnosticCode,'authority_changed');
    const persistentErrors=[];
    await assert.rejects(runRehearsalWorker(workerPool,storage,runtimeConfig,{signal:stop.signal,onError:stage=>persistentErrors.push(stage)}),error=>error.message==='Worker heartbeat unavailable');
    assert.deepEqual(persistentErrors,['workerHealth']);assert.equal(requests,3);
    const rows=(await tx(client=>client.query("SELECT state,failure_stages FROM worker_health WHERE failure_stages<>'[]'::jsonb"))).rows;
    assert.equal(rows.length,2);assert.ok(rows.every(row=>row.state==='stopped'&&JSON.stringify(row.failure_stages)==='["workerHealth"]'));
    assert.equal((await observed()).report.worker.status,'stopped');
  }finally{
    stop.abort();clearTimeout(watchdog);signal?.removeEventListener('abort',interrupt);
    if(faultInstalled)await tx(async client=>{
      await client.query(`DROP TRIGGER IF EXISTS synthetic_heartbeat_failure ON ${quote(schema)}.worker_health`);
      await client.query(`DROP FUNCTION ${quote(schema)}.synthetic_heartbeat_failure()`);
    });
  }
  const recovered=randomUUID();await recordWorkerPresence(workerPool,recovered,{state:'idle'},runtimeConfig);
  assert.equal((await observed()).report.worker.status,'available');await recordWorkerPresence(workerPool,recovered,{state:'stopped'},runtimeConfig);
  assert.equal((await observed()).report.worker.status,'stopped');
  return {scriptedRequests:requests,externalRequests:0,heartbeatMs:5000,freshnessMs:30000,healthyObserved,drainObserved,
    databaseRejectedHeartbeat:true,persistentStartupRejected:true,recoveredPresenceVerified:true,
    nativeNetworkOrProcessKillClaim:false,checks:['default-heartbeat-real-freshness-and-graceful-drain','database-heartbeat-failure-blocks-second-dispatch-and-result',
      'persistent-heartbeat-failure-rejects-startup-and-persists-stopped-failure','fault-trigger-removed-and-fresh-presence-recovers']};
}
