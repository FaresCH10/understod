import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readSetupChange,saveSetupChange,clearSetupChange,checkedSetupResult,checkedSetupReceipt,checkedSetupModel,checkedSetupOptions,setupSignature} from '../src/onboarding-recovery.ts';
import {completeArtifactMutation,checkedArtifactScope} from '../src/artifact-request.ts';
import {StaffRequestError,retainStaffRequest} from '../src/staff-request.ts';
import {onboardingTechnical} from '../server/onboarding-input.mjs';

const session={clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600_000).toISOString()},pending={requestId:randomUUID(),expiresAt:session.expiresAt,body:{revision:0,step:'briefing',firstBriefingId:'shelf',confirmed:true}};
const store=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const receipt={found:true,revision:1,request:pending.body};

test('setup recovery preserves existing records and exact original session and intent without silently replacing private work',()=>{
  const storage=store(),key=`understood:onboarding:${session.clientContext}`;
  storage.setItem(key,JSON.stringify({expiresAt:session.expiresAt,body:{requestId:pending.requestId,...pending.body}}));
  assert.deepEqual(readSetupChange(storage,session),pending);
  assert.equal(readSetupChange(storage,{...session,clientContext:'b'.repeat(64)}),null);
  assert.throws(()=>readSetupChange(storage,{...session,expiresAt:new Date(Date.now()+7200_000).toISOString()}));
  saveSetupChange(storage,session,pending);
  const changed={...pending,body:{...pending.body,step:'access'}};
  assert.throws(()=>saveSetupChange(storage,session,changed),/Recover/);assert.throws(()=>clearSetupChange(storage,session,pending.requestId,changed),/replaced/);
  for(const raw of ['', '{}',JSON.stringify({expiresAt:session.expiresAt,body:{...pending.body,requestId:pending.requestId,extra:true}}),'x'.repeat(2049)]){
    storage.setItem(key,raw);assert.throws(()=>readSetupChange(storage,session));
  }
  assert.throws(()=>saveSetupChange({getItem:()=>null,setItem(){},removeItem(){}},session,pending),/No request was sent/);
  saveSetupChange(store(),session,pending);
  assert.throws(()=>clearSetupChange({getItem:()=>setupSignature(pending),setItem(){},removeItem(){}},session,pending.requestId,pending),/could not be cleared/);
  const expired={...session,expiresAt:new Date(Date.now()-1000).toISOString()};assert.throws(()=>readSetupChange(storage,expired),/session/);
});

test('setup completion requires exact acknowledgement and receipt before clearing and fences later identity, held authority or changed storage',async()=>{
  const storage=store();let clears=0;const complete=()=>{clearSetupChange(storage,session,pending.requestId,pending);clears++;};
  saveSetupChange(storage,session,pending);
  await completeArtifactMutation({revision:1,duplicate:false},pending,checkedSetupResult,checkedSetupReceipt,async()=>receipt,complete,()=>true);
  assert.equal(clears,1);assert.equal(readSetupChange(storage,session),null);saveSetupChange(storage,session,pending);
  for(const raw of [{found:false},{found:false,request:pending.body},{...receipt,revision:2},{...receipt,request:{...pending.body,step:'provider'}},{...receipt,request:{...pending.body,extra:true}}]){
    await assert.rejects(completeArtifactMutation({revision:1,duplicate:true},pending,checkedSetupResult,checkedSetupReceipt,async()=>raw,complete,()=>true));assert.equal(clears,1);
  }
  let live=true;await assert.rejects(completeArtifactMutation({revision:1,duplicate:true},pending,checkedSetupResult,checkedSetupReceipt,async()=>{live=false;return receipt;},complete,()=>live));
  let held=false;await assert.rejects(completeArtifactMutation({revision:1,duplicate:true},pending,checkedSetupResult,checkedSetupReceipt,async()=>{held=true;return receipt;},complete,()=>true,()=>!held));
  await assert.rejects(completeArtifactMutation({revision:1,duplicate:true},pending,checkedSetupResult,checkedSetupReceipt,async()=>{storage.setItem(`understood:onboarding:${session.clientContext}`,setupSignature({...pending,body:{...pending.body,step:'access'}}));return receipt;},complete,()=>true));
  assert.equal(clears,1);assert.equal(checkedSetupReceipt({found:false},pending),null);
  assert.equal(retainStaffRequest(true,true,new StaffRequestError('Later rejected retry',false,403)),true);
});

test('setup models and choices are scoped, bounded and cannot invent live AI readiness',()=>{
  const scope=JSON.stringify(['cedar','beirut','maya']);
  const model={revision:0,step:'organization',firstBriefingId:null,organization:{id:'cedar',name:'Cedar Works',supportEmail:'',revision:0},site:{id:'beirut',name:'Beirut',timezone:'Asia/Beirut',revision:0,generationLanguages:['en'],primaryContact:null,deputyContact:null},resources:{workers:30,activeGrants:0,firstBriefing:null},technical:onboardingTechnical(),savedTechnical:null,checks:{organization:true,support:false,supervisor:false,languages:true,provider:false,access:false,briefing:false},canWrite:true};
  assert.deepEqual(checkedSetupModel(model,scope),model);
  for(const raw of [{...model,revision:-1},{...model,step:'__proto__'},{...model,site:{...model.site,id:'foreign'}},{...model,technical:{...model.technical,liveReady:true}},{...model,savedTechnical:{...model.technical,realDataAllowed:true}},{...model,resources:{...model.resources,workers:-1}},{...model,privateCredential:'not permitted'}])assert.throws(()=>checkedSetupModel(raw,scope));
  const options={items:[{id:'shelf',title:'Shelf',privateUnused:'not copied'}],page:1,pageSize:20,total:1};
  assert.deepEqual(checkedSetupOptions(options),[{id:'shelf',title:'Shelf'}]);
  for(const raw of [{...options,page:2},{...options,pageSize:100},{...options,total:-1},{...options,items:Array(21).fill(options.items[0])},{...options,items:[options.items[0],options.items[0]]}])assert.throws(()=>checkedSetupOptions(raw));
});

test('setup receipt recovery is owner-only and retains exact full staff identity',()=>{
  const scope=JSON.stringify(['cedar','beirut','maya']),owner={...session,authenticated:true,role:'staff',staffRole:'owner',staffScope:scope,siteState:'active',mode:'credential'};
  assert.equal(checkedArtifactScope(scope,owner,['owner']),scope);
  for(const role of ['supervisor','auditor','administrator'])assert.throws(()=>checkedArtifactScope(scope,{...owner,staffRole:role},['owner']));
  assert.throws(()=>checkedArtifactScope(JSON.stringify(['cedar','other','maya']),owner,['owner']));
});
