import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkedArtifactScope,completeArtifactMutation} from '../src/artifact-request.ts';
import {StaffRequestError,retainStaffRequest} from '../src/staff-request.ts';
import {templateInput} from '../server/template-input.mjs';
import {glossaryInput} from '../server/glossary-input.mjs';
import {checkedTemplateResult,checkedTemplateReceipt,savePendingTemplate,clearPendingTemplate,readPendingTemplate} from '../src/template-recovery.ts';
import {checkedGlossaryResult,checkedGlossaryReceipt,savePendingGlossary,clearPendingGlossary,readPendingGlossary} from '../src/glossary-recovery.ts';

const content={title:'Synthetic template',description:'',source:'Put finished items on the blue shelf.',question:'',facts:[],askedFacts:[]};
const store=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const fixtures=[];
for(const kind of ['create','edit','archive','restore','duplicate','use']) {
  const pending={kind,requestId:randomUUID(),templateId:kind==='create'?null:randomUUID(),body:{confirmed:true,...(kind==='create'?{}:{revision:2}),...(['create','edit'].includes(kind)?content:['duplicate','use'].includes(kind)?{title:content.title}:{})}};
  const fresh=['create','duplicate','use'].includes(kind),result={id:fresh?pending.requestId:pending.templateId,revision:fresh?1:3,...(kind==='use'?{state:'processing'}:{status:kind==='archive'?'archived':'active'})};
  fixtures.push({family:'template',pending,result,request:templateInput(kind,pending.templateId,{...pending.body,requestId:pending.requestId}),validate:checkedTemplateResult,receipt:checkedTemplateReceipt,save:savePendingTemplate,clear:clearPendingTemplate,read:readPendingTemplate});
}
for(const kind of ['create','edit','remove','restore','regenerate']) {
  const pending={kind,requestId:randomUUID(),termId:kind==='create'?null:randomUUID(),body:{confirmed:true,...(kind==='create'?{term:'blue shelf',sourceLanguage:'en',targetLanguage:'ar',override:''}:{revision:2,...(kind==='edit'?{override:''}:{})})}};
  const result={id:kind==='create'?pending.requestId:pending.termId,revision:kind==='create'?1:3,status:kind==='remove'?'removed':'active',invalidatedDrafts:1};
  fixtures.push({family:'glossary',pending,result,request:glossaryInput(kind,pending.termId,{...pending.body,requestId:pending.requestId}),validate:checkedGlossaryResult,receipt:checkedGlossaryReceipt,save:savePendingGlossary,clear:clearPendingGlossary,read:readPendingGlossary});
}

for(const f of fixtures)test(`${f.family} ${f.pending.kind} requires matching acknowledgement, exact saved intent and current completion`,async()=>{
  const storage=store();f.save(storage,'scope',f.pending);let clears=0,reads=0;
  const receipt={found:true,request:f.request,result:f.result},complete=()=>{f.clear(storage,'scope',f.pending.requestId,f.pending);clears++;};
  await completeArtifactMutation({...f.result,duplicate:false},f.pending,f.validate,f.receipt,async()=>{reads++;return receipt;},complete,()=>true);
  assert.equal(clears,1);assert.equal(reads,1);assert.equal(f.read(storage,'scope'),null);
  f.save(storage,'scope',f.pending);
  for(const response of [{found:false},{...receipt,request:{...f.request,extra:'unverified'}},{...receipt,result:{...f.result,revision:999}},{found:false,result:f.result}]) {
    await assert.rejects(completeArtifactMutation(f.result,f.pending,f.validate,f.receipt,async()=>response,complete,()=>true));
    assert.deepEqual(f.read(storage,'scope'),f.pending);assert.equal(clears,1);
  }
  for(const ack of [{...f.result,id:randomUUID()},{...f.result,extra:true},{...f.result,duplicate:'false'},{...f.result,...(f.pending.kind==='use'?{state:'ready'}:{status:'published'})}]) {
    await assert.rejects(completeArtifactMutation(ack,f.pending,f.validate,f.receipt,async()=>receipt,complete,()=>true));
    assert.equal(clears,1);
  }
  let current=true;await assert.rejects(completeArtifactMutation(f.result,f.pending,f.validate,f.receipt,async()=>{current=false;return receipt;},complete,()=>current));
  assert.equal(clears,1);assert.deepEqual(f.read(storage,'scope'),f.pending);
  let held=false;await assert.rejects(completeArtifactMutation(f.result,f.pending,f.validate,f.receipt,async()=>{held=true;return receipt;},complete,()=>true,()=>!held));
  assert.equal(clears,1);
  const altered={...f.pending,body:{...f.pending.body,...(f.pending.kind==='create'?f.family==='template'?{title:'Different title'}:{term:'yellow shelf'}:{revision:8})}};
  storage.setItem(`understood:${f.family==='template'?'templates':'glossary'}:scope`,JSON.stringify(altered));
  assert.throws(()=>f.clear(storage,'scope',f.pending.requestId,f.pending));assert.deepEqual(f.read(storage,'scope'),altered);
  assert.equal(f.receipt({found:false},f.pending),null);
});

test('artifact scope is the original allowed staff identity, never inferred from a missing or different scope',()=>{
  const scope=JSON.stringify(['cedar','beirut','maya']),session={authenticated:true,role:'staff',staffRole:'owner',staffScope:scope,siteState:'active',mode:'credential',clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+60_000).toISOString()};
  assert.equal(checkedArtifactScope(scope,session),scope);
  for(const value of [undefined,null,'',JSON.stringify(['cedar','beirut','another'])])assert.throws(()=>checkedArtifactScope(value,session));
  for(const patch of [{role:'worker'},{staffRole:'auditor'},{staffRole:'administrator'},{authenticated:false},{expiresAt:'2000-01-01T00:00:00.000Z'}])assert.throws(()=>checkedArtifactScope(scope,{...session,...patch}));
});

test('earlier artifact uncertainty survives later known rejection and corrupt empty recovery is not absent',()=>{
  assert.equal(retainStaffRequest(true,true,new StaffRequestError('Rejected',false,403)),true);
  assert.equal(retainStaffRequest(false,true,new StaffRequestError('Rejected',false,403)),false);
  assert.equal(retainStaffRequest(false,true,new StaffRequestError('Changed',false,409,true)),true);
  for(const f of [fixtures[0],fixtures[6]]) {
    const storage=store();storage.setItem(`understood:${f.family==='template'?'templates':'glossary'}:scope`,'');
    assert.throws(()=>f.read(storage,'scope'));
  }
});
