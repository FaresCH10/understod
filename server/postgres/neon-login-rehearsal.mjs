import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {neonTestConnection} from './neon-test-config.mjs';
import {checkNeonTestDatabase} from './neon-preflight.mjs';
import {withTransaction,acquirePostgresClient,assertPostgresClientHealthy,guardPostgresPool,assertPostgresPoolHealthy} from './db.mjs';
import {runMigrations,verifyMigrations} from './migrate.mjs';
import {configureRuntimePermissions,verifyRuntimePermissions,fenceSourceRuntime,inspectSourceRuntimeFence} from './runtime-permissions.mjs';
import {databaseInventory} from './backup.mjs';
import {domainTransaction,publish,submitAnswer} from './domain.mjs';
import {runRehearsalWorker,startRehearsalApi,syntheticAssessmentAdapter} from './runtime.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../domain.mjs';
import {provisionOperator,authenticateOperator,revokeOperator} from './operators.mjs';
import {saveProviderPolicy,runProviderVerification,readProviderControls} from './provider-controls.mjs';
import {operatorReceipt,saveOperatorControl} from './operations.mjs';
import {reserveProviderOperation} from './provider-budget.mjs';
import {resolveProviderVerification} from '../ai/provider-verification-config.mjs';
import {processOneProviderVerification} from './provider-verification-worker.mjs';
import {recordWorkerPresence} from './worker-health.mjs';
import {exerciseVerificationHeartbeat} from './neon-verification-heartbeat.mjs';

