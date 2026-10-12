import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {domainTransaction} from '../server/postgres/domain.mjs';
import {processStorageProbe,readStorageHealth} from '../server/postgres/storage-health.mjs';
import {localAudioStore} from '../server/private-storage.mjs';

async function fixture() {
  const db=new PGlite();let time=null;
  const pool={async connect(){return {async query(sql,values){if(time)sql=sql.replaceAll('clock_timestamp()',`'${time}'::timestamptz`);return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]};},release(){}};}};
  await runMigrations(pool);const run=fn=>domainTransaction(pool,'public',fn);
  return {db,pool,run,clock:minutes=>{time=new Date(Date.now()+minutes*60000).toISOString();},health:()=>run(readStorageHealth)};
}
function store() {
  const a=new Map(),b=new Map();let writes=0;
  return {a,b,get writes(){return writes;},save:async(r,bytes)=>{writes++;a.set(r.id,Buffer.from(bytes));},saveOriginal:async(r,bytes)=>{writes++;b.set(r.id,Buffer.from(bytes));},
    read:async r=>a.get(r.id),readOriginal:async r=>b.get(r.id),remove:async r=>{a.delete(r.id);},removeOriginal:async r=>{b.delete(r.id);},exists:async r=>a.has(r.id),existsOriginal:async r=>b.has(r.id)};
}
test('storage probe defaults off and verifies actual isolated local write/readback/delete without claiming privacy',async()=>{
  const f=await fixture(),root=await mkdtemp(join(tmpdir(),'understood-health-'));
  try {
    assert.equal(await processStorageProbe(f.pool,null),false);assert.equal((await f.health()).status,'unverified');
    assert.equal(await processStorageProbe(f.pool,localAudioStore(root),{enabled:true}),true);
    assert.deepEqual(await readdir(root),[]);const health=await f.health();assert.equal(health.status,'responding');assert.equal(health.privacy,'unverified');assert.equal(health.productionReady,false);
    assert.equal(health.observation.readbackVerified,true);assert.doesNotMatch(JSON.stringify(health),/operations_probe|storage_health|root|sha256/);
    assert.equal(await processStorageProbe(f.pool,localAudioStore(root),{enabled:true}),false);
    await assert.rejects(f.run(client=>client.query('DELETE FROM storage_probes')),/immutable/);
    f.clock(7);assert.equal((await f.health()).status,'not recently verified');
  }finally{await f.db.close();assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('understood-health-'));await rm(root,{recursive:true,force:true});}
});
test('storage cleanup failure remains pending, throttles retry and never repeats the synthetic writes',async()=>{
  const f=await fixture(),st=store(),remove=st.remove;
  try {
    st.remove=async()=>{throw Error('Private storage credentials must not leak');};
    await processStorageProbe(f.pool,st,{enabled:true});assert.equal((await f.health()).status,'cleanup pending');assert.equal(st.writes,2);assert.equal(st.a.size,1);assert.equal(st.b.size,0);
    assert.equal(await processStorageProbe(f.pool,st,{enabled:true}),false);assert.equal(st.writes,2);
    st.remove=remove;f.clock(6);await processStorageProbe(f.pool,st,{enabled:false});
    assert.equal((await f.health()).status,'responding');assert.equal(st.writes,2);assert.equal(st.a.size,0);
    assert.equal((await f.run(client=>client.query('SELECT COUNT(*)::int n FROM storage_probes'))).rows[0].n,1);
  }finally{await f.db.close();}
});
test('interrupted probe recovers only its exact cleanup and invalid readback stays failed',async()=>{
  const f=await fixture(),st=store(),id=randomUUID();
  try {
    await f.run(client=>client.query("INSERT INTO storage_probes(id,adapter,state,lease_token,lease_until) VALUES($1,'local','processing',$2,clock_timestamp()-interval '1 second')",[id,randomUUID()]));
    st.a.set(id,Buffer.from('Synthetic interrupted bytes'));st.a.set('untouched-customer-object',Buffer.from('Preserved'));
    await processStorageProbe(f.pool,st,{enabled:true});assert.equal(st.writes,0);assert.equal(st.a.has(id),false);assert.equal(st.a.has('untouched-customer-object'),true);assert.equal((await f.health()).status,'failed');
    f.clock(6);st.read=async()=>Buffer.from('Corrupt mocked readback');await processStorageProbe(f.pool,st,{enabled:true});
    assert.equal((await f.health()).status,'failed');assert.equal(st.a.size,1);assert.equal(st.b.size,0);
  }finally{await f.db.close();}
});
