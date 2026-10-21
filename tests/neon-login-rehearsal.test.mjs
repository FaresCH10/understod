import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions} from '../server/postgres/runtime-permissions.mjs';
import {neonLoginResources,neonServiceResources,neonOperatorResources,syntheticLoginPassword,rehearseNeonLogin,exerciseDedicatedRuntime} from '../server/postgres/neon-login-rehearsal.mjs';
import {runNeonLogin,replaceLoginEvidence} from '../scripts/neon-synthetic-login.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
const env={UNDERSTOOD_NEON_TEST_URL:'postgresql://owner:PRIVATE_PASSWORD@ep-synthetic-login.eu-central-1.aws.neon.tech/neondb?sslmode=require',UNDERSTOOD_NEON_TEST_ISOLATED:'true'};

test('temporary LOGIN requires explicit authorization and generated resource identities before connecting',async()=>{
  let calls=0;
  await assert.rejects(rehearseNeonLogin(env,{makePool(){calls++;}}),/authorization/);
  for(const runId of ['public','pg_owner','../escape',undefined])assert.throws(()=>neonLoginResources(runId));
  const names=neonLoginResources(randomUUID());assert.ok(Object.values(names).every(name=>name.length<63));
  const services=neonServiceResources(randomUUID());assert.ok(Object.values(services).every(name=>name.length<63));assert.notEqual(services.role,services.workerRole);
  await assert.rejects(rehearseNeonLogin(env,{confirmed:true,separateServices:'true',makePool(){calls++;}}),/selection/);
  await assert.rejects(rehearseNeonLogin({...env,UNDERSTOOD_NEON_TEST_ISOLATED:'false'},{confirmed:true,makePool(){calls++;}}));assert.equal(calls,0);
});
test('ephemeral LOGIN passwords are random and use a strict SQL-literal-safe alphabet',()=>{
  const first=syntheticLoginPassword(),second=syntheticLoginPassword();assert.notEqual(first,second);assert.match(first,/^[A-Za-z0-9_-]{43}$/);assert.equal(first.includes("'"),false);
});
test('embedded role simulation exercises the unchanged production policy, scheduled assessment and loopback API; not direct native login proof',async()=>{
  const db=new PGlite(),schema='understood_test_login_embedded',role='synthetic_login_embedded';let tail=Promise.resolve();
  const poolFor=identity=>({async connect(){
    const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
    try{await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');if(identity!=='postgres')await db.exec('SET SESSION AUTHORIZATION '+identity);}
    catch(error){release();throw error;}
    return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};
  }}),owner=poolFor('postgres'),runtime=poolFor(role);
  try{
    await db.exec(`CREATE SCHEMA ${schema};CREATE ROLE ${role} LOGIN NOINHERIT`);await runMigrations(owner,{schema});
    await configureRuntimePermissions(owner,{schema,role,dedicatedDatabase:true,writersStopped:true});
    const result=await exerciseDedicatedRuntime(owner,runtime,{schema});assert.equal(result.passed,true);assert.equal(result.checks.length,4);assert.equal(result.deniedStatements,6);assert.equal(result.providerCalls,0);
  }finally{await db.close();}
});
test('embedded separate service identities exercise the worker profile, wrong-role rejection and durable mixed-role fence; not TLS evidence',async()=>{
  const db=new PGlite(),schema='understood_test_service_embedded',api='synthetic_api_embedded',worker='synthetic_worker_embedded';let tail=Promise.resolve();
  const poolFor=identity=>({async connect(){
    const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
    try{await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');if(identity!=='postgres')await db.exec('SET SESSION AUTHORIZATION '+identity);}
    catch(error){release();throw error;}
    return {query:async(sql,args)=>sql==='SELECT pg_export_snapshot() AS id'?{rows:[{id:'embedded-not-native-snapshot'}]}:
      args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};
  }}),owner=poolFor('postgres');
  try{
    await db.exec(`CREATE SCHEMA ${schema};CREATE ROLE ${api} LOGIN NOINHERIT;CREATE ROLE ${worker} LOGIN NOINHERIT`);await runMigrations(owner,{schema});
    for(const [role,profile] of [[api,'application'],[worker,'worker']])await configureRuntimePermissions(owner,{schema,role,profile,dedicatedDatabase:true,writersStopped:true});
    const result=await exerciseDedicatedRuntime(owner,poolFor(api),{schema,workerPool:poolFor(worker)});
    assert.equal(result.passed,true);assert.equal(result.checks.length,7);assert.equal(result.deniedStatements,13);assert.equal(result.providerCalls,0);
    assert.deepEqual(result.runtimeProfiles,['application','worker']);assert.equal(result.runtimeWriteFenceVerified,true);assert.equal(result.activationAllowed,false);assert.equal(result.productionReady,false);
  }finally{await db.close();}
});

test('embedded three-role runtime exercises keyless operator queue, competing claims, revocation, grant drift and all-role fence; not native concurrency/TLS proof',async()=>{
  const db=new PGlite(),schema='understood_test_operator_embedded',api='synthetic_three_api',worker='synthetic_three_worker',operator='synthetic_three_operator';let tail=Promise.resolve();
  const poolFor=identity=>({async connect(){
    const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
    try{await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');if(identity!=='postgres')await db.exec('SET SESSION AUTHORIZATION '+identity);}
    catch(error){release();throw error;}
    return {query:async(sql,args)=>sql==='SELECT pg_export_snapshot() AS id'?{rows:[{id:'embedded-not-native-snapshot'}]}:
      args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};
  }}),owner=poolFor('postgres');
  try{
    await db.exec(`CREATE SCHEMA ${schema}`);await runMigrations(owner,{schema});
    for(const [role,profile] of [[api,'application'],[worker,'worker'],[operator,'operator']]){
      await db.exec(`CREATE ROLE ${role} LOGIN NOINHERIT`);await configureRuntimePermissions(owner,{schema,role,profile,dedicatedDatabase:true,writersStopped:true});
    }
    for(const [apiPool,workerPool,operatorPool] of [[owner,poolFor(worker),poolFor(operator)],[poolFor(api),poolFor(api),poolFor(operator)],[poolFor(api),poolFor(worker),poolFor(api)]]){
      await assert.rejects(exerciseDedicatedRuntime(owner,apiPool,{schema,workerPool,operatorPool}));
      assert.equal((await owner.connect().then(async client=>{try{return await client.query(`SELECT COUNT(*)::int n FROM ${schema}.organizations`);}finally{client.release();}})).rows[0].n,0);
    }
    const result=await exerciseDedicatedRuntime(owner,poolFor(api),{schema,workerPool:poolFor(worker),operatorPool:poolFor(operator)});
    assert.equal(result.passed,true);assert.equal(result.checks.length,20);assert.equal(result.deniedStatements,23);
    assert.equal(result.providerCalls,0);assert.equal(result.scriptedProviderRequests,7);
    assert.equal(result.heartbeat.healthyObserved,true);assert.equal(result.heartbeat.drainObserved,true);
    assert.equal(result.heartbeat.persistentStartupRejected,true);assert.equal(result.heartbeat.recoveredPresenceVerified,true);
    assert.equal(result.heartbeat.nativeNetworkOrProcessKillClaim,false);
    assert.deepEqual(result.runtimeProfiles,['application','worker','operator']);assert.equal(result.runtimeWriteFenceVerified,true);assert.equal(result.productionReady,false);
  }finally{await db.close();}
});
function fixture({failExercise=false,lostDatabaseAck=false,changedMarker=false,changedWorkerMarker=false,outsideDrift=false,failSecondRole=false,failRoleAt,onConfigure,onExercise,lostRoleCreateAck,lostRoleCommitAck,rollbackUnavailable=false,activeRoleSessions=0,activeDatabaseSessions=0}={}){
  const state={database:null,role:null,roles:new Map(),commands:[],outside:0,pools:[],pid:0,password:null,passwords:[],configured:0,verified:0,profiles:[],snapshotRoleExclusions:[],transactions:new Map()};
  const makePool=config=>{
    const pool=Object.assign(new EventEmitter(),{config,async end(){pool.ended=true;},async connect(){const pid=++state.pid;const client=Object.assign(new EventEmitter(),{connection:{stream:{encrypted:true,authorized:true}},query:(sql,args)=>query(sql,args,pid),release(){}});pool.emit('connect',client);return client;},query:(sql,args)=>query(sql,args,0)});
    state.pools.push(pool);
    async function query(sql,args=[],pid){
      state.commands.push({database:config.database,sql});
      if(sql==='BEGIN'){state.transactions.set(pid,{roles:new Map([...state.roles].map(([key,value])=>[key,{...value}])),createdRole:null});return {rows:[]};}
      if(sql==='COMMIT'){
        const transaction=state.transactions.get(pid);state.transactions.delete(pid);
        if(transaction?.createdRole&&state.roles.size===lostRoleCommitAck)throw Error('PRIVATE_PASSWORD lost role commit acknowledgement');
        return {rows:[]};
      }
      if(sql==='ROLLBACK'){
        const transaction=state.transactions.get(pid);state.transactions.delete(pid);
        if(transaction?.createdRole&&rollbackUnavailable)throw Error('PRIVATE_PASSWORD rollback connection lost');
        if(transaction){state.roles=transaction.roles;state.role=[...state.roles.values()][0]??null;}
        return {rows:[]};
      }
      if(sql.startsWith('SELECT current_user AS current'))return {rows:[{current:config.role,session:config.role,database:config.database,pid}]};
      if(sql.startsWith('SELECT rolcreatedb,rolcreaterole'))return {rows:[{rolcreatedb:true,rolcreaterole:true}]};
      if(sql.includes('FROM pg_database WHERE datname=$1'))return {rows:state.database?[{...state.database,marker:state.markerAltered?'Changed run':state.database.marker}]:[]};
      if(sql.includes('FROM pg_roles WHERE rolname=$1')){const role=state.roles.get(args[0]);return {rows:role?[{...role,marker:state.workerMarkerAltered&&args[0].includes('_wk_')?'Changed worker run':role.marker}]:[]};}
      if(sql.startsWith('CREATE DATABASE')){
        state.database={oid:501,owner:'owner',marker:null};if(lostDatabaseAck)throw Error('PRIVATE_PASSWORD lost acknowledgement');return {rows:[]};
      }
      if(sql.startsWith('COMMENT ON DATABASE')){state.database.marker=sql.match(/IS '([^']+)'/)[1];return {rows:[]};}
      if(sql.startsWith('CREATE ROLE')){
        const name=sql.match(/^CREATE ROLE "([^"]+)"/)[1];if(failSecondRole&&state.roles.size===1 || failRoleAt===state.roles.size+1)throw Error('Synthetic role creation refused');
        const role={oid:502+state.roles.size,rolcanlogin:true,rolsuper:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,rolconnlimit:2,rolconfig:null,rolvaliduntil:new Date(sql.match(/VALID UNTIL '([^']+)'/)[1]),marker:null};
        state.roles.set(name,role);if(!state.role)state.role=role;
        state.transactions.get(pid).createdRole=name;
        if(state.roles.size===lostRoleCreateAck)throw Error('PRIVATE_PASSWORD lost role creation acknowledgement');
        return {rows:[]};
      }
      if(sql.startsWith('COMMENT ON ROLE')){state.roles.get(sql.match(/^COMMENT ON ROLE "([^"]+)"/)[1]).marker=sql.match(/IS '([^']+)'/)[1];return {rows:[]};}
      if(sql.startsWith('ALTER ROLE')){state.roles.get(sql.match(/^ALTER ROLE "([^"]+)"/)[1]).rolcanlogin=false;return {rows:[]};}
      if(sql.startsWith('DROP DATABASE')){state.database=null;return {rows:[]};}
      if(sql.startsWith('DROP ROLE')){const name=sql.match(/^DROP ROLE "([^"]+)"/)[1];if(state.roles.get(name)===state.role)state.role=null;state.roles.delete(name);return {rows:[]};}
      if(sql.includes('pg_stat_activity'))return {rows:[{n:sql.includes('usename=ANY')?activeRoleSessions:activeDatabaseSessions}]};
      if(sql.startsWith('SELECT m.*,pg_get_userbyid'))return {rows:[{member_name:'owner'}]};
      if(sql.startsWith('SELECT 1 FROM pg_auth_members')||sql.startsWith('SELECT 1 FROM pg_shdepend'))return {rows:[]};
      if(sql.startsWith('SELECT count(*)::int AS n FROM pg_class'))return {rows:[{n:0}]};
      if(sql.includes('FROM pg_roles WHERE rolname<>ALL'))state.snapshotRoleExclusions.push([...args[0]]);
      if(sql.startsWith('SELECT'))return {rows:[{existing:state.outside}]};
      return {rows:[]};
    }
    if(config.role!=='owner'){state.password=decodeURIComponent(new URL(config.connectionString).password);state.passwords.push(state.password);}
    return pool;
  };
  const options={confirmed:true,makePool,preflight:async()=>({passed:true,databaseWrites:0,targetFingerprint:'a'.repeat(64),postgresMajor:18}),migrate:async()=>['fixture-only.sql'],verifyMigrate:async()=>({migrations:1}),
    configure:async(pool,input)=>{state.configured++;state.profiles.push(input.profile);assert.notEqual(pool.config.database,'neondb');assert.equal(input.dedicatedDatabase,true);assert.equal(input.writersStopped,true);await onConfigure?.(state,input);return {restricted:true};},
    verify:async pool=>{state.verified++;assert.notEqual(pool.config.role,'owner');return {restricted:true};},
    exercise:async(_owner,runtime,input)=>{if(state.configured>=2){assert.notEqual(runtime,input.workerPool);assert.ok(input.workerPool);}if(state.configured===3){assert.ok(input.operatorPool);assert.notEqual(input.operatorPool,runtime);assert.notEqual(input.operatorPool,input.workerPool);}if(outsideDrift)state.outside++;if(changedMarker)state.markerAltered=true;if(changedWorkerMarker)state.workerMarkerAltered=true;await onExercise?.(state,input);if(failExercise)throw Error('PRIVATE_PASSWORD '+state.password);return {passed:true,checks:['injected-offline-exercise']};}};
  return {state,options};
}
test('resource orchestration configures only its new database, uses a direct runtime login and removes both resources; mock is not native evidence',async()=>{
  const {state,options}=fixture(),result=await rehearseNeonLogin(env,options);
  assert.equal(result.state,'passed',JSON.stringify(result));assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(result.temporaryLoginDisabled,true);
  assert.equal(result.existingCatalogAndAclUnchanged,true);assert.equal(result.productionVerdict,false);assert.equal(state.configured,1);assert.equal(state.verified,1);assert.ok(state.pools.every(pool=>pool.ended));
  assert.equal(state.commands.filter(row=>row.sql.startsWith('CREATE DATABASE')).length,1);assert.equal(state.commands.filter(row=>row.sql.startsWith('CREATE ROLE')).length,1);
  assert.ok(state.commands.filter(row=>row.sql.startsWith('REVOKE')).every(row=>row.database===result.database));
  assert.equal(state.commands.find(row=>row.sql.startsWith('CREATE ROLE')).sql.includes(state.password),true);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD|postgresql:\/\//);assert.equal(JSON.stringify(result).includes(state.password),false);assert.equal(state.database,null);assert.equal(state.role,null);
});
test('two-role orchestration creates exactly one database and two distinct expiring logins, verifies each profile and removes only owned resources',async()=>{
  const {state,options}=fixture(),result=await rehearseNeonLogin(env,{...options,separateServices:true});
  assert.equal(result.state,'passed',JSON.stringify(result));assert.equal(result.kind,'isolated-api-worker-login-rehearsal');
  assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(result.cleanupWorkerRole,'verified-removed');
  assert.equal(result.temporaryLoginDisabled,true);assert.equal(result.temporaryWorkerLoginDisabled,true);assert.equal(result.existingCatalogAndAclUnchanged,true);
  assert.deepEqual(state.profiles,['application','worker']);assert.equal(state.verified,2);assert.ok(state.pools.every(pool=>pool.ended));
  assert.equal(state.commands.filter(row=>row.sql.startsWith('CREATE DATABASE')).length,1);assert.equal(state.commands.filter(row=>row.sql.startsWith('CREATE ROLE')).length,2);
  const drop=state.commands.findIndex(row=>row.sql.startsWith('DROP DATABASE'));assert.equal(state.commands.slice(0,drop).filter(row=>row.sql.startsWith('ALTER ROLE')&&row.sql.endsWith('NOLOGIN PASSWORD NULL')).length,2);
  assert.equal(new Set(state.passwords).size,2);for(const password of state.passwords)assert.equal(JSON.stringify(result).includes(password),false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD|postgresql:\/\//);assert.equal(state.database,null);assert.equal(state.roles.size,0);assert.equal(result.productionVerdict,false);
});
test('two-role runtime failure, partial creation and interruption clean all verifiably owned resources',async()=>{
  for(const mode of [{failExercise:true},{failSecondRole:true},{interrupt:true}]){
    const {state,options}=fixture(mode),controller=new AbortController();
    const result=await rehearseNeonLogin(env,{...options,separateServices:true,signal:controller.signal,checkpoint:async value=>{if(mode.interrupt&&value.phase==='restricted-permissions')controller.abort();}});
    assert.equal(result.state,'failed');assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(result.cleanupWorkerRole,mode.failSecondRole?'absent':'verified-removed');
    assert.equal(state.database,null);assert.equal(state.roles.size,0);assert.ok(state.pools.every(pool=>pool.ended));
    for(const password of state.passwords)assert.equal(JSON.stringify(result).includes(password),false);
  }
});
test('two-role marker changes or outside ACL drift refuse deletion without broad cleanup',async()=>{
  for(const mode of [{changedWorkerMarker:true},{outsideDrift:true}]){
    const {state,options}=fixture(mode),result=await rehearseNeonLogin(env,{...options,separateServices:true});
    assert.equal(result.state,'failed');assert.equal(result.cleanupDatabase,'refused-or-unverified');assert.equal(result.cleanupWorkerRole,'refused-or-unverified');
    assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);assert.equal(state.role.rolcanlogin,false);
    if(mode.outsideDrift)assert.ok([...state.roles.values()].every(role=>role.rolcanlogin===false));
  }
});

test('three-role orchestration requires separate exact approval and rejects mixed CLI selections before connecting',async()=>{
  let calls=0;const makePool=()=>{calls++;throw Error('Unexpected connection');};
  const roles=neonOperatorResources(randomUUID());assert.equal(Object.keys(roles).length,5);
  assert.equal(new Set(Object.values(roles)).size,5);assert.ok(Object.values(roles).every(name=>name.length<63));
  assert.throws(()=>neonOperatorResources('invalid'));
  for(const selection of [
    {operatorServices:true},
    {operatorServices:true,separateServices:true},
    {operatorServices:true,confirmedOperator:true},
    {operatorServices:'true',separateServices:true,confirmedOperator:true},
    {operatorServices:true,separateServices:true,confirmedOperator:'true'},
    {confirmedOperator:true},
  ])await assert.rejects(rehearseNeonLogin(env,{confirmed:true,makePool,...selection}));
  for(const args of [['--confirm-temporary-database-and-three-logins','--confirm-synthetic'],
    ['--confirm-synthetic','--confirm-temporary-database-and-three-logins','--confirm-temporary-database-and-two-logins'],
    ['--confirm-synthetic','--confirm-temporary-database-and-three-login']])await assert.rejects(runNeonLogin('not-read',args,{rehearse:makePool}),/authorization/);
  assert.equal(calls,0);
});

const threeRoles={separateServices:true,operatorServices:true,confirmedOperator:true};
test('three-role checkpoints durably record original nonsecret ownership before each mutation or commit',async()=>{
  const {state,options}=fixture(),checkpoints=[];
  const result=await rehearseNeonLogin(env,{...options,...threeRoles,checkpoint:async value=>checkpoints.push({value,commands:state.commands.length})});
  const creation=state.commands.findIndex(row=>row.sql.startsWith('CREATE DATABASE'));
  const baseline=checkpoints.find(row=>row.value.phase==='database-creation').value.ownership;
  assert.match(baseline.outsideCatalogAndAclSha256,/^[a-f0-9]{64}$/);assert.equal(baseline.database.oid,undefined);
  assert.ok(checkpoints.find(row=>row.value.ownership===baseline).commands<=creation);
  const ready=checkpoints.find(row=>row.value.phase==='restricted-permissions').value.ownership;
  assert.deepEqual(ready.database,{name:result.database,oid:501,owner:'owner',markerObserved:true});assert.equal(ready.roles.length,3);
  for(const role of ready.roles){
    assert.equal(role.commitAcknowledged,true);assert.equal(role.markerObserved,true);assert.ok(Number.isInteger(role.oid));
    assert.ok(checkpoints.some(row=>row.value.ownership?.roles.some(proof=>proof.name===role.name&&proof.oid===role.oid&&!proof.commitAcknowledged)));
    assert.deepEqual(role.memberships,[{member_name:'owner'}]);assert.match(role.expires,/Z$/);
  }
  assert.doesNotMatch(JSON.stringify(checkpoints),/PRIVATE_PASSWORD|postgresql:\/\//);
  for(const secret of state.passwords)assert.equal(JSON.stringify(checkpoints).includes(secret),false);
});

test('leased worker reset becomes a failed bounded result and still cleans all exactly owned resources',async()=>{
  const {state,options}=fixture({onExercise:async(_state,input)=>withTransaction(input.workerPool,async client=>{
    client.emit('error',Error('PRIVATE_PASSWORD socket reset'));return {passed:true};
  })}),result=await rehearseNeonLogin(env,{...options,...threeRoles});
  assert.equal(result.state,'failed');assert.equal(result.diagnosticCode,'database-connection-lost');
  for(const suffix of ['Database','Role','WorkerRole','OperatorRole'])assert.equal(result['cleanup'+suffix],'verified-removed');
  assert.equal(state.roles.size,0);assert.equal(state.database,null);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD/);
});

test('atomic LOGIN evidence replaces complete JSON and leaves the old checkpoint intact on serialization failure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'understood-login-journal-')),path=join(directory,'result.json');
  try{
    await writeFile(path,JSON.stringify({state:'starting'}));
    await replaceLoginEvidence(path,{state:'checking',padding:'x'.repeat(10000)});await replaceLoginEvidence(path,{state:'failed'});
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{state:'failed'});
    await assert.rejects(replaceLoginEvidence(path,{invalid:1n}));
    assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{state:'failed'});assert.deepEqual(await readdir(directory),['result.json']);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('offline three-role orchestration accounts for all connections and exact outside exclusions, disables every owned login before removing resources',async()=>{
  const {state,options}=fixture(),checkpoints=[];
  const result=await rehearseNeonLogin(env,{...options,...threeRoles,checkpoint:async value=>checkpoints.push(value)});
  assert.equal(result.state,'passed',JSON.stringify(result));assert.equal(result.kind,'isolated-api-worker-operator-login-rehearsal');
  assert.deepEqual(state.profiles,['application','worker','operator']);assert.equal(state.verified,3);
  assert.equal(state.commands.filter(row=>row.sql.startsWith('CREATE ROLE')).length,3);
  assert.match(state.commands.find(row=>row.sql.startsWith('CREATE DATABASE')).sql,/CONNECTION LIMIT 8$/);
  assert.equal(state.pools.length,5);assert.ok(state.pools.every(pool=>pool.ended&&pool.config.max===2));
  assert.ok(state.snapshotRoleExclusions.length>=3);
  for(const excluded of state.snapshotRoleExclusions)assert.deepEqual(excluded,[result.role,result.workerRole,result.operatorRole]);
  const drop=state.commands.findIndex(row=>row.sql.startsWith('DROP DATABASE'));
  assert.equal(state.commands.slice(0,drop).filter(row=>row.sql.startsWith('ALTER ROLE')&&row.sql.endsWith('NOLOGIN PASSWORD NULL')).length,3);
  for(const name of ['Role','WorkerRole','OperatorRole'])assert.equal(result['cleanup'+name],'verified-removed');
  for(const name of ['Login','WorkerLogin','OperatorLogin'])assert.equal(result['temporary'+name+'Disabled'],true);
  assert.equal(result.existingCatalogAndAclUnchanged,true);assert.equal(result.productionVerdict,false);
  assert.equal(state.roles.size,0);assert.equal(state.database,null);assert.equal(new Set(state.passwords).size,3);
  for(const secret of ['PRIVATE_PASSWORD',...state.passwords])assert.equal(JSON.stringify({result,checkpoints}).includes(secret),false);
});

test('offline three-role partial creation, operator configuration, runtime failure and interruption clean only proven resources',async()=>{
  for(const mode of [
    {failRoleAt:3},
    {onConfigure:async(_state,input)=>{if(input.profile==='operator')throw Error('Synthetic operator configuration failure');}},
    {failExercise:true},
    {interrupt:true},
  ]){
    const {state,options}=fixture(mode),controller=new AbortController();
    const result=await rehearseNeonLogin(env,{...options,...threeRoles,signal:controller.signal,checkpoint:async value=>{if(mode.interrupt&&value.phase==='restricted-permissions')controller.abort();}});
    assert.equal(result.state,'failed',JSON.stringify(result));assert.equal(result.cleanupDatabase,'verified-removed');
    assert.equal(result.cleanupRole,'verified-removed');assert.equal(result.cleanupWorkerRole,'verified-removed');
    assert.equal(result.cleanupOperatorRole,mode.failRoleAt?'absent':'verified-removed');
    assert.equal(state.roles.size,0);assert.equal(state.database,null);assert.ok(state.pools.every(pool=>pool.ended));
  }
});

test('offline three-role identity drift refuses all deletion while disabling every other provably owned login',async()=>{
  for(const profile of ['_rt_','_wk_','_op_'])for(const mutation of ['marker','oid']){
    const {state,options}=fixture({onExercise:async state=>{
      const role=[...state.roles].find(([name])=>name.includes(profile))[1];
      if(mutation==='marker')role.marker='Unknown owner';else role.oid+=100;
    }}),result=await rehearseNeonLogin(env,{...options,...threeRoles});
    assert.equal(result.state,'failed');assert.equal(result.cleanupDatabase,'refused-or-unverified');
    assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);
    for(const [name,role] of state.roles)assert.equal(role.rolcanlogin,name.includes(profile));
    assert.ok(state.pools.every(pool=>pool.ended));
  }
});

test('offline three-role outside drift, unmarked lost database acknowledgement and database identity drift refuse DROP',async()=>{
  for(const mode of [
    {outsideDrift:true},{lostDatabaseAck:true},
    {onExercise:async state=>{state.database.oid+=100;}},
    {onExercise:async state=>{state.database.marker='Unproven database';}},
  ]){
    const {state,options}=fixture(mode),result=await rehearseNeonLogin(env,{...options,...threeRoles});
    assert.equal(result.state,'failed');assert.equal(result.cleanupDatabase,'refused-or-unverified');
    assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);
    assert.ok([...state.roles.values()].every(role=>!role.rolcanlogin));assert.ok(state.pools.every(pool=>pool.ended));
  }
});

test('offline three-role evidence failures preserve failure and still disable/remove exactly owned resources',async()=>{
  for(const failureAt of ['restricted-permissions','cleanup','finished']){
    const {state,options}=fixture();let result;
    const promise=rehearseNeonLogin(env,{...options,...threeRoles,checkpoint:async value=>{if(value.phase===failureAt)throw Error('Synthetic local evidence failure');}});
    if(failureAt==='finished')await assert.rejects(promise,/Synthetic local evidence failure/);
    else{result=await promise;assert.equal(result.state,'failed');if(failureAt==='cleanup')assert.equal(result.checkpointUnavailable,true);}
    assert.equal(state.roles.size,0);assert.equal(state.database,null);assert.ok(state.pools.every(pool=>pool.ended));
    assert.equal(state.commands.filter(row=>row.sql.startsWith('DROP ROLE')).length,3);
  }
});

test('lost third-role create acknowledgement cleans rolled-back absence but never touches a surviving unmarked identity',async()=>{
  for(const rollbackUnavailable of [false,true]){
    const {state,options}=fixture({lostRoleCreateAck:3,rollbackUnavailable}),result=await rehearseNeonLogin(env,{...options,...threeRoles});
    assert.equal(result.state,'failed');assert.equal(result.failedPhase,'role-creation');
    if(!rollbackUnavailable){
      assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupOperatorRole,'absent');assert.equal(state.roles.size,0);
    }else{
      assert.equal(result.cleanupRefusal,'role-identity-or-attributes');assert.equal(result.cleanupDatabase,'refused-or-unverified');
      assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);
      for(const [name,role] of state.roles)assert.equal(role.rolcanlogin,name.includes('_op_'));
    }
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD|postgresql:\/\//);assert.ok(state.pools.every(pool=>pool.ended));
  }
});