const quote=value=>'"'+value.replaceAll('"','""')+'"';
export function neonLoginResources(runId){
  if(typeof runId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId))throw Error('Invalid isolated LOGIN run identity');
  const suffix=runId.replaceAll('-','');return {database:'understood_login_db_'+suffix,role:'understood_login_rt_'+suffix,schema:'understood_test_login_'+suffix};
}
export function neonServiceResources(runId){
  return {...neonLoginResources(runId),workerRole:'understood_login_wk_'+runId.replaceAll('-','')};
}
export function neonOperatorResources(runId){
  return {...neonServiceResources(runId),operatorRole:'understood_login_op_'+runId.replaceAll('-','')};
}
export const syntheticLoginPassword=()=>randomBytes(32).toString('base64url');
async function existingState(pool,{database,role,workerRole,operatorRole}){
  const roles=[role,...(workerRole?[workerRole]:[]),...(operatorRole?[operatorRole]:[])];
  const statements=[
    ["SELECT oid,datname,datdba,datacl::text,datallowconn,datconnlimit,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname<>$1 ORDER BY oid",[database]],
    ["SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig,shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname<>ALL($1::text[]) ORDER BY oid",[roles]],
    ["SELECT m.* FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname<>ALL($1::text[]) AND u.rolname<>ALL($1::text[]) ORDER BY m.roleid,m.member,m.grantor",[roles]],
    ["SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY oid",[]],
    ["SELECT c.oid,c.relname,c.relnamespace,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY c.oid",[]],
    ["SELECT p.oid,p.proname,p.pronamespace,p.proowner,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY p.oid",[]],
    ['SELECT * FROM pg_default_acl ORDER BY oid',[]],
  ];
  const rows=[];for(const [sql,args] of statements)rows.push((await pool.query(sql,args)).rows);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
const databaseRow=async(pool,name)=>(await pool.query("SELECT oid,pg_get_userbyid(datdba) AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0];
const roleRow=async(pool,name)=>(await pool.query("SELECT oid,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit,rolconfig,rolvaliduntil,shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",[name])).rows[0];
const memberships=async(pool,oid)=>(await pool.query('SELECT m.*,pg_get_userbyid(m.member) AS member_name FROM pg_auth_members m WHERE roleid=$1 ORDER BY member,grantor',[oid])).rows;
async function directIdentity(pool,{database,role},connections=1){
  const clients=[],pids=[];
  try{
    for(let n=0;n<connections;n++)clients.push(await acquirePostgresClient(pool));
    for(const client of clients){
      assert.equal(client.connection?.stream?.encrypted,true);assert.equal(client.connection?.stream?.authorized,true);
      await client.query('BEGIN');await client.query('SET TRANSACTION READ ONLY');
      const row=(await client.query('SELECT current_user AS current,session_user AS session,current_database() AS database,pg_backend_pid() AS pid')).rows[0];
      assert.equal(row.current,role);assert.equal(row.session,role);assert.equal(row.database,database);pids.push(row.pid);await client.query('COMMIT');
    }
    assert.equal(new Set(pids).size,connections);
    for(const client of clients)assertPostgresClientHealthy(client);
  }finally{for(const client of clients){let discard=false;try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard||undefined);}}
}
function connectionFor(config,database,role,password){
  const url=new URL(config.connectionString);url.pathname='/'+database;
  if(role!==undefined){url.username=role;url.password=password;}
  return {...config,connectionString:url.toString(),database,...(role===undefined?{}:{role})};
}

async function exerciseOperatorRuntime(ownerPool,apiPool,workerPool,operatorPool,{schema,signal}){
  const options={schema},tx=fn=>domainTransaction(ownerPool,schema,fn),profiles=['application','worker','operator'],pools=[apiPool,workerPool,operatorPool],roles=[];
  for(let n=0;n<pools.length;n++){
    roles.push((await domainTransaction(pools[n],schema,client=>client.query('SELECT current_user AS role'))).rows[0].role);
    for(const profile of profiles)if(profile===profiles[n])await verifyRuntimePermissions(pools[n],{schema,profile});
    else await assert.rejects(verifyRuntimePermissions(pools[n],{schema,profile}));
  }
  assert.equal(new Set(roles).size,3);
  let denied=0;
  for(const [pool,statements] of [
    [apiPool,['SELECT * FROM provider_verification_jobs','SELECT * FROM provider_verification_authorities','SELECT * FROM provider_verification_workers']],
    [workerPool,['SELECT * FROM operator_audit','INSERT INTO provider_verification_jobs DEFAULT VALUES',"UPDATE provider_verification_jobs SET model='forged' WHERE false"]],
    [operatorPool,['SELECT lease_token FROM provider_verification_jobs','SELECT source FROM briefings',"UPDATE provider_verification_jobs SET status='verified' WHERE false"]],
  ])for(const sql of statements){await assert.rejects(domainTransaction(pool,schema,client=>client.query(sql)),error=>error.code==='42501');denied++;}
  if(signal?.aborted)throw Error('Synthetic LOGIN test interrupted');
  const password=syntheticLoginPassword(),email='synthetic-three-role@example.test';
  await provisionOperator(ownerPool,{id:randomUUID(),email,password,name:'Synthetic isolated operator'},options);
  const identity=(await authenticateOperator(operatorPool,{email,password},'synthetic-three-role',options)).session;
  let scriptedRequests=0,onRequest=async()=>{};
  const configuration=key=>resolveProviderVerification({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_PROVIDER_TESTS:'gemini-free',GEMINI_API_KEY:key},
    {fetchImpl:async()=>{
      scriptedRequests++;await onRequest();
      const {title,facts,question,rubric}=syntheticPrepare(CANONICAL_SOURCE);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title,facts,question,askedFacts:rubric.askedFacts})}]}}]});
    }}),config=configuration('synthetic-three-role-no-external-key');
  let workerId=randomUUID();const presence=(state,value=config)=>recordWorkerPresence(workerPool,workerId,{state},{schema,runtimeRoleProfile:'worker',providerVerification:value});
  const queueOptions={schema,workerVerification:true,expectedFingerprint:config.fingerprint};
  try{
    await presence('idle');
    await saveProviderPolicy(operatorPool,identity,{requestId:randomUUID(),kind:'provider-policy',orgId:null,revision:0,enabled:true,maxDailyRequests:6,confirmed:true},options);
    const report=await readProviderControls(operatorPool,identity,null,{}, {schema,workerVerification:true});
    assert.equal(report.worker.status,'available');assert.equal(report.worker.configFingerprint,config.fingerprint);
    const command=()=>({requestId:randomUUID(),kind:'provider-verification',maxRequests:1,confirmed:true}),first=command();
    const queued=await runProviderVerification(operatorPool,identity,first,null,queueOptions);assert.equal(queued.state,'pending');assert.equal(scriptedRequests,0);
    assert.equal((await runProviderVerification(operatorPool,identity,first,null,queueOptions)).duplicate,true);
    const concurrent=await Promise.all([processOneProviderVerification(workerPool,config,options),processOneProviderVerification(workerPool,config,options)]);
    assert.deepEqual(concurrent.sort(),[false,true]);assert.equal(scriptedRequests,1);
    const receipt=await operatorReceipt(operatorPool,identity,first.requestId,options);assert.equal(receipt.result.state,'verified');assert.equal(receipt.result.operationId,queued.operationId);
    assert.equal((await runProviderVerification(operatorPool,identity,first,null,queueOptions)).duplicate,true);
    const row=await tx(async client=>(await client.query('SELECT attempts,status FROM provider_verification_jobs WHERE request_id=$1',[first.requestId])).rows[0]);assert.equal(row.attempts,1);assert.equal(row.status,'verified');
    const assertFailed=async input=>{
      const row=await tx(async client=>(await client.query('SELECT status,diagnostic_code,result_json,attempts FROM provider_verification_jobs WHERE request_id=$1',[input.requestId])).rows[0]);
      assert.deepEqual(row,{status:'failed',diagnostic_code:'authority_changed',result_json:null,attempts:1});
    };
    const pause=paused=>saveOperatorControl(operatorPool,identity,{requestId:randomUUID(),kind:'system',revision:paused?0:1,jobsPaused:false,providerPaused:paused,confirmed:true},options);
    const paused=command();await runProviderVerification(operatorPool,identity,paused,null,queueOptions);
    onRequest=()=>pause(true);await processOneProviderVerification(workerPool,config,options);await assertFailed(paused);
    assert.equal(await processOneProviderVerification(workerPool,config,options),false);
    await assert.rejects(runProviderVerification(operatorPool,identity,command(),null,queueOptions),/paused/);
    await pause(false);onRequest=async()=>{};
    const rotated=command(),nextConfig=configuration('synthetic-three-role-rotated-no-external-key');
    assert.notEqual(nextConfig.fingerprint,config.fingerprint);await runProviderVerification(operatorPool,identity,rotated,null,queueOptions);
    onRequest=async()=>{await presence('stopped');workerId=randomUUID();await presence('idle',nextConfig);};
    await processOneProviderVerification(workerPool,config,options);await assertFailed(rotated);
    await assert.rejects(runProviderVerification(operatorPool,identity,command(),null,queueOptions),/configuration changed/);
    assert.equal((await runProviderVerification(operatorPool,identity,first,null,queueOptions)).state,'verified');
    await presence('stopped',nextConfig);workerId=randomUUID();await presence('idle');onRequest=async()=>{};
    // Seed an already-expired original approval only in this disposable fixture; no deadline is edited or clock accelerated.
    const expired=command();await tx(async client=>{
      const operation=await reserveProviderOperation(client,{orgId:null,kind:'connection-test',referenceId:expired.requestId,model:config.metadata.models.text,dataClass:'synthetic',maxRequests:1});
      await client.query(`INSERT INTO provider_verifications(request_id,operator_id,session_hash,operation_id,config_hash,request_json,state,deadline_at,test_stage,language)
        VALUES($1,$2,$3,$4,$5,$6,'pending',clock_timestamp()-interval '1 second','connection','en')`,
        [expired.requestId,identity.operator_id,identity.token_hash,operation.id,config.fingerprint,JSON.stringify({kind:'provider-verification',maxRequests:1,confirmed:true})]);
      await client.query(`INSERT INTO provider_verification_jobs(request_id,operation_id,config_hash,model,test_stage,language,max_requests,deadline_at)
        SELECT request_id,operation_id,config_hash,$2,test_stage,language,1,deadline_at FROM provider_verifications WHERE request_id=$1`,[expired.requestId,config.metadata.models.text]);
    });
    const beforeExpiry=scriptedRequests;assert.equal(await processOneProviderVerification(workerPool,config,options),true);assert.equal(scriptedRequests,beforeExpiry);
    const expiredRow=await tx(async client=>(await client.query('SELECT status,diagnostic_code,attempts FROM provider_verification_jobs WHERE request_id=$1',[expired.requestId])).rows[0]);
    assert.deepEqual(expiredRow,{status:'failed',diagnostic_code:'test_interrupted',attempts:0});
    assert.equal((await runProviderVerification(operatorPool,identity,expired,null,queueOptions)).duplicate,true);
    const second=command();await runProviderVerification(operatorPool,identity,second,null,queueOptions);onRequest=()=>revokeOperator(operatorPool,identity,options);
    assert.equal(await processOneProviderVerification(workerPool,config,options),true);await assertFailed(second);
    assert.equal(await processOneProviderVerification(workerPool,config,options),false);assert.equal(scriptedRequests,4);
    assert.equal((await tx(client=>client.query("SELECT SUM(reserved_requests)::int AS n FROM provider_operations WHERE kind='connection-test'"))).rows[0].n,5);
    assert.equal((await tx(client=>client.query("SELECT COUNT(*)::int AS n FROM provider_requests WHERE state='accepted'"))).rows[0].n,4);
  }finally{await presence('stopped');}
  // Deliberately drift one grant only inside the new disposable schema, then restore it before fencing.
  try{
    await tx(client=>client.query(`GRANT UPDATE(result_json) ON TABLE ${quote(schema)}.provider_verification_jobs TO ${quote(roles[2])}`));
    await assert.rejects(verifyRuntimePermissions(operatorPool,{schema,profile:'operator'}));
  }finally{await tx(client=>client.query(`REVOKE UPDATE(result_json) ON TABLE ${quote(schema)}.provider_verification_jobs FROM ${quote(roles[2])}`));}
  await verifyRuntimePermissions(operatorPool,{schema,profile:'operator'});
  try{
    await tx(client=>client.query(`ALTER TABLE ${quote(schema)}.provider_verification_jobs DISABLE TRIGGER verification_job_frozen`));
    for(let n=0;n<pools.length;n++)await assert.rejects(verifyRuntimePermissions(pools[n],{schema,profile:profiles[n]}),/authority guards/);
  }finally{await tx(client=>client.query(`ALTER TABLE ${quote(schema)}.provider_verification_jobs ENABLE TRIGGER verification_job_frozen`));}
  for(let n=0;n<pools.length;n++)await verifyRuntimePermissions(pools[n],{schema,profile:profiles[n]});
  return {roles,deniedStatements:denied,scriptedRequests,checks:['three-distinct-profiles-and-all-wrong-profile-denials','operator-worker-api-positive-column-denials',
    'keyless-reviewed-config-enqueue-original-receipt-and-one-concurrent-claim','revoked-inflight-approval-cannot-promote-or-replay','operator-column-drift-rejected-and-restored',
    'inflight-provider-pause-fences-result-and-new-quota','configuration-rotation-fences-late-result-and-reviewed-new-command',
    'expired-original-queued-approval-closes-without-dispatch-or-refund','disabled-verification-guard-rejects-all-three-profiles-and-restores']};
}

