import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {startWorkerHeartbeat} from '../server/postgres/worker-heartbeat.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('heartbeat validates its bounded cadence before publishing and redacts startup failures',async()=>{
  let calls=0,failures=0;
  for(const intervalMs of [0,9,10001,1.1,NaN])await assert.rejects(startWorkerHeartbeat(()=>{calls++;},()=>({}),{intervalMs}),/Invalid worker heartbeat/);
  assert.equal(calls,0);
  await assert.rejects(startWorkerHeartbeat(()=>{calls++;throw Error('Private database connection');},()=>({}),{intervalMs:10,onFailure:()=>failures++}),
    e=>e.message==='Worker heartbeat unavailable');
  await sleep(25);assert.equal(calls,1);assert.equal(failures,1);
});

test('heartbeat runs during an awaited stage, never overlaps and drains a held write before terminal stop',async()=>{
  const entered=deferred(),release=deferred(),writes=[];let active=0,maxActive=0,state='idle';
  const heartbeat=await startWorkerHeartbeat(async snapshot=>{
    active++;maxActive=Math.max(maxActive,active);writes.push(snapshot.state);
    if(writes.length===2){entered.resolve();await release.promise;}
    active--;
  },()=>({state}),{intervalMs:10});
  state='busy';await entered.promise;await sleep(30);assert.deepEqual(writes,['idle','busy']);
  let stopped=false;const stopping=heartbeat.stop({state:'stopped'});stopping.then(()=>{stopped=true;});
  assert.equal(heartbeat.stop({state:'stopped'}),stopping);await sleep(25);assert.equal(stopped,false);assert.equal(writes.length,2);
  release.resolve();await stopping;await sleep(25);
  assert.deepEqual(writes,['idle','busy','stopped']);assert.equal(maxActive,1);assert.throws(()=>heartbeat.assertHealthy(),/unavailable/);
});

test('periodic heartbeat failure notifies once, stops automatic retry and keeps errors private',async()=>{
  const failed=deferred(),writes=[];let notices=0;
  const heartbeat=await startWorkerHeartbeat(async snapshot=>{
    writes.push(snapshot.state);if(writes.length===2)throw Error('Private provider connection details');
  },()=>({state:'busy'}),{intervalMs:10,onFailure:()=>{notices++;failed.resolve();}});
  await failed.promise;await sleep(25);assert.equal(writes.length,2);assert.equal(notices,1);
  assert.throws(()=>heartbeat.assertHealthy(),e=>e.message==='Worker heartbeat unavailable');
  await heartbeat.stop({state:'stopped'});assert.deepEqual(writes,['busy','busy','stopped']);
});

test('terminal publication failure is observable and never schedules a later active write',async()=>{
  const writes=[];
  const heartbeat=await startWorkerHeartbeat(snapshot=>{
    writes.push(snapshot.state);if(snapshot.state==='stopped')throw Error('Private database details');
  },()=>({state:'idle'}),{intervalMs:10});
  await assert.rejects(heartbeat.stop({state:'stopped'}),e=>e.message==='Worker heartbeat stop unavailable');
  await sleep(25);assert.deepEqual(writes,['idle','stopped']);
});

test('a heartbeat failure discovered during stop is included in the terminal snapshot',async()=>{
  const entered=deferred(),release=deferred(),writes=[],failures=[];
  const heartbeat=await startWorkerHeartbeat(async snapshot=>{
    writes.push(snapshot);if(writes.length===2){entered.resolve();await release.promise;throw Error('Private late write failure');}
  },()=>({state:'busy',failures:[...failures]}),{intervalMs:10,onFailure:()=>failures.push('workerHealth')});
  await entered.promise;const stopping=heartbeat.stop(()=>({state:'stopped',failures:[...failures]}));release.resolve();await stopping;
  assert.deepEqual(writes.at(-1),{state:'stopped',failures:['workerHealth']});assert.equal(writes.length,3);
});