test('lost third-role COMMIT acknowledgement reconciles only its previously observed marker/OID then cleans all owned resources',async()=>{
  const {state,options}=fixture({lostRoleCommitAck:3}),result=await rehearseNeonLogin(env,{...options,...threeRoles});
  assert.equal(result.state,'failed');assert.equal(result.failedPhase,'role-creation');
  for(const suffix of ['Database','Role','WorkerRole','OperatorRole'])assert.equal(result['cleanup'+suffix],'verified-removed');
  assert.equal(state.roles.size,0);assert.equal(state.database,null);assert.ok(state.pools.every(pool=>pool.ended));
  assert.equal(state.commands.filter(row=>row.sql.startsWith('ALTER ROLE')).length,3);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD/);
});

test('three-role cleanup disables logins but refuses all DROP while any owned runtime or target database session remains',async()=>{
  for(const mode of [{activeRoleSessions:1},{activeDatabaseSessions:1},{activeRoleSessions:1,onExercise:async state=>{state.database=null;}}]){
    const {state,options}=fixture(mode),result=await rehearseNeonLogin(env,{...options,...threeRoles});
    assert.equal(result.state,'failed');assert.equal(result.cleanupRefusal,mode.activeRoleSessions?'active-runtime-sessions':'active-target-sessions');
    assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);
    assert.ok([...state.roles.values()].every(role=>!role.rolcanlogin));assert.ok(state.pools.every(pool=>pool.ended));
    assert.equal(state.commands.some(row=>row.sql.includes('pg_terminate_backend')),false);
  }
});
test('failed runtime exercise still disables the owned login and removes only its original resources',async()=>{
  const {state,options}=fixture({failExercise:true}),result=await rehearseNeonLogin(env,options);
  assert.equal(result.state,'failed');assert.equal(result.failedPhase,'restricted-runtime');assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(result.temporaryLoginDisabled,true);
  assert.equal(JSON.stringify(result).includes(state.password),false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD/);
});
test('unmarked lost database acknowledgement, changed marker and outside ACL drift never authorize a DROP',async()=>{
  for(const mode of [{lostDatabaseAck:true},{changedMarker:true},{outsideDrift:true}]){
    const {state,options}=fixture(mode),result=await rehearseNeonLogin(env,options);
    assert.equal(result.state,'failed');assert.equal(result.cleanupDatabase,'refused-or-unverified');assert.equal(state.commands.some(row=>row.sql.startsWith('DROP ')),false);
    if(mode.lostDatabaseAck)assert.equal(state.role,null);else assert.equal(state.role.rolcanlogin,false);
  }
});
test('cleanup continues even when a checkpoint write fails after owned resources were created',async()=>{
  const {state,options}=fixture(),result=await rehearseNeonLogin(env,{...options,checkpoint:async value=>{if(value.phase==='cleanup')throw Error('Synthetic disk fault');}});
  assert.equal(result.state,'failed');assert.equal(result.checkpointUnavailable,true);assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(state.role,null);
});
test('an interrupted LOGIN run still disables its exact expiring role and cleans its resources',async()=>{
  const {state,options}=fixture(),controller=new AbortController();
  const result=await rehearseNeonLogin(env,{...options,signal:controller.signal,checkpoint:async value=>{if(value.phase==='restricted-permissions')controller.abort();}});
  assert.equal(result.state,'failed');assert.equal(result.temporaryLoginDisabled,true);assert.equal(result.cleanupDatabase,'verified-removed');assert.equal(result.cleanupRole,'verified-removed');assert.equal(state.role,null);
});
test('LOGIN CLI is default-off and writes no connection or ephemeral secret into its evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'understood-neon-login-'));
  try{
    await writeFile(join(root,'.env'),`UNDERSTOOD_NEON_TEST_URL="${env.UNDERSTOOD_NEON_TEST_URL}"\nUNDERSTOOD_NEON_TEST_ISOLATED=true\n`);let calls=0;
    for(const args of [[],['--confirm-synthetic'],['--confirm-synthetic','--confirm-temporary-nologin-roles'],['--confirm-temporary-database-and-login','--confirm-synthetic']])await assert.rejects(runNeonLogin(root,args,{rehearse:async()=>{calls++;}}));assert.equal(calls,0);
    const result=await runNeonLogin(root,['--confirm-synthetic','--confirm-temporary-database-and-login'],{rehearse:async(_env,options)=>{calls++;assert.equal(options.confirmed,true);assert.equal(options.separateServices,false);await options.checkpoint({state:'passed',productionVerdict:false});return {state:'passed',cleanupDatabase:'verified-removed',cleanupRole:'verified-removed'};}});
    assert.equal(result.passed,true);assert.equal(calls,1);assert.doesNotMatch(await readFile(result.path,'utf8'),/PRIVATE_PASSWORD|postgresql:\/\//);
    const services=await runNeonLogin(root,['--confirm-synthetic','--confirm-temporary-database-and-two-logins'],{rehearse:async(_env,options)=>{assert.equal(options.confirmed,true);assert.equal(options.separateServices,true);return {state:'passed',cleanupDatabase:'verified-removed',cleanupRole:'verified-removed',cleanupWorkerRole:'verified-removed'};}});
    assert.equal(services.passed,true);assert.equal(services.cleanupWorkerRole,'verified-removed');assert.match(services.path,/neon-service-roles-/);
    const three=await runNeonLogin(root,['--confirm-synthetic','--confirm-temporary-database-and-three-logins'],{rehearse:async(_env,options)=>{
      assert.equal(options.confirmed,true);assert.equal(options.separateServices,true);assert.equal(options.operatorServices,true);assert.equal(options.confirmedOperator,true);
      await options.checkpoint({schemaVersion:'neon-login-rehearsal-v2',state:'passed',productionVerdict:false});
      return {state:'passed',cleanupDatabase:'verified-removed',cleanupRole:'verified-removed',cleanupWorkerRole:'verified-removed',cleanupOperatorRole:'verified-removed'};
    }});
    assert.equal(three.passed,true);assert.equal(three.cleanupOperatorRole,'verified-removed');assert.match(three.path,/neon-three-roles-/);
    assert.equal(JSON.parse(await readFile(three.path,'utf8')).schemaVersion,'neon-login-rehearsal-v2');
    assert.doesNotMatch(await readFile(three.path,'utf8'),/PRIVATE_PASSWORD|postgresql:\/\//);
  }finally{await rm(root,{recursive:true,force:true});}
});
