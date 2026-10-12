import test from 'node:test';
import assert from 'node:assert/strict';
import {readSourceRetry,saveSourceRetry,clearSourceRetry,checkedSourceRetryReceipt,checkSourceRetry,sendSourceRetry} from '../src/source-audio-retry.ts';

const session={clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()};
const pending={...session,sourceRequestId:'f05fe020-c081-45c3-85b3-efeece8d8220',sourceHash:'b'.repeat(64),requestId:'338d46c6-1815-4a71-ae36-e759e0ef7601'};
const receipt={found:true,retryId:pending.requestId,sourceRequestId:pending.sourceRequestId,sourceHash:pending.sourceHash,acceptedAt:'2026-10-09T10:00:00.000Z'};
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('source retry references persist exact session and source intent without audio',()=>{
  const storage=store();assert.equal(readSourceRetry(storage,session,pending.sourceRequestId,pending.sourceHash),null);
  saveSourceRetry(storage,pending);assert.deepEqual(readSourceRetry(storage,session,pending.sourceRequestId,pending.sourceHash),pending);
  assert.ok(JSON.stringify(pending).length<512);
  assert.throws(()=>saveSourceRetry(storage,{...pending,requestId:crypto.randomUUID()}),/Resolve/);
  assert.throws(()=>readSourceRetry(storage,{...session,expiresAt:new Date(Date.now()+500000).toISOString()},pending.sourceRequestId,pending.sourceHash),/cannot be verified/);
  assert.throws(()=>readSourceRetry(storage,session,pending.sourceRequestId,'c'.repeat(64)),/cannot be verified/);
  assert.equal(readSourceRetry(storage,{...session,clientContext:'d'.repeat(64)},pending.sourceRequestId,pending.sourceHash),null);
  clearSourceRetry(storage,pending);assert.equal(readSourceRetry(storage,session,pending.sourceRequestId,pending.sourceHash),null);
});
test('source retry fails closed on storage, expiry, corruption and mismatched receipts',()=>{
  const storage=store();assert.throws(()=>saveSourceRetry({...storage,setItem:()=>{}},pending),/No retry was sent/);
  assert.throws(()=>saveSourceRetry(storage,{...pending,expiresAt:'2000-01-01T00:00:00.000Z'}),/ended/);
  storage.setItem(`understood:source-retry:${session.clientContext}:${pending.sourceRequestId}`,'null');
  assert.throws(()=>readSourceRetry(storage,session,pending.sourceRequestId,pending.sourceHash),/cannot be verified/);
  for(const invalid of [{...receipt,sourceHash:'c'.repeat(64)},{...receipt,retryId:crypto.randomUUID()},{...receipt,acceptedAt:'today'},
    {...receipt,secret:'extra'},{found:false,retryId:pending.requestId,sourceRequestId:pending.sourceRequestId,acceptedAt:receipt.acceptedAt}])
    assert.throws(()=>checkedSourceRetryReceipt(invalid,pending),/does not match/);
});
test('source retry sends one exact command and read-only lookup after an uncertain outcome',async()=>{
  let calls=0;
  await assert.rejects(sendSourceRetry(pending,async(url,options)=>{
    calls++;assert.equal(url,`/api/source-audio/${pending.sourceRequestId}/retries`);assert.equal(options.method,'POST');
    assert.equal(options.headers['x-client-session-context'],session.clientContext);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'include');
    assert.deepEqual(JSON.parse(options.body),{requestId:pending.requestId,sourceHash:pending.sourceHash,confirmed:true});throw Error('lost acknowledgement');
  }),/lost acknowledgement/);assert.equal(calls,1);
  const result=await checkSourceRetry(pending,async(url,options)=>{
    calls++;assert.equal(url,`/api/source-audio/${pending.sourceRequestId}/retries/${pending.requestId}`);assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    return Response.json(receipt);
  });assert.deepEqual(result,receipt);assert.equal(calls,2);
  assert.deepEqual(await sendSourceRetry(pending,async()=>Response.json(receipt)),receipt);
  const absent={found:false,retryId:pending.requestId,sourceRequestId:pending.sourceRequestId};
  assert.deepEqual(await checkSourceRetry(pending,async()=>Response.json(absent)),absent);
  await assert.rejects(sendSourceRetry(pending,async()=>Response.json(absent)),/not confirmed/);
  await assert.rejects(sendSourceRetry(pending,async()=>Response.json({error:'Source retry state changed'},{status:409})),/state changed/);
  const abort=new AbortController();abort.abort();await assert.rejects(sendSourceRetry(pending,async()=>{throw Error('must not send');},abort.signal),/abort/i);
});
