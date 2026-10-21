import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkedWorkspaceContext,readSettingsChange,storeSettingsChange,clearSettingsChange,checkedSettingsReceipt} from '../src/workspace-settings-state.ts';
import {settingsInput} from '../server/settings-input.mjs';
import {completePolicySave,completePolicyRejection,verifyPolicyAcknowledgement,policyReceiptPath} from '../src/policy-state.ts';
import {retainStaffRequest,StaffRequestError} from '../src/staff-request.ts';
const scope=JSON.stringify(['org','site','owner']);
const fixture=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
test('settings use receipt routes without changing retention request routes',()=>{
  const id=randomUUID();for(const kind of ['organization','site'])assert.equal(policyReceiptPath({endpoint:`/api/settings/${kind}`,receiptEndpoint:`/api/settings/${kind}/receipts`},id),`/api/settings/${kind}/receipts/${id}`);
  assert.equal(policyReceiptPath({endpoint:'/api/retention'},id),`/api/retention/requests/${id}`);
});
test('workspace metadata requires original org/site, recovery scope, valid settings and truthful contacts',()=>{
  const value={organization:{id:'org',name:'Synthetic organization',revision:0,supportEmail:''},site:{id:'site',name:'Synthetic site',revision:0,timezone:'UTC',generationLanguages:['en'],primaryContact:null,deputyContact:null},canWrite:true,canWriteSite:true,recoveryScope:scope};
  assert.equal(checkedWorkspaceContext(value,scope),value);
  for(const patch of [{recoveryScope:JSON.stringify(['org','site','other'])},{organization:{...value.organization,id:'other'}},{site:{...value.site,id:'other'}},{site:{...value.site,generationLanguages:['xx']}},{site:{...value.site,primaryContact:{id:'contact',name:'Synthetic contact',role:'administrator',available:true}}}])assert.throws(()=>checkedWorkspaceContext({...value,...patch},scope));
});
for(const kind of ['organization','site'])test(`${kind} settings retain exact intent across reload, receipt failures, changed storage and authority loss`,async()=>{
  const storage=fixture(),change={requestId:randomUUID(),revision:2,name:'Synthetic changed settings',confirmed:true,...(kind==='organization'?{supportEmail:''}:{timezone:'UTC',generationLanguages:['en','ur'],primaryContactId:null,deputyContactId:null})};
  storeSettingsChange(storage,scope,kind,change);assert.deepEqual(readSettingsChange(storage,scope,kind),change);
  assert.equal(readSettingsChange(storage,'other',kind),null);assert.equal(readSettingsChange(storage,scope,kind==='site'?'organization':'site'),null);
  assert.throws(()=>storeSettingsChange(storage,scope,kind,{...change,name:'Changed after request'}));
  const receipt={kind,requestId:change.requestId,revision:3,request:settingsInput(kind,change)};
  for(const patch of [{kind:'other'},{requestId:randomUUID()},{revision:4},{extra:true},{request:{...receipt.request,name:'Other'}}])assert.throws(()=>checkedSettingsReceipt({...receipt,...patch},kind,change));
  let current=true;
  const finish=get=>completePolicySave({revision:3,duplicate:false},change,verifyPolicyAcknowledgement,(row,intent)=>checkedSettingsReceipt(row,kind,intent),get,
    ()=>clearSettingsChange(storage,scope,kind,change.requestId,change),()=>current);
  await assert.rejects(finish(async()=>{current=false;return receipt;}));assert.deepEqual(readSettingsChange(storage,scope,kind),change);
  current=true;await assert.rejects(finish(async()=>{for(const [key] of storage.values)storage.setItem(key,JSON.stringify({...change,name:'Newer saved intent'}));return receipt;}),/changed/);
  for(const [key] of storage.values)storage.setItem(key,JSON.stringify(change));await finish(async()=>receipt);assert.equal(readSettingsChange(storage,scope,kind),null);
  let accepted;await completePolicyRejection(change,(row,intent)=>checkedSettingsReceipt(row,kind,intent),async()=>receipt,value=>{accepted=value;},()=>true);assert.equal(accepted,true);
  assert.equal(retainStaffRequest(true,true,new StaffRequestError('Later rejection',false,409)),true);
  assert.throws(()=>storeSettingsChange({...storage,setItem(){}},scope,kind,change),/unavailable/);
});