export async function exerciseDedicatedRuntime(ownerPool,runtimePool,{schema,signal,workerPool,operatorPool}){
  if(operatorPool && !workerPool)throw Error('Separate worker and operator runtimes are required');
  if(signal?.aborted)throw Error('Synthetic LOGIN test interrupted');
  if(operatorPool)for(const [pool,profile] of [[runtimePool,'application'],[workerPool,'worker'],[operatorPool,'operator']])await verifyRuntimePermissions(pool,{schema,profile});
  const tx=fn=>domainTransaction(ownerPool,schema,fn),owner={principal_type:'staff',principal_id:'owner',org_id:'a',site_id:'a',role:'owner'};
  await tx(async client=>{
    await client.query("INSERT INTO organizations(id,name) VALUES('a','Synthetic LOGIN A')");
    await client.query("INSERT INTO sites(id,org_id,name,timezone) VALUES('a','a','Synthetic LOGIN site','UTC')");
    await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','a','a','Synthetic owner','owner')");
    await client.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','a','a','Synthetic 001','en')");
    await client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('briefing','a','a','Synthetic direct LOGIN',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
  });
  const options={schema,integrationMode:'synthetic'},publication=await publish(runtimePool,owner,'briefing',{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['worker']},options);
  const assignment=await tx(async client=>(await client.query('SELECT id FROM assignments WHERE publication_id=$1',[publication.id])).rows[0].id);
  const attempt=await submitAnswer(runtimePool,{...owner,principal_type:'worker',principal_id:'worker'},assignment,randomUUID(),'Finished items on the blue shelf; unfinished items on the yellow shelf.',options);
  const controller=new AbortController(),errors=[];
  const interrupt=()=>controller.abort();signal?.addEventListener('abort',interrupt,{once:true});
  const config={...options,tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',port:0,publicOrigin:'http://127.0.0.1:0',mail:{available:false},runtimePermissionsRequired:true,
    runtimeRoleProfile:workerPool?'worker':'application',
    assessmentAdapter:{async assess(...args){controller.abort();return syntheticAssessmentAdapter.assess(...args);}}};
  let server;const timeout=setTimeout(()=>controller.abort(),60000);
  try{
    if(workerPool){
      await verifyRuntimePermissions(runtimePool,{schema,profile:'application'});
      await verifyRuntimePermissions(workerPool,{schema,profile:'worker'});
      await assert.rejects(verifyRuntimePermissions(workerPool,{schema,profile:'application'}),/privileges/);
      await assert.rejects(runRehearsalWorker(runtimePool,{},config,{signal:controller.signal}),/privileges/);
      assert.equal((await tx(client=>client.query('SELECT count(*)::int AS n FROM worker_health'))).rows[0].n,0);
    }
    await runRehearsalWorker(workerPool??runtimePool,{},config,{signal:controller.signal,onError:stage=>errors.push(stage)});assert.deepEqual(errors,[]);
    await tx(async client=>{
      const row=(await client.query('SELECT outcome,assessment_status FROM attempts WHERE id=$1',[attempt.id])).rows[0];assert.equal(row.outcome,'matched');assert.equal(row.assessment_status,'complete');
      assert.equal((await client.query("SELECT count(*)::int AS n FROM audit WHERE action='answer.checked' AND object_id=$1",[attempt.id])).rows[0].n,1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM worker_health WHERE state='stopped'")).rows[0].n,1);
    });
    server=await startRehearsalApi(runtimePool,{},config);const base='http://127.0.0.1:'+server.address().port;
    const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(10000)});assert.equal(health.status,200);assert.equal((await health.json()).backend,'postgres-rehearsal');
    assert.equal((await fetch(base+'/api/overview',{signal:AbortSignal.timeout(10000)})).status,401);
    assert.equal((await fetch(base+'/api/demo/session',{method:'POST',headers:{origin:config.publicOrigin},signal:AbortSignal.timeout(10000)})).status,404);
  }finally{clearTimeout(timeout);controller.abort();signal?.removeEventListener('abort',interrupt);if(server){await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}}
  const denied=[];
  for(const sql of [`CREATE TABLE ${quote(schema)}.forbidden(id integer)`,'CREATE TEMP TABLE forbidden_temp(id integer)',`TRUNCATE ${quote(schema)}.audit`,`DELETE FROM ${quote(schema)}.schema_migrations WHERE false`,`DELETE FROM ${quote(schema)}.restore_access_restrictions WHERE false`]){
    await assert.rejects(domainTransaction(runtimePool,schema,client=>client.query(sql)),error=>error.code==='42501');denied.push('42501');
  }
  await tx(client=>client.query('CREATE TABLE '+quote(schema)+'.future_evidence(id integer)'));
  await assert.rejects(domainTransaction(runtimePool,schema,client=>client.query('SELECT * FROM future_evidence')),error=>error.code==='42501');
  await verifyRuntimePermissions(runtimePool,{schema});
  if(workerPool){
    for(const sql of ['SELECT * FROM invoices','SELECT * FROM platform_operators','SELECT * FROM operator_sessions',
      'UPDATE provider_policies SET enabled=false WHERE false','UPDATE system_controls SET jobs_paused=false WHERE false'])
      await assert.rejects(domainTransaction(workerPool,schema,client=>client.query(sql)),error=>error.code==='42501');
    const apiRole=(await domainTransaction(runtimePool,schema,client=>client.query('SELECT current_user AS role'))).rows[0].role;
    const workerRole=(await domainTransaction(workerPool,schema,client=>client.query('SELECT current_user AS role'))).rows[0].role;
    assert.notEqual(apiRole,workerRole);
    const operator=operatorPool?await exerciseOperatorRuntime(ownerPool,runtimePool,workerPool,operatorPool,{schema,signal}):null;
    const heartbeat=operatorPool?await exerciseVerificationHeartbeat(ownerPool,workerPool,operatorPool,{schema,signal}):null;
    const sourceRoles=[apiRole,workerRole,...(operator?[operator.roles[2]]:[])],profiles={[workerRole]:'worker',...(operator?{[operator.roles[2]]:'operator'}:{})};
    await tx(client=>client.query("INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true) ON CONFLICT(id) DO UPDATE SET jobs_paused=true,provider_paused=true"));
    const inventory=()=>withTransaction(ownerPool,client=>databaseInventory(client,schema)),before=await inventory();
    const fenced=await fenceSourceRuntime(ownerPool,{schema,roles:sourceRoles,profiles,writersStopped:true});
    assert.equal(fenced.runtimeWriteFenceVerified,true);assert.equal(fenced.activationAllowed,false);assert.equal(fenced.productionReady,false);
    assert.deepEqual(await inventory(),before);
    for(const [pool,profile] of [[runtimePool,'application'],[workerPool,'worker'],...(operatorPool?[[operatorPool,'operator']]:[])]){
      await assert.rejects(verifyRuntimePermissions(pool,{schema,profile}),/privileges/);
      await assert.rejects(domainTransaction(pool,schema,client=>client.query("INSERT INTO worker_health(id,state,seen_at) VALUES('fenced','idle',clock_timestamp())")),error=>error.code==='42501');
    }
    assert.equal((await withTransaction(ownerPool,client=>inspectSourceRuntimeFence(client,{schema,roles:sourceRoles}))).runtimeWriteFenceVerified,true);
    assert.deepEqual(await inventory(),before);
    return {passed:true,checks:['separate-api-worker-runtime-profile-admission','wrong-role-startup-rejected-before-heartbeat',
      'api-publication-submission-and-worker-assessment','read-only-api-startup-health-and-auth-denials',
      'worker-billing-operator-and-policy-denials','runtime-ddl-and-future-object-denials',
      'mixed-profile-source-fence-with-unchanged-business-inventory',...(operator?.checks??[]),...(heartbeat?.checks??[])],deniedStatements:denied.length+1+5+2+(operator?operator.deniedStatements+1:0),providerCalls:0,
      ...(operator?{scriptedProviderRequests:operator.scriptedRequests+heartbeat.scriptedRequests,heartbeat}:{}),runtimeProfiles:operator?['application','worker','operator']:['application','worker'],runtimeWriteFenceVerified:true,activationAllowed:false,productionReady:false};
  }
  return {passed:true,checks:['restricted-publication-submission-and-scheduled-assessment','read-only-api-startup-health-and-auth-denials','runtime-ddl-temporary-truncate-maintenance-denials','future-objects-not-automatically-granted'],deniedStatements:denied.length+1,providerCalls:0};
}

