import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribeAudioDraftChanges} from '../src/worker-audio-draft.ts';

test('audio storage change signal is opaque, rejects malformed messages and stops after unsubscribe',async()=>{
  let count=0,resolve;
  const changed=new Promise(done=>{resolve=done;});
  const stop=subscribeAudioDraftChanges(()=>{count++;resolve();});
  const sender=new BroadcastChannel('understood:worker-audio-change');
  try {
    sender.postMessage({kind:'changed',worker:'must not be consumed'});
    sender.postMessage('other');
    await new Promise(done=>setTimeout(done,30));assert.equal(count,0);
    sender.postMessage('changed');
    await Promise.race([changed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Change not received')),1000))]);
    assert.equal(count,1);stop();sender.postMessage('changed');
    await new Promise(done=>setTimeout(done,30));assert.equal(count,1);
  }finally {stop();sender.close();}
});

test('unsupported change channels do not disable explicit audio recovery',()=>{
  const Original=globalThis.BroadcastChannel;
  try {
    globalThis.BroadcastChannel=class {constructor(){throw Error('Unavailable');}};
    let called=false;const stop=subscribeAudioDraftChanges(()=>{called=true;});
    assert.equal(typeof stop,'function');stop();assert.equal(called,false);
  }finally {globalThis.BroadcastChannel=Original;}
});
