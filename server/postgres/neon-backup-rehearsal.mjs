import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {neonTestConnection} from './neon-test-config.mjs';
import {checkNeonTestDatabase} from './neon-preflight.mjs';
import {nativeBackupVersion} from './backup-native.mjs';

export async function runNativeBackupFixture(tool,args,{env,timeoutMs=600000,maxOutputBytes=65536}={}){
  const child=spawn(tool,args,{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let size=0,timedOut=false,tooLarge=false;
  const consume=chunk=>{size+=chunk.length;if(size<=maxOutputBytes)chunks.push(chunk);else{tooLarge=true;child.kill();}};
  child.stdout.on('data',consume);child.stderr.on('data',consume);
  const completion=new Promise(resolve=>{child.once('error',()=>resolve(null));child.once('close',code=>resolve(code));});
  const timer=setTimeout(()=>{
    timedOut=true;
    if(process.platform==='win32' && child.pid && child.exitCode===null){
      const killer=spawn(resolve(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
      killer.once('error',()=>child.kill());
    }else child.kill();
  },timeoutMs);timer.unref();
  let exitCode;try{exitCode=await completion;}finally{clearTimeout(timer);}
  const output=Buffer.concat(chunks).toString('utf8');
  if(exitCode!==0 || timedOut || tooLarge){
    const error=Error('Native synthetic fixture did not pass');
    error.fixtureStatus={exitCode,timedOut,outputLimitExceeded:tooLarge,testBudgetExceeded:/testTimeoutFailure|test timed out|timeout of \d+ms exceeded/i.test(output)};
    throw error;
  }
  // Node's experimental SQLite diagnostic is not a pg_dump/pg_restore warning.
  // The native utility runner inside the fixture still rejects all native warnings.
  return output;
}

const quote=value=>'"'+value.replaceAll('"','""')+'"';
export function neonBackupResources(runId){
  if(typeof runId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId))throw Error('Invalid synthetic backup run');
  const suffix=runId.replaceAll('-','');return {source:'understood_backup_src_'+suffix,target:'understood_backup_dst_'+suffix};
}
export function nativeBackupTestEnvironment(env,{source,target,caFile,dumpTool,restoreTool,scratch}){
  const clean={};
  for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','LANG','LC_ALL'])if(typeof env[name]==='string')clean[name]=env[name];
  return {...clean,TEMP:scratch,TMP:scratch,TMPDIR:scratch,UNDERSTOOD_BACKUP_TEST_ISOLATED:'true',
    UNDERSTOOD_BACKUP_TEST_SOURCE_URL:source,UNDERSTOOD_BACKUP_TEST_RESTORE_URL:target,
    UNDERSTOOD_BACKUP_TEST_TLS:'true',UNDERSTOOD_BACKUP_TEST_CA_FILE:caFile,UNDERSTOOD_PG_DUMP:dumpTool,UNDERSTOOD_PG_RESTORE:restoreTool};
}
async function outsideState(pool,names){
  const rows=[];
  for(const [sql,args] of [
    ["SELECT oid,datname,datdba,datacl::text,datallowconn,datconnlimit,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE NOT(datname=ANY($1::text[])) ORDER BY oid",[Object.values(names)]],
    ['SELECT * FROM pg_roles ORDER BY oid',[]],['SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor',[]],
    ["SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY oid",[]],
    ["SELECT c.oid,c.relname,c.relnamespace,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY c.oid",[]],
    ["SELECT p.oid,p.proname,p.pronamespace,p.proowner,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY p.oid",[]],
    ['SELECT * FROM pg_default_acl ORDER BY oid',[]],
  ])rows.push((await pool.query(sql,args)).rows);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
const databaseRow=async(pool,name)=>(await pool.query("SELECT oid,pg_get_userbyid(datdba) AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0];

export async function rehearseNeonBackup(env,{confirmed=false,scratchPrivate=false,runId=randomUUID(),root,scratch,caFile,dumpTool,restoreTool,
  makePool,preflight=checkNeonTestDatabase,version=nativeBackupVersion,runner=runNativeBackupFixture,checkpoint=async()=>{}}={}){
  if(confirmed!==true || scratchPrivate!==true)throw Error('Explicit temporary backup databases and private scratch admission required');
  const names=neonBackupResources(runId),config=neonTestConnection(env),marker='Understood synthetic native backup '+runId;
  for(const value of [root,scratch,caFile,dumpTool,restoreTool])if(typeof value!=='string' || !value || /[\r\n\0]/.test(value))throw Error('Native backup prerequisites required');
  const result={runId,...names,state:'checking',checks:[],cleanup:{source:'not-created',target:'not-created'},providerCalls:0,realDataUsed:false,productionVerdict:false};
  const oids={};let original,baseline,unhealthy=false;
  const save=async phase=>{result.phase=phase;await checkpoint(structuredClone(result));};
  try{
    await save('prerequisites');
    const toolEnv={};for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[name])toolEnv[name]=process.env[name];
    result.dumpMajor=await version(dumpTool,{env:toolEnv});result.restoreMajor=await version(restoreTool,{env:toolEnv});assert.equal(result.restoreMajor,result.dumpMajor);
    const checked=await preflight(env,{makePool});assert.equal(checked.passed,true);assert.equal(checked.databaseWrites,0);
    assert.ok(result.dumpMajor>=checked.postgresMajor);result.postgresMajor=checked.postgresMajor;result.targetFingerprint=checked.targetFingerprint;
    if(!makePool){const pg=await import('pg');makePool=value=>new pg.Pool(value);}
    original=makePool(config);original.on?.('error',()=>{unhealthy=true;});baseline=await outsideState(original,names);
    for(const [kind,name] of Object.entries(names)){
      assert.equal(await databaseRow(original,name),undefined);await save('create-'+kind);
      await original.query(`CREATE DATABASE ${quote(name)} WITH TEMPLATE template0 OWNER ${quote(config.role)} CONNECTION LIMIT 6`);
      const row=await databaseRow(original,name);assert.equal(row?.owner,config.role);assert.equal(row?.marker,null);oids[kind]=row.oid;
      await original.query(`COMMENT ON DATABASE ${quote(name)} IS '${marker}'`);result.cleanup[kind]='pending';await save('created-'+kind);
    }
    const connection=name=>{const url=new URL(config.connectionString);url.pathname='/'+name;return url.toString();};
    const childEnv=nativeBackupTestEnvironment(process.env,{source:connection(names.source),target:connection(names.target),caFile,dumpTool,restoreTool,scratch});
    await save('native-encrypted-round-trip');
    const output=await runner(process.execPath,['--test',resolve(root,'tests/postgres-backup-native.test.mjs')],{env:childEnv,timeoutMs:600000,maxOutputBytes:65536});
    assert.match(output,/(?:#|\u2139) tests 1\b/);assert.match(output,/(?:#|\u2139) pass 1\b/);assert.match(output,/(?:#|\u2139) fail 0\b/);assert.match(output,/(?:#|\u2139) skipped 0\b/);
    result.checks.push('actual-native-custom-archive-encrypted-round-trip','complete-relational-inventory-and-guard-parity',
      'synthetic-private-recording-byte-readback','restored-access-quarantined-activation-denied');
    assert.equal(unhealthy,false);assert.equal(await outsideState(original,names),baseline);result.existingCatalogAndAclUnchanged=true;result.state='passed';
  }catch(error){result.state='failed';result.failedPhase=result.phase;result.error='Native synthetic backup drill did not pass.';
    if(error?.fixtureStatus)result.nativeFixture=error.fixtureStatus;
    if(/^[0-9A-Z]{5}$/.test(error?.code || ''))result.sqlState=error.code;}
  finally{
    if(original){
      try{await save('cleanup');}catch{result.state='failed';}
      for(const [kind,name] of Object.entries(names).reverse()){
        try{
          assert.equal(await outsideState(original,names),baseline);
          const row=await databaseRow(original,name);
          if(row){
            assert.equal(row.marker,marker);assert.equal(row.owner,config.role);assert.equal(row.oid,oids[kind]);
            assert.equal((await original.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datid=$1 AND backend_type='client backend'",[row.oid])).rows[0].n,0);
            await original.query('DROP DATABASE '+quote(name));assert.equal(await databaseRow(original,name),undefined);result.cleanup[kind]='verified-removed';
          }else result.cleanup[kind]='absent';
        }catch{result.cleanup[kind]='refused-or-unverified';result.state='failed';}
      }
      try{assert.equal(await outsideState(original,names),baseline);result.existingCatalogAndAclUnchanged=true;}catch{result.state='failed';}
      try{await original.end();}catch{result.state='failed';}
    }
    await save('finished');
  }
  return result;
}
