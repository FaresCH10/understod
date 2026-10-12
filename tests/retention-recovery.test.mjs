import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingRetention,storePendingRetention,clearPendingRetention,verifyRetentionReceipt} from '../src/retention-recovery.ts';

test('retention reload recovery isolates scope and verifies the original immutable receipt',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const change={requestId:randomUUID(),revision:4,audioDays:7,confirmed:true};
  storePendingRetention(storage,'actor-site-a',change);
  assert.equal(readPendingRetention(storage,'actor-site-b'),null);
  assert.deepEqual(readPendingRetention(storage,'actor-site-a'),change);
  assert.throws(()=>storePendingRetention(storage,'actor-site-a',{...change,audioDays:30}),/Resolve/);
  assert.throws(()=>verifyRetentionReceipt({requestId:change.requestId,revision:5,request:{...change,audioDays:30}},change),/cannot be verified/);
  verifyRetentionReceipt({requestId:change.requestId,revision:5,request:change},change);
  assert.throws(()=>clearPendingRetention(storage,'actor-site-a',randomUUID()),/changed/);
  clearPendingRetention(storage,'actor-site-a',change.requestId);
  assert.equal(readPendingRetention(storage,'actor-site-a'),null);
});
