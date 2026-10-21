import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {acquirePostgresClient,assertPostgresClientHealthy,assertPostgresPoolHealthy,guardPostgresPool,withPostgresClient,withTransaction} from '../server/postgres/db.mjs';

function fixture(query=async()=>({rows:[]})){
  const client=new EventEmitter(),pool=new EventEmitter(),commands=[],releases=[];
  client.query=async sql=>{commands.push(sql);return query(sql,client);};
  client.release=value=>releases.push(value);
  let connected=false;
  pool.connect=async()=>{if(!connected){connected=true;pool.emit('connect',client);}return client;};
  return {pool,client,commands,releases};
}
const lost=error=>error.code==='UNDERSTOOD_PG_CONNECTION_LOST' && !error.message.includes('PRIVATE');

test('leased connection error between statements fails closed, discards and never replays the callback',async()=>{
  const {pool,client,commands,releases}=fixture();let callbacks=0;
  await assert.rejects(withTransaction(pool,async lease=>{
    callbacks++;await lease.query('WRITE');client.emit('error',Error('PRIVATE transport'));
    await assert.rejects(lease.query('LATE WRITE'),lost);
    return 'must not commit';
  }),lost);
  assert.deepEqual(commands,['BEGIN','WRITE']);assert.deepEqual(releases,[true]);assert.equal(callbacks,1);
  assert.throws(()=>assertPostgresPoolHealthy(pool),lost);
});

test('connection error while a callback is awaiting is handled without releasing it early',async()=>{
  const {pool,client,releases}=fixture();let resume,entered;
  const ready=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{resume=resolve;});
  const operation=withTransaction(pool,async()=>{entered();await hold;return 'untrusted';});
  await ready;assert.doesNotThrow(()=>client.emit('error',Error('PRIVATE reset')));assert.deepEqual(releases,[]);
  resume();await assert.rejects(operation,lost);assert.deepEqual(releases,[true]);
});

test('error event during a successful-looking query acknowledgement cannot return success',async()=>{
  for(const statement of ['BEGIN','WRITE','COMMIT']){
    const {pool,commands,releases}=fixture(async(sql,client)=>{if(sql===statement)client.emit('error',Error('PRIVATE lost ack'));return {rows:[]};});
    await assert.rejects(withTransaction(pool,client=>client.query('WRITE')),lost);
    assert.equal(commands.filter(sql=>sql===statement).length,1);assert.deepEqual(releases,[true]);
    assert.equal(commands.includes('ROLLBACK'),false);
  }
});

test('ordinary SQL rejection rolls back while failed rollback discards the lease',async()=>{
  for(const broken of [false,true]){
    const {pool,commands,releases}=fixture(async sql=>{
      if(sql==='WRITE')throw Object.assign(Error('Constraint'),{code:'23505'});
      if(sql==='ROLLBACK'&&broken)throw Error('Rollback unavailable');
      return {rows:[]};
    });
    await assert.rejects(withTransaction(pool,client=>client.query('WRITE')),error=>error.code==='23505'&&(!broken||error.cause.message==='Rollback unavailable'));
    assert.deepEqual(commands,['BEGIN','WRITE','ROLLBACK']);assert.deepEqual(releases,[broken||undefined]);
  }
});

test('BEGIN failure discards the lease without sending a speculative rollback or invoking work',async()=>{
  const {pool,commands,releases}=fixture(async()=>{throw Error('Begin unavailable');});let calls=0;
  await assert.rejects(withTransaction(pool,async()=>{calls++;}),/Begin unavailable/);
  assert.equal(calls,0);assert.deepEqual(commands,['BEGIN']);assert.deepEqual(releases,[true]);
});

test('ended connection cannot return a successful value or accept another query',async()=>{
  const {pool,client,commands,releases}=fixture();
  await assert.rejects(withPostgresClient(pool,async lease=>{
    client.emit('end');await assert.rejects(lease.query('AFTER END'),lost);return true;
  }),lost);
  assert.deepEqual(commands,[]);assert.deepEqual(releases,[true]);
});

test('ambiguous commit is not retried even if a later rollback succeeds',async()=>{
  const {pool,commands,releases}=fixture(async sql=>{if(sql==='COMMIT')throw Error('Lost commit acknowledgement');return {rows:[]};});let calls=0;
  await assert.rejects(withTransaction(pool,async client=>{calls++;await client.query('WRITE');}),/Lost commit/);
  assert.deepEqual(commands,['BEGIN','WRITE','COMMIT','ROLLBACK']);assert.equal(calls,1);assert.deepEqual(releases,[true]);
});

test('one listener survives reuse and late errors, stale leases cannot query a newly reused client',async()=>{
  const {pool,client,commands,releases}=fixture();let old;
  for(let n=0;n<20;n++)await withPostgresClient(pool,async lease=>{old??=lease;await lease.query('READ');});
  assert.equal(client.listenerCount('error'),1);assert.equal(pool.listenerCount('error'),1);
  const current=await acquirePostgresClient(pool);
  await assert.rejects(old.query('STALE WRITE'),/already released/);
  assert.doesNotThrow(()=>assertPostgresClientHealthy(current));current.release();
  assert.doesNotThrow(()=>client.emit('error',Error('PRIVATE late reset')));
  await assert.rejects(acquirePostgresClient(pool),lost);
  assert.equal(commands.length,20);assert.equal(releases.at(-1),true);
});

test('pool idle error is handled and recorded; read-only callback cannot mask a lost lease',async()=>{
  const {pool,client,releases}=fixture();guardPostgresPool(pool);
  assert.doesNotThrow(()=>pool.emit('error',Error('PRIVATE idle reset')));assert.throws(()=>assertPostgresPoolHealthy(pool),lost);
  await assert.rejects(withPostgresClient(pool,async()=>{client.emit('error',Error('PRIVATE read reset'));return true;}),lost);
  assert.deepEqual(releases,[true]);
});
