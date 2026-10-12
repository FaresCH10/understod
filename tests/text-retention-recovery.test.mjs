import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readPendingTextRetention,storePendingTextRetention,clearPendingTextRetention,verifyTextRetentionReceipt} from '../src/text-retention-recovery.ts';

const fixture=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('text policy recovery isolates actor/site scope and verifies exact disable or enabled receipts',()=>{
  const storage=fixture(),change={requestId:randomUUID(),revision:2,days:null,confirmed:true};
  storePendingTextRetention(storage,'a',change);assert.equal(readPendingTextRetention(storage,'b'),null);
  assert.deepEqual(readPendingTextRetention(storage,'a'),change);
  assert.throws(()=>storePendingTextRetention(storage,'a',{...change,days:30}),/Resolve/);
  for(const mutation of [{requestId:randomUUID()},{revision:4},{request:{revision:2,days:7,confirmed:true}},{request:{revision:2,days:null,confirmed:false}}])
    assert.throws(()=>verifyTextRetentionReceipt({requestId:change.requestId,revision:3,request:{revision:2,days:null,confirmed:true},...mutation},change),/cannot be verified/);
  verifyTextRetentionReceipt({requestId:change.requestId,revision:3,request:{revision:2,days:null,confirmed:true}},change);
  assert.throws(()=>clearPendingTextRetention(storage,'a',randomUUID()),/changed/);
  clearPendingTextRetention(storage,'a',change.requestId);assert.equal(readPendingTextRetention(storage,'a'),null);
  const enabled={...change,requestId:randomUUID(),days:90};storePendingTextRetention(storage,'a',enabled);
  verifyTextRetentionReceipt({requestId:enabled.requestId,revision:3,request:{revision:2,days:90,confirmed:true}},enabled);
});
test('malformed or unavailable scoped storage never becomes a trusted pending policy',()=>{
  const storage=fixture(),change={requestId:randomUUID(),revision:0,days:7,confirmed:true};
  storage.setItem('understood:text-retention:a','not-json');assert.throws(()=>readPendingTextRetention(storage,'a'),/cannot be verified/);
  storage.values.clear();storage.setItem('understood:text-retention:a',JSON.stringify({...change,extra:'ignored'}));assert.throws(()=>readPendingTextRetention(storage,'a'),/cannot be verified/);
  storage.values.clear();assert.throws(()=>storePendingTextRetention({...storage,setItem(){}},'a',change),/unavailable/);
  storePendingTextRetention(storage,'a',change);assert.throws(()=>clearPendingTextRetention({...storage,removeItem(){}},'a',change.requestId),/could not be cleared/);
});
