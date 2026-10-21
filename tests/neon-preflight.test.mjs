import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {neonTestConnection} from '../server/postgres/neon-test-config.mjs';
import {checkNeonTestDatabase} from '../server/postgres/neon-preflight.mjs';
import {runNeonCheck,loadNeonTestEnvironment} from '../scripts/neon-synthetic-check.mjs';
const env={UNDERSTOOD_NEON_TEST_URL:'postgresql://test_owner:PRIVATE_PASSWORD@ep-synthetic-check.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',UNDERSTOOD_NEON_TEST_ISOLATED:'true'};
test('Neon check admits only an explicit direct isolated endpoint with verified TLS and bounded pool',()=>{
  const config=neonTestConnection(env);assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.enableChannelBinding,true);assert.equal(config.max,2);assert.equal(new URL(config.connectionString).search,'');
  for(const url of [env.UNDERSTOOD_NEON_TEST_URL.replace('neon.tech','neon.tech.attacker.test'),env.UNDERSTOOD_NEON_TEST_URL.replace('ep-synthetic-check.','ep-synthetic-check-pooler.'),env.UNDERSTOOD_NEON_TEST_URL+'&options=unsafe',env.UNDERSTOOD_NEON_TEST_URL+'&sslmode=disable',env.UNDERSTOOD_NEON_TEST_URL.replace('sslmode=require','sslmode=disable'),env.UNDERSTOOD_NEON_TEST_URL+'#private','postgresql://test:secret@localhost/test',env.UNDERSTOOD_NEON_TEST_URL.replace('/neondb','/neondb/other'),env.UNDERSTOOD_NEON_TEST_URL+'\n'])assert.throws(()=>neonTestConnection({...env,UNDERSTOOD_NEON_TEST_URL:url}));
  for(const flag of [undefined,'false',true])assert.throws(()=>neonTestConnection({...env,UNDERSTOOD_NEON_TEST_ISOLATED:flag}));
});
function poolFixture({tls=true,authorized=true,relations=0,sameBackend=false,wrongIdentity=false,canCreate=true}={}){
  const statements=[],state={released:0,ended:0};let count=0;
  const pool={on(){},async connect(){const index=++count;return {connection:{stream:{encrypted:tls,authorized}},async query(sql){statements.push(sql);return {rows:sql.startsWith('SELECT ')?[{database:wrongIdentity?'foreign':'neondb',role:'test_owner',backend:sameBackend?1:index,version:180000,can_create:canCreate,application_relations:relations}]:[]};},release(){state.released++;}};},async end(){state.ended++;}};
  return {pool,statements,state};
}
test('Neon preflight uses two certificate-verified read-only connections and publishes no private target values',async()=>{
  const f=poolFixture(),result=await checkNeonTestDatabase(env,{makePool:()=>f.pool});assert.equal(result.independentConnections,2);assert.equal(result.databaseWrites,0);assert.equal(result.postgresMajor,18);assert.equal(result.productionVerdict,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PASSWORD|test_owner|ep-synthetic-check|neondb/);assert.equal(f.state.released,2);assert.equal(f.state.ended,1);assert.equal(f.statements.filter(sql=>sql==='SET TRANSACTION READ ONLY').length,2);
  assert.ok(f.statements.every(sql=>/^(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION READ ONLY|SELECT )/.test(sql)));
});
test('Neon preflight refuses nonempty, unauthorized, unexpected or multiplexed targets and releases resources',async()=>{
  for(const options of [{tls:false},{authorized:false},{relations:1},{wrongIdentity:true},{sameBackend:true},{canCreate:false}]){
    const f=poolFixture(options);await assert.rejects(checkNeonTestDatabase(env,{makePool:()=>f.pool}));assert.equal(f.state.ended,1);assert.ok(f.state.released>=1);assert.ok(f.statements.every(sql=>!/^\s*(CREATE|DROP|INSERT|UPDATE|DELETE|ALTER|GRANT)\b/.test(sql)));
  }
  let connects=0;await assert.rejects(checkNeonTestDatabase({...env,UNDERSTOOD_NEON_TEST_ISOLATED:'false'},{makePool:()=>{connects++;return poolFixture().pool;}}));assert.equal(connects,0);
});
test('Neon CLI keeps raw credentials in ignored configuration and writes only generic bounded outcome evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'understood-neon-check-'));
  try{
    await writeFile(join(root,'.env'),`UNDERSTOOD_NEON_TEST_URL="${env.UNDERSTOOD_NEON_TEST_URL}"\nUNDERSTOOD_NEON_TEST_ISOLATED=true\n`);
    let calls=0;await assert.rejects(runNeonCheck(root,[],{check:async()=>{calls++;}}));assert.equal(calls,0);
    const failed=await runNeonCheck(root,['--confirm-synthetic'],{check:async()=>{throw Error(env.UNDERSTOOD_NEON_TEST_URL);}}),text=await readFile(failed.path,'utf8');assert.equal(failed.passed,false);assert.doesNotMatch(text,/PRIVATE_PASSWORD|ep-synthetic|test_owner/);
    const passed=await runNeonCheck(root,['--confirm-synthetic'],{check:async()=>({passed:true,databaseWrites:0,productionVerdict:false})});assert.equal(JSON.parse(await readFile(passed.path,'utf8')).state,'passed');
    await writeFile(join(root,'.env'),`UNDERSTOOD_NEON_TEST_URL="${env.UNDERSTOOD_NEON_TEST_URL}"\nUNDERSTOOD_NEON_TEST_URL=duplicate\nUNDERSTOOD_NEON_TEST_ISOLATED=true\n`);assert.throws(()=>loadNeonTestEnvironment(root),/ambiguous/);
  }finally{await rm(root,{recursive:true,force:true});}
});
