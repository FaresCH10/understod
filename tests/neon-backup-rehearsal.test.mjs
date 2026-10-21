import test from 'node:test';
import assert from 'node:assert/strict';
import {neonBackupResources,nativeBackupTestEnvironment,rehearseNeonBackup,runNativeBackupFixture} from '../server/postgres/neon-backup-rehearsal.mjs';

const runId='12345678-1234-1234-1234-123456789abc';
const env={UNDERSTOOD_NEON_TEST_ISOLATED:'true',UNDERSTOOD_NEON_TEST_URL:'postgresql://owner:PRIVATE_PASSWORD@ep-synthetic.eu-central-1.aws.neon.tech/test?sslmode=require'};
function fixture({lostCreate=false,drift=false,runnerFailure=false,skip=false}={}){
  const databases=new Map(),calls=[];let outsideChanged=false,closed=false;
  const pool={on(){},async end(){closed=true;},async query(sql,args=[]){
    calls.push(sql);
    if(sql.includes('WHERE datname=$1'))return {rows:databases.has(args[0])?[{...databases.get(args[0])}]:[]};
    if(sql.startsWith('CREATE DATABASE ')){
      const name=sql.match(/^CREATE DATABASE "([^"]+)"/)[1];databases.set(name,{oid:100+databases.size,owner:'owner',marker:null});
      if(lostCreate)throw Error('Lost CREATE acknowledgement');return {rows:[]};
    }
    if(sql.startsWith('COMMENT ON DATABASE ')){
      const [,name,marker]=sql.match(/^COMMENT ON DATABASE "([^"]+)" IS '([^']+)'/);databases.get(name).marker=marker;return {rows:[]};
    }
    if(sql.startsWith('DROP DATABASE ')){databases.delete(sql.match(/^DROP DATABASE "([^"]+)"/)[1]);return {rows:[]};}
    if(sql.includes('pg_stat_activity'))return {rows:[{n:0}]};
    return {rows:[{outside:outsideChanged?1:0}]};
  }};
  return {databases,calls,get closed(){return closed;},options:{confirmed:true,scratchPrivate:true,runId,root:'/source',scratch:'/private',caFile:'/ca.pem',dumpTool:'/pg_dump',restoreTool:'/pg_restore',
    makePool:()=>pool,preflight:async()=>({passed:true,databaseWrites:0,postgresMajor:18,targetFingerprint:'a'.repeat(64)}),version:async()=>18,
    runner:async(command,args,{env:childEnv})=>{
      assert.equal(command,process.execPath);assert.equal(args[0],'--test');assert.equal(childEnv.UNDERSTOOD_BACKUP_TEST_ISOLATED,'true');
      assert.equal(childEnv.GEMINI_API_KEY,undefined);assert.equal(childEnv.UNDERSTOOD_NEON_TEST_URL,undefined);
      if(drift)outsideChanged=true;if(runnerFailure)throw Error('PRIVATE_PASSWORD');
      return `# tests 1\n# pass ${skip?0:1}\n# fail 0\n# skipped ${skip?1:0}\n`;
    }}};
}

test('native backup resources are exact bounded generated identities',()=>{
  const names=neonBackupResources(runId);assert.notEqual(names.source,names.target);
  for(const value of Object.values(names))assert.match(value,/^understood_backup_(src|dst)_[a-f0-9]{32}$/);
  for(const value of ['',"'; DROP DATABASE x",runId.toUpperCase()])assert.throws(()=>neonBackupResources(value));
});

test('native backup child inherits only OS execution and exact synthetic fixture connections',()=>{
  const value=nativeBackupTestEnvironment({PATH:'tools',GEMINI_API_KEY:'PRIVATE',NODE_OPTIONS:'PRIVATE',UNDERSTOOD_POSTGRES_URL:'PRIVATE'},
    {source:'source-fixture',target:'target-fixture',caFile:'/ca',dumpTool:'/dump',restoreTool:'/restore',scratch:'/private'});
  assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);assert.equal(value.TEMP,'/private');assert.equal(value.UNDERSTOOD_BACKUP_TEST_TLS,'true');
});

test('native backup is default-off before connecting or starting tools',async()=>{
  const f=fixture();await assert.rejects(rehearseNeonBackup(env,{...f.options,confirmed:false}),/admission/);
  await assert.rejects(rehearseNeonBackup(env,{...f.options,scratchPrivate:false}),/admission/);assert.equal(f.calls.length,0);
});

test('a genuine non-skipped native child pass removes only both marked idle databases',async()=>{
  const f=fixture(),journal=[];const result=await rehearseNeonBackup(env,{...f.options,checkpoint:async value=>journal.push(value)});
  assert.equal(result.state,'passed');assert.equal(result.checks.length,4);assert.equal(result.existingCatalogAndAclUnchanged,true);
  assert.deepEqual(result.cleanup,{source:'verified-removed',target:'verified-removed'});assert.equal(f.databases.size,0);assert.equal(f.closed,true);
  assert.doesNotMatch(JSON.stringify(journal),/PRIVATE_PASSWORD|postgresql:\/\//);
  assert.ok(f.calls.every(sql=>!sql.includes('CASCADE') && !sql.includes('FORCE')));
});

test('native errors and prerequisite skips are not passes; marked owned databases still cleaned',async()=>{
  for(const config of [{runnerFailure:true},{skip:true}]){
    const f=fixture(config),result=await rehearseNeonBackup(env,f.options);assert.equal(result.state,'failed');
    assert.equal(f.databases.size,0);assert.equal(result.checks.length,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD/);
  }
});

test('lost CREATE acknowledgement leaves unmarked database for reconciliation instead of guessing ownership',async()=>{
  const f=fixture({lostCreate:true}),result=await rehearseNeonBackup(env,f.options);
  assert.equal(result.state,'failed');assert.equal(f.databases.size,1);assert.equal(result.cleanup.source,'refused-or-unverified');
  assert.equal(f.calls.some(sql=>sql.startsWith('DROP DATABASE')),false);
});

test('outside catalog drift blocks database removal and rejects success',async()=>{
  const f=fixture({drift:true}),result=await rehearseNeonBackup(env,f.options);
  assert.equal(result.state,'failed');assert.equal(f.databases.size,2);assert.equal(f.calls.some(sql=>sql.startsWith('DROP DATABASE')),false);
});

test('checkpoint failure still attempts exact marked resource cleanup',async()=>{
  const f=fixture();const result=await rehearseNeonBackup(env,{...f.options,checkpoint:async value=>{
    if(value.phase==='native-encrypted-round-trip')throw Error('Local evidence unavailable');
  }});
  assert.equal(result.state,'failed');assert.equal(f.databases.size,0);assert.equal(f.closed,true);
});

test('native fixture wrapper permits Node diagnostics without relaxing inner native command failures',async()=>{
  const output=await runNativeBackupFixture(process.execPath,['-e','console.error("Node diagnostic");console.log("# tests 1\\n# pass 1\\n# fail 0\\n# skipped 0")'],{env:{}});
  assert.match(output,/Node diagnostic/);assert.match(output,/# pass 1/);
  await assert.rejects(runNativeBackupFixture(process.execPath,['-e','console.error("PRIVATE_PASSWORD testTimeoutFailure");process.exit(1)'],{env:{}}),error=>{
    assert.equal(error.fixtureStatus.exitCode,1);assert.equal(error.fixtureStatus.testBudgetExceeded,true);assert.doesNotMatch(error.message,/PRIVATE_PASSWORD/);return true;
  });
});
