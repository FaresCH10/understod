import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pendingPreparationInput,savePendingPreparation,readPendingPreparation,clearPendingPreparation,checkedPreparationContext,checkedPreparationRequestResult,checkedPreparationRequestReceipt} from '../src/preparation-request-recovery.ts';
import {completeArtifactMutation} from '../src/artifact-request.ts';
const store=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const pending={requestId:randomUUID(),briefingId:'draft',body:{revision:1,jobId:'job',generation:2}};
const ack={id:'job',state:'processing',acceptedAt:'2026-10-14T09:00:00.000Z'};
const receipt={found:true,request:pendingPreparationInput(pending),result:ack};
test('preparation recovery freezes exact actor, briefing, revision, job and queue generation through uncertainty',async()=>{
  const storage=store(),changed={...pending,body:{...pending.body,generation:3}};
  savePendingPreparation(storage,'original',pending);assert.deepEqual(readPendingPreparation(storage,'original','draft'),pending);
  assert.equal(readPendingPreparation(storage,'other','draft'),null);assert.equal(readPendingPreparation(storage,'original','other-draft'),null);
  assert.throws(()=>savePendingPreparation(storage,'original',changed),/Recover/);assert.throws(()=>clearPendingPreparation(storage,'original',pending.requestId,changed),/changed/);
  let clears=0;const clear=()=>{clearPendingPreparation(storage,'original',pending.requestId,pending);clears++;};
  for(const response of [{found:false},{...receipt,request:{...receipt.request,generation:3}},{...receipt,result:{...ack,id:'other-job'}},{...receipt,result:{...ack,acceptedAt:'2026-10-14T09:01:00.000Z'}}]) {
    await assert.rejects(completeArtifactMutation(ack,pending,checkedPreparationRequestResult,checkedPreparationRequestReceipt,async()=>response,clear,()=>true));assert.equal(clears,0);
    assert.deepEqual(readPendingPreparation(storage,'original','draft'),pending);
  }
  let live=true;await assert.rejects(completeArtifactMutation(ack,pending,checkedPreparationRequestResult,checkedPreparationRequestReceipt,async()=>{live=false;return receipt;},clear,()=>live));assert.equal(clears,0);
  let held=false;await assert.rejects(completeArtifactMutation(ack,pending,checkedPreparationRequestResult,checkedPreparationRequestReceipt,async()=>{held=true;return receipt;},clear,()=>true,()=>!held));assert.equal(clears,0);
  await completeArtifactMutation({...ack,duplicate:true},pending,checkedPreparationRequestResult,checkedPreparationRequestReceipt,async()=>receipt,clear,()=>true);
  assert.equal(clears,1);assert.equal(readPendingPreparation(storage,'original','draft'),null);
  assert.equal(checkedPreparationRequestReceipt({found:false},pending),null);
});
test('preparation recovery rejects corrupt storage, invented receipts and malformed or stale queue metadata',()=>{
  const storage=store();
  for(const raw of ['', '{}','x'.repeat(801),JSON.stringify({...pending,orgId:'foreign'}),JSON.stringify({...pending,briefingId:'other'})]) {
    storage.setItem('understood:preparation:scope:draft',raw);assert.throws(()=>readPendingPreparation(storage,'scope','draft'));
  }
  assert.throws(()=>savePendingPreparation({getItem:()=>null,setItem(){},removeItem(){}},'scope',pending),/No request was sent/);
  const context={briefingId:'draft',revision:1,state:'failed',job:{id:'job',status:'failed',generation:2}};
  assert.deepEqual(checkedPreparationContext(context,'draft',1),context);
  for(const value of [{...context,revision:2},{...context,briefingId:'other'},{...context,state:'published'},{...context,job:{...context.job,generation:-1}},{...context,job:{...context.job,lease:'secret'}},{...context,unexpected:true}])assert.throws(()=>checkedPreparationContext(value,'draft',1));
  for(const value of [{...ack,id:'other'},{...ack,state:'ready'},{...ack,acceptedAt:'2026-02-30T09:00:00.000Z'},{...ack,duplicate:'true'},{...ack,private:'data'}])assert.throws(()=>checkedPreparationRequestResult(value,pending));
  for(const value of [{found:false,result:ack},{...receipt,request:{...receipt.request,requestedBy:'other'}},{...receipt,request:{...receipt.request,jobId:'other'}},{...receipt,result:{...ack,state:'failed'}}])assert.throws(()=>checkedPreparationRequestReceipt(value,pending));
});
