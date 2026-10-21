import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pendingProcessingRetryInput,savePendingProcessingRetry,readPendingProcessingRetry,clearPendingProcessingRetry,checkedProcessingRetryContext,checkedProcessingRetryResult,checkedProcessingRetryReceipt} from '../src/processing-retry-recovery.ts';
import {completeArtifactMutation} from '../src/artifact-request.ts';
const store=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const pending={requestId:randomUUID(),body:{jobId:'answer_check:job',publicationId:'publication-v3',assignmentId:'assignment',generation:2,confirmed:true}};
const ack={jobId:pending.body.jobId,state:'queued',acceptedAt:'2026-10-14T11:00:00.000Z'},receipt={found:true,request:pendingProcessingRetryInput(pending),result:ack};
test('processing retry freezes exact job, publication, assignment and generation through ambiguous acceptance',async()=>{
  const storage=store(),changed={...pending,body:{...pending.body,generation:3}};savePendingProcessingRetry(storage,'actor-scope',pending);
  assert.deepEqual(readPendingProcessingRetry(storage,'actor-scope',pending.body.jobId),pending);assert.equal(readPendingProcessingRetry(storage,'other',pending.body.jobId),null);assert.equal(readPendingProcessingRetry(storage,'actor-scope','answer_check:other'),null);
  assert.throws(()=>savePendingProcessingRetry(storage,'actor-scope',changed),/Recover/);assert.throws(()=>clearPendingProcessingRetry(storage,'actor-scope',pending.requestId,changed),/changed/);
  let clears=0;const clear=()=>{clearPendingProcessingRetry(storage,'actor-scope',pending.requestId,pending);clears++;};
  for(const value of [{found:false},{...receipt,request:{...receipt.request,generation:3}},{...receipt,request:{...receipt.request,publicationId:'publication-v4'}},{...receipt,request:{...receipt.request,assignmentId:'other'}},{...receipt,result:{...ack,jobId:'answer_check:other'}},{...receipt,result:{...ack,acceptedAt:'2026-10-14T11:01:00.000Z'}}]){
    await assert.rejects(completeArtifactMutation(ack,pending,checkedProcessingRetryResult,checkedProcessingRetryReceipt,async()=>value,clear,()=>true));assert.equal(clears,0);assert.deepEqual(readPendingProcessingRetry(storage,'actor-scope',pending.body.jobId),pending);
  }
  let live=true;await assert.rejects(completeArtifactMutation(ack,pending,checkedProcessingRetryResult,checkedProcessingRetryReceipt,async()=>{live=false;return receipt;},clear,()=>live));
  let held=false;await assert.rejects(completeArtifactMutation(ack,pending,checkedProcessingRetryResult,checkedProcessingRetryReceipt,async()=>{held=true;return receipt;},clear,()=>true,()=>!held));assert.equal(clears,0);
  await completeArtifactMutation(ack,pending,checkedProcessingRetryResult,checkedProcessingRetryReceipt,async()=>receipt,clear,()=>true);assert.equal(clears,1);assert.equal(readPendingProcessingRetry(storage,'actor-scope',pending.body.jobId),null);
});
test('processing retry refuses corrupted storage, invented success and stale or private context fields',()=>{
  const storage=store();for(const raw of ['', '{}','x'.repeat(1001),JSON.stringify({...pending,scope:'foreign'}),JSON.stringify({...pending,body:{...pending.body,jobId:'answer_check:other'}})]){storage.setItem('understood:processing-retry:scope:answer_check:job',raw);assert.throws(()=>readPendingProcessingRetry(storage,'scope',pending.body.jobId));}
  assert.throws(()=>savePendingProcessingRetry({getItem:()=>null,setItem(){},removeItem(){}},'scope',pending),/No request was sent/);
  const context={jobId:pending.body.jobId,publicationId:pending.body.publicationId,assignmentId:pending.body.assignmentId,generation:2,status:'failed',available:true};assert.deepEqual(checkedProcessingRetryContext(context,context.jobId,context.publicationId,context.assignmentId),context);
  for(const update of [{publicationId:'other'},{assignmentId:'other'},{jobId:'answer_check:other'},{generation:-1},{available:'true'},{status:'complete'},{private:'data'}])assert.throws(()=>checkedProcessingRetryContext({...context,...update},context.jobId,context.publicationId,context.assignmentId));
  for(const update of [{state:'complete'},{jobId:'answer_check:other'},{acceptedAt:'2026-02-30T11:00:00.000Z'},{private:'data'}])assert.throws(()=>checkedProcessingRetryResult({...ack,...update},pending));
  assert.equal(checkedProcessingRetryReceipt({found:false},pending),null);assert.throws(()=>checkedProcessingRetryReceipt({found:false,result:ack},pending));
});