export async function rehearseNeonLogin(env,{confirmed=false,separateServices=false,operatorServices=false,confirmedOperator=false,runId=randomUUID(),makePool,preflight=checkNeonTestDatabase,migrate=runMigrations,verifyMigrate=verifyMigrations,configure=configureRuntimePermissions,verify=verifyRuntimePermissions,exercise,checkpoint=async()=>{},signal}={}){
  if(confirmed!==true)throw Error('Explicit temporary database and LOGIN authorization is required');
  if(typeof separateServices!=='boolean' || typeof operatorServices!=='boolean' || typeof confirmedOperator!=='boolean')throw Error('Explicit service-role selection is required');
  if(operatorServices && (!separateServices || !confirmedOperator))throw Error('Separate temporary three-LOGIN authorization is required');
  if(!operatorServices && confirmedOperator)throw Error('Explicit service-role selection is required');
  exercise??=exerciseDedicatedRuntime;
  const names=operatorServices?neonOperatorResources(runId):separateServices?neonServiceResources(runId):neonLoginResources(runId),config=neonTestConnection(env),marker='Understood synthetic LOGIN '+runId;
  const result={schemaVersion:'neon-login-rehearsal-v2',runId,...names,kind:operatorServices?'isolated-api-worker-operator-login-rehearsal':separateServices?'isolated-api-worker-login-rehearsal':'isolated-direct-login-rehearsal',state:'checking',checks:[],cleanupDatabase:'not-created',cleanupRole:'not-created',
    ...(separateServices?{cleanupWorkerRole:'not-created'}:{}),...(operatorServices?{cleanupOperatorRole:'not-created'}:{}),providerCalls:0,realDataUsed:false,productionVerdict:false};
  const roles=[{name:names.role,profile:'application',cleanup:'cleanupRole',disabled:'temporaryLoginDisabled'},
    ...(separateServices?[{name:names.workerRole,profile:'worker',cleanup:'cleanupWorkerRole',disabled:'temporaryWorkerLoginDisabled'}]:[]),
    ...(operatorServices?[{name:names.operatorRole,profile:'operator',cleanup:'cleanupOperatorRole',disabled:'temporaryOperatorLoginDisabled'}]:[])];
  let original,ownerPool,runtimePool,baseline,originalOwner,databaseOid,unhealthy=false;
  const save=async phase=>{if(signal?.aborted && !['cleanup','finished'].includes(phase))throw Error('Synthetic LOGIN test interrupted');result.phase=phase;await checkpoint(structuredClone(result));};
  try{
    await save('preflight');const checked=await preflight(env,{makePool});assert.equal(checked.passed,true);assert.equal(checked.databaseWrites,0);result.targetFingerprint=checked.targetFingerprint;result.postgresMajor=checked.postgresMajor;
    if(!makePool){const pg=await import('pg');makePool=value=>new pg.Pool(value);}
    original=guardPostgresPool(makePool(config));original.on?.('error',()=>{unhealthy=true;});await directIdentity(original,{database:config.database,role:config.role});
    originalOwner=config.role;baseline=await existingState(original,names);
    result.ownership={format:'understood-neon-login-ownership-v1',marker,originalOwner,outsideCatalogAndAclSha256:baseline,database:{name:names.database},roles:[]};
    assert.equal(await databaseRow(original,names.database),undefined);for(const role of roles)assert.equal(await roleRow(original,role.name),undefined);
    const capability=(await original.query('SELECT rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(capability.rolcreatedb,true);assert.equal(capability.rolcreaterole,true);
    await save('database-creation');
    await original.query(`CREATE DATABASE ${quote(names.database)} WITH TEMPLATE template0 OWNER ${quote(originalOwner)} CONNECTION LIMIT ${operatorServices?8:6}`);
    const created=await databaseRow(original,names.database);assert.equal(created?.owner,originalOwner);assert.equal(created?.marker,null);databaseOid=created.oid;
    result.ownership.database={name:names.database,oid:databaseOid,owner:originalOwner,markerObserved:false};await save('database-creation');
    await original.query(`COMMENT ON DATABASE ${quote(names.database)} IS '${marker}'`);result.cleanupDatabase='pending';
    result.ownership.database.markerObserved=true;
    await save('role-creation');
    for(const role of roles){
      role.password=syntheticLoginPassword();assert.match(role.password,/^[A-Za-z0-9_-]{43}$/);
      role.expires=new Date(Date.now()+30*60000).toISOString();
      const proof={name:role.name,profile:role.profile,expires:role.expires,commitAcknowledged:false};result.ownership.roles.push(proof);await save('role-creation');
      await withTransaction(original,async client=>{
      // Neon requires an unhashed password; this generated SQL-safe value is sent only over verified TLS and never logged locally.
        await client.query(`CREATE ROLE ${quote(role.name)} LOGIN PASSWORD '${role.password}' VALID UNTIL '${role.expires}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2`);
        await client.query(`COMMENT ON ROLE ${quote(role.name)} IS '${marker}'`);role.oid=(await roleRow(client,role.name)).oid;
        role.memberships=await memberships(client,role.oid);assert.ok(role.memberships.every(row=>row.member_name===originalOwner));
        Object.assign(proof,{oid:role.oid,markerObserved:true,memberships:structuredClone(role.memberships)});await save('role-creation');
      });result[role.cleanup]='pending';
      proof.commitAcknowledged=true;await save('role-creation');
    }
    const ownerConfig=connectionFor(config,names.database);ownerPool=guardPostgresPool(makePool(ownerConfig));ownerPool.on?.('error',()=>{unhealthy=true;});await directIdentity(ownerPool,{database:names.database,role:originalOwner});
    assert.equal((await ownerPool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','f','m')")).rows[0].n,0);
    await save('migrations');await ownerPool.query('CREATE SCHEMA '+quote(names.schema));
    const applied=await migrate(ownerPool,{schema:names.schema}),migrationCheck=await verifyMigrate(ownerPool,{schema:names.schema});assert.equal(applied.length,migrationCheck.migrations);assert.ok(applied.length>0);result.migrationsApplied=applied.length;
    await save('restricted-permissions');
    for(const role of roles){
      await ownerPool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC,${quote(role.name)}`);
      const configured=await configure(ownerPool,{schema:names.schema,role:role.name,profile:role.profile,dedicatedDatabase:true,writersStopped:true});assert.equal(configured.restricted,true);
      role.pool=guardPostgresPool(makePool(connectionFor(config,names.database,role.name,role.password)));role.pool.on?.('error',()=>{unhealthy=true;});
      await directIdentity(role.pool,{database:names.database,role:role.name},2);
      result.checks.push(separateServices?`two-independent-verified-tls-${role.profile}-connections`:'two-independent-verified-tls-direct-login-connections');
      assert.equal((await verify(role.pool,{schema:names.schema,role:role.name,profile:role.profile})).restricted,true);
      result.checks.push(separateServices?`actual-${role.profile}-runtime-permission-gate`:'actual-production-runtime-permission-gate');
    }
    runtimePool=roles[0].pool;
    await save('restricted-runtime');result.runtime=await exercise(ownerPool,runtimePool,{schema:names.schema,signal,workerPool:roles[1]?.pool,...(operatorServices?{operatorPool:roles[2].pool}:{})});assert.equal(result.runtime.passed,true);result.checks.push(...result.runtime.checks);
    if(signal?.aborted)throw Error('Synthetic LOGIN test interrupted');
    assert.equal(unhealthy,false);for(const pool of [original,ownerPool,...roles.map(role=>role.pool)])assertPostgresPoolHealthy(pool);
    assert.equal(await existingState(original,names),baseline);result.existingCatalogAndAclUnchanged=true;result.state='passed';
  }catch(error){result.state='failed';result.failedPhase=result.phase;result.error='Temporary direct LOGIN rehearsal did not pass.';if(error?.code==='UNDERSTOOD_PG_CONNECTION_LOST')result.diagnosticCode='database-connection-lost';if(/^[0-9A-Z]{5}$/.test(error?.code||''))result.sqlState=error.code;}
  finally{
    for(const pool of [...roles.map(role=>role.pool),ownerPool])if(pool)try{await pool.end();}catch{result.state='failed';}
    if(original){
      try{await save('cleanup');}catch{result.state='failed';result.checkpointUnavailable=true;}
      try{
        let roleCleanupRefused=false;
        for(const owned of roles)try{
          const role=await roleRow(original,owned.name);owned.present=!!role;
          if(role){
            assert.equal(role.marker,marker);if(operatorServices)assert.ok(Number.isInteger(owned.oid));if(owned.oid!==undefined)assert.equal(role.oid,owned.oid);
            await original.query(`ALTER ROLE ${quote(owned.name)} NOLOGIN PASSWORD NULL`);
            result[owned.disabled]=true;
            for(const key of ['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls'])assert.equal(role[key],false);
            assert.equal(role.rolconnlimit,2);assert.equal(role.rolconfig,null);assert.equal(role.rolvaliduntil?.toISOString(),owned.expires);
            const memberRows=await memberships(original,role.oid);assert.ok(memberRows.every(row=>row.member_name===originalOwner));if(owned.memberships)assert.deepEqual(memberRows,owned.memberships);
            assert.equal((await original.query('SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1',[role.oid])).rows.length,0);
            assert.equal((await original.query("SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1 AND deptype='o' LIMIT 1",[role.oid])).rows.length,0);
          }else result[owned.cleanup]='absent';
        }catch{roleCleanupRefused=true;}
        if(roleCleanupRefused){result.cleanupRefusal='role-identity-or-attributes';throw Error('Owned LOGIN cleanup could not be verified');}
        if(await existingState(original,names)!==baseline){result.cleanupRefusal='outside-catalog-changed';throw Error('Outside catalog changed');}
        if(operatorServices){
          const sessions=(await original.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=ANY($1::text[]) AND backend_type='client backend'",[roles.map(role=>role.name)])).rows[0].n;
          if(sessions!==0){result.cleanupRefusal='active-runtime-sessions';throw Error('Temporary LOGIN sessions remain');}
        }
        const database=await databaseRow(original,names.database);
        if(database){
          assert.equal(database.owner,originalOwner);assert.equal(database.marker,marker);if(operatorServices)assert.ok(Number.isInteger(databaseOid));if(databaseOid!==undefined)assert.equal(database.oid,databaseOid);
          const sessions=(await original.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datid=$1 AND backend_type='client backend'",[database.oid])).rows[0].n;
          if(sessions!==0){result.cleanupRefusal='active-target-sessions';throw Error('Temporary database sessions remain');}
          await original.query('DROP DATABASE '+quote(names.database));assert.equal(await databaseRow(original,names.database),undefined);result.cleanupDatabase='verified-removed';
        }else result.cleanupDatabase='absent';
        for(const role of roles)if(role.present){await original.query('DROP ROLE '+quote(role.name));assert.equal(await roleRow(original,role.name),undefined);result[role.cleanup]='verified-removed';}
        assert.equal(await existingState(original,names),baseline);result.existingCatalogAndAclUnchanged=true;
      }catch{if(!['absent','verified-removed'].includes(result.cleanupDatabase))result.cleanupDatabase='refused-or-unverified';for(const role of roles)if(!['absent','verified-removed'].includes(result[role.cleanup]))result[role.cleanup]='refused-or-unverified';result.state='failed';}
      try{await original.end();}catch{result.state='failed';}
    }
    if(!['not-created','absent','verified-removed'].includes(result.cleanupDatabase) || roles.some(role=>!['not-created','absent','verified-removed'].includes(result[role.cleanup])))result.state='failed';
    await save('finished');
  }
  return result;
}
