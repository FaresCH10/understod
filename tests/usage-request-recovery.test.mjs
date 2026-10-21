import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readUsageRequest,storeUsageRequest,clearUsageRequest,checkedUsageResult,checkedUsageReceipt,checkedUsageInbox} from '../src/usage-request-recovery.ts';
import {completeArtifactMutation,checkedArtifactScope} from '../src/artifact-request.ts';
import {createStaffRequest,StaffRequestError,retainStaffRequest} from '../src/staff-request.ts';
const fixture=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const pending=()=>({clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString(),requestId:randomUUID(),body:{kind:'quota',message:'Synthetic allowance discussion',confirmed:true}});
test('usage recovery is exact, expiring and actor/site session scoped; failed storage never sends',()=>{
  const store=fixture(),value=pending();storeUsageRequest(store,value);assert.deepEqual(readUsageRequest(store,value),value);assert.equal(readUsageRequest(store,{...value,clientContext:'b'.repeat(64)}),null);
  assert.throws(()=>storeUsageRequest(store,{...value,requestId:randomUUID()}),/Resolve/);assert.throws(()=>readUsageRequest(store,{...value,expiresAt:new Date(0).toISOString()}),/cannot be verified/);
  assert.throws(()=>clearUsageRequest(store,{...value,requestId:randomUUID()}),/changed/);clearUsageRequest(store,value);assert.equal(readUsageRequest(store,value),null);
  assert.throws(()=>storeUsageRequest({...store,setItem(){}},value),/No request was sent/);
  store.values.set(`understood:usage-request:${value.clientContext}`,'not-json');assert.throws(()=>readUsageRequest(store,value),/cannot be verified/);
});
test('usage recovery verifies exact acknowledgement and original receipt; checks never POST and explicit retry retains its identity',async()=>{
  const value=pending(),calls=[],record={requestId:value.requestId,request:value.body,status:'recorded',delivery:'site_owner_inbox',changesApplied:false,createdAt:new Date().toISOString()},receipt={...record,found:true};
  const session={...value,authenticated:true,role:'staff',staffRole:'supervisor',staffScope:JSON.stringify(['cedar','beirut','supervisor']),siteState:'active',mode:'synthetic-credential'};
  const request=createStaffRequest(session,()=>true,async(url,options)=>{calls.push({url,options});return Response.json(options.method==='POST'?{...record,duplicate:true}:receipt);});
  assert.equal(checkedUsageReceipt({found:false},value),null);
  assert.deepEqual(checkedUsageReceipt(await request(`/api/usage/requests/${value.requestId}`),value),record);assert.equal(calls.at(-1).options.method,'GET');
  const ack=await request('/api/usage/requests',{...value.body,requestId:value.requestId});
  assert.equal(JSON.parse(calls.at(-1).options.body).requestId,value.requestId);assert.equal(calls.at(-1).options.headers['x-client-session-context'],value.clientContext);
  let completed=false;await completeArtifactMutation(ack,value,checkedUsageResult,checkedUsageReceipt,()=>request(`/api/usage/requests/${value.requestId}`),()=>{completed=true;},()=>true);assert.equal(completed,true);
  for(const mutation of [{requestId:randomUUID()},{request:{...value.body,message:'Other'}},{changesApplied:true},{delivery:'email_sent'},{createdAt:'invalid'},{privateCredential:'never exposed'}])assert.throws(()=>checkedUsageReceipt({...receipt,...mutation},value),/receipt/);
  assert.throws(()=>checkedUsageReceipt({found:false,extra:true},value),/receipt/);
  assert.throws(()=>checkedUsageResult({...record,duplicate:true,found:true},value),/acknowledgement/);
});

test('usage completion cannot clear changed storage, held or replaced authority, mismatching timestamps or earlier uncertainty',async()=>{
  const store=fixture(),value=pending(),record={requestId:value.requestId,request:value.body,status:'recorded',delivery:'site_owner_inbox',changesApplied:false,createdAt:new Date().toISOString()},receipt={...record,found:true};let clears=0;
  const complete=()=>{clearUsageRequest(store,value);clears++;};storeUsageRequest(store,value);
  await assert.rejects(completeArtifactMutation({...record,duplicate:false},value,checkedUsageResult,checkedUsageReceipt,async()=>({...receipt,createdAt:new Date(Date.now()+1000).toISOString()}),complete,()=>true));
  let live=true;await assert.rejects(completeArtifactMutation({...record,duplicate:false},value,checkedUsageResult,checkedUsageReceipt,async()=>{live=false;return receipt;},complete,()=>live));
  let held=false;await assert.rejects(completeArtifactMutation({...record,duplicate:false},value,checkedUsageResult,checkedUsageReceipt,async()=>{held=true;return receipt;},complete,()=>true,()=>!held));
  const changed={...value,body:{...value.body,message:'New private work'}};
  await assert.rejects(completeArtifactMutation({...record,duplicate:false},value,checkedUsageResult,checkedUsageReceipt,async()=>{store.setItem(`understood:usage-request:${value.clientContext}`,JSON.stringify(changed));return receipt;},complete,()=>true));
  assert.equal(clears,0);assert.deepEqual(readUsageRequest(store,value),changed);assert.equal(retainStaffRequest(true,true,new StaffRequestError('Later retry rejected',false,403)),true);
  const owner={...value,authenticated:true,role:'staff',staffRole:'administrator',staffScope:JSON.stringify(['cedar','beirut','admin']),siteState:'active',mode:'synthetic-credential'};
  assert.equal(checkedArtifactScope(owner.staffScope,owner,['owner','administrator','supervisor']),owner.staffScope);
  assert.throws(()=>checkedArtifactScope(owner.staffScope,owner));assert.throws(()=>checkedArtifactScope(owner.staffScope,{...owner,staffRole:'auditor'},['owner','administrator','supervisor']));
});

test('usage inbox validates original role, bounded page metadata and private-field-free records',()=>{
  const value=pending(),record={requestId:value.requestId,request:value.body,status:'recorded',delivery:'site_owner_inbox',changesApplied:false,createdAt:new Date().toISOString()},page={items:[record],page:1,pageSize:10,total:1,scope:'site_owner_inbox'};
  assert.deepEqual(checkedUsageInbox(page,1,'owner'),page);assert.deepEqual(checkedUsageInbox({...page,scope:'your_requests'},1,'administrator').items,[record]);
  for(const raw of [{...page,scope:'your_requests'},{...page,page:2},{...page,pageSize:50},{...page,total:0},{...page,items:Array(11).fill(record),total:11},{...page,items:[record,record],total:2},{...page,items:[{...record,actorEmail:'private'}]},{...page,privateTenant:'foreign'}])assert.throws(()=>checkedUsageInbox(raw,1,'owner'));
  assert.throws(()=>checkedUsageInbox(page,1,'auditor'));assert.throws(()=>checkedUsageInbox({...page,page:10000},10000,'owner'));
});
