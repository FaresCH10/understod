import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {policyRecoveryScope,verifyPolicyAcknowledgement,completePolicySave,completePolicyRejection} from '../src/policy-state.ts';
import {retainStaffRequest,StaffRequestError} from '../src/staff-request.ts';
import * as audio from '../src/retention-recovery.ts';
import * as text from '../src/text-retention-recovery.ts';
import * as notice from '../src/notice-recovery.ts';

const scope=JSON.stringify(['cedar','beirut','maya']);
const fixture=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('all policy categories bind recovery scope to the original staff identity, not returned metadata',()=>{
  for(const category of ['response','case','generated','activity','briefing']){
    const expected=category==='response'?scope:`${category}:${scope}`;
    assert.equal(policyRecoveryScope(expected,scope,true,category),expected);
    for(const value of [null,undefined,'other',category==='response'?`case:${scope}`:scope])assert.throws(()=>policyRecoveryScope(value,scope,true,category));
    assert.equal(policyRecoveryScope(null,scope,false,category),null);
  }
});
const variants=[
  {name:'audio',make:()=>({requestId:randomUUID(),revision:4,audioDays:30,confirmed:true}),read:audio.readPendingRetention,store:audio.storePendingRetention,clear:audio.clearPendingRetention,verify:audio.verifyRetentionReceipt,patch:{audioDays:7}},
  ...['response','case','generated','activity','briefing'].map(name=>({name,make:()=>({requestId:randomUUID(),revision:4,days:null,confirmed:true}),read:text.readPendingTextRetention,store:text.storePendingTextRetention,clear:text.clearPendingTextRetention,verify:text.verifyTextRetentionReceipt,patch:{days:30}})),
  {name:'notice',make:()=>({requestId:randomUUID(),revision:4,scope,confirmed:true,notices:{en:'',ar:'',ur:''}}),read:notice.readPendingNotice,store:notice.storePendingNotice,clear:notice.clearPendingNotice,verify:notice.verifyNoticeReceipt,patch:{notices:{en:'Synthetic recording information for this site.',ar:'Synthetic recording information for this site.',ur:'Synthetic recording information for this site.'}}}
];
for(const v of variants)test(`${v.name} save requires exact receipt and current authority before unchanged-intent cleanup`,async()=>{
  const storage=fixture(),change=v.make();v.store(storage,scope,change);
  const ack={revision:5,duplicate:false,...(v.name==='notice'?{requestId:change.requestId}:{})};
  const request={...change};delete request.requestId;if(v.name==='notice')delete request.confirmed;
  const receipt={requestId:change.requestId,revision:5,request};
  const finish=(value=ack,get=async()=>receipt,current=()=>true,held=()=>true)=>completePolicySave(value,change,
    (row,intent)=>verifyPolicyAcknowledgement(row,intent,v.name==='notice'),v.verify,get,
    ()=>v.clear(storage,scope,change.requestId,change),current,held);
  await assert.rejects(finish({...ack,revision:6}),/acknowledgement/);assert.deepEqual(v.read(storage,scope),change);
  await assert.rejects(finish(ack,async()=>({...receipt,extra:true})));assert.deepEqual(v.read(storage,scope),change);
  await assert.rejects(finish(ack,async()=>({...receipt,requestId:randomUUID()})));assert.deepEqual(v.read(storage,scope),change);
  let current=true;
  await assert.rejects(finish(ack,async()=>{current=false;return receipt;},()=>current),/context changed/);assert.deepEqual(v.read(storage,scope),change);
  let allowed=true;
  await assert.rejects(finish(ack,async()=>{allowed=false;return receipt;},()=>true,()=>allowed),/verification is pending/);assert.deepEqual(v.read(storage,scope),change);
  await assert.rejects(finish(ack,async()=>{
    for(const [key] of storage.values)storage.setItem(key,JSON.stringify({...change,...v.patch}));return receipt;
  }),/changed/);assert.notDeepEqual(v.read(storage,scope),change);
  for(const [key] of storage.values)storage.setItem(key,JSON.stringify(change));await finish();assert.equal(v.read(storage,scope),null);
  v.store(storage,scope,change);let accepted;
  await assert.rejects(completePolicyRejection(change,v.verify,async()=>false,()=>assert.fail('Malformed rejection evidence cleared intent'),()=>true));
  await completePolicyRejection(change,v.verify,async()=>receipt,value=>{accepted=value;v.clear(storage,scope,change.requestId,change);},()=>true);
  assert.equal(accepted,true);assert.equal(v.read(storage,scope),null);
  await completePolicyRejection(change,v.verify,async()=>null,value=>{accepted=value;},()=>true);assert.equal(accepted,false);
  for(const status of [400,403,409])assert.equal(retainStaffRequest(true,true,new StaffRequestError('Later rejection',false,status)),true);
  assert.equal(retainStaffRequest(false,true,new StaffRequestError('First rejected request',false,400)),false);
  assert.equal(retainStaffRequest(false,true,new StaffRequestError('Stale identity',false,409,true)),true);
});
test('acknowledgements reject extra/missing fields and cannot substitute for an immutable receipt',()=>{
  const change={requestId:randomUUID(),revision:2};
  for(const value of [null,[],{revision:3},{revision:3,duplicate:'false'},{revision:3,duplicate:false,extra:true}])assert.throws(()=>verifyPolicyAcknowledgement(value,change));
  assert.throws(()=>verifyPolicyAcknowledgement({revision:3,duplicate:false,requestId:randomUUID()},change,true));
});
