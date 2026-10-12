import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readUsageRequest,storeUsageRequest,clearUsageRequest,requestUsageChange} from '../src/usage-request-recovery.ts';
const fixture=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const pending=()=>({clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString(),requestId:randomUUID(),body:{kind:'quota',message:'Synthetic allowance discussion',confirmed:true}});
test('usage recovery is exact, expiring and actor/site session scoped; failed storage never sends',()=>{
  const store=fixture(),value=pending();storeUsageRequest(store,value);assert.deepEqual(readUsageRequest(store,value),value);assert.equal(readUsageRequest(store,{...value,clientContext:'b'.repeat(64)}),null);
  assert.throws(()=>storeUsageRequest(store,{...value,requestId:randomUUID()}),/Resolve/);assert.throws(()=>readUsageRequest(store,{...value,expiresAt:new Date(0).toISOString()}),/cannot be verified/);
  assert.throws(()=>clearUsageRequest(store,{...value,requestId:randomUUID()}),/changed/);clearUsageRequest(store,value);assert.equal(readUsageRequest(store,value),null);
  assert.throws(()=>storeUsageRequest({...store,setItem(){}},value),/No request was sent/);
  store.values.set(`understood:usage-request:${value.clientContext}`,'not-json');assert.throws(()=>readUsageRequest(store,value),/cannot be verified/);
});
test('usage recovery verifies exact receipt; checks never POST and unchanged retry retains its identity',async()=>{
  const value=pending(),calls=[],receipt={requestId:value.requestId,request:value.body,status:'recorded',delivery:'site_owner_inbox',changesApplied:false,createdAt:new Date().toISOString(),found:true};
  const invoke=data=>async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>data};};
  assert.equal(await requestUsageChange(value,false,invoke({found:false})),false);assert.equal(calls.at(-1).options.method,'GET');
  assert.equal(await requestUsageChange(value,false,invoke(receipt)),true);assert.equal(await requestUsageChange(value,true,invoke({...receipt,duplicate:true})),true);assert.equal(JSON.parse(calls.at(-1).options.body).requestId,value.requestId);assert.equal(calls.at(-1).options.headers['x-client-session-context'],value.clientContext);
  for(const mutation of [{requestId:randomUUID()},{request:{...value.body,message:'Other'}},{changesApplied:true},{delivery:'email_sent'},{createdAt:'invalid'}])await assert.rejects(requestUsageChange(value,false,invoke({...receipt,...mutation})),/receipt/);
  await assert.rejects(requestUsageChange(value,false,invoke({found:false,extra:true})),/receipt/);
});
