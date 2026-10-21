import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {exportInput,exportRetryInput} from '../server/report-input.mjs';
import {pendingExportInput,savePendingExport,readPendingExport,clearPendingExport,checkedExportReceipt,checkedExportResult,checkedExportRow} from '../src/export-recovery.ts';
import {checkedArtifactScope,completeArtifactMutation} from '../src/artifact-request.ts';
const store=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};};
const filters={crewId:'crew-1',responseFrom:'2026-10-01',responseThrough:'2026-10-31'};
const created={kind:'create',requestId:randomUUID(),exportId:null,body:{publicationId:'publication-v3',filters}};
const retry={kind:'retry',requestId:randomUUID(),exportId:randomUUID(),body:{attempts:1}};
const row={id:created.requestId,status:'queued',createdAt:'2026-10-13T10:00:00.000Z',expiresAt:'2026-10-14T10:00:00.000Z',attempts:0,error:null,filename:`briefing-activity-${created.requestId}.csv`,filters:{...filters,timezone:'Asia/Beirut'}};
const result={requestId:retry.requestId,id:retry.exportId,attempts:1,acceptedAt:row.createdAt};

for(const [pending,ack] of [[created,row],[retry,result]])test(`export ${pending.kind} retains exact tab scope and original receipt while authority/storage/queue state can change`,async()=>{
  const storage=store(),receipt={found:true,request:pendingExportInput(pending),result:ack};
  savePendingExport(storage,'original',pending);assert.deepEqual(readPendingExport(storage,'original'),pending);assert.equal(readPendingExport(storage,'other'),null);
  const changed={...pending,body:pending.kind==='create'?{...pending.body,filters:{...filters,crewId:''}}:{attempts:2}};
  assert.throws(()=>savePendingExport(storage,'original',changed),/Recover/);assert.throws(()=>clearPendingExport(storage,'original',pending.requestId,changed),/changed/);
  let clears=0;const clear=()=>{clearPendingExport(storage,'original',pending.requestId,pending);clears++;};
  const advanced=pending.kind==='create'?{...receipt,result:{...row,status:'ready',attempts:2}}:receipt;
  await completeArtifactMutation({...ack,duplicate:false},pending,checkedExportResult,checkedExportReceipt,async()=>advanced,clear,()=>true);
  assert.equal(clears,1);assert.equal(readPendingExport(storage,'original'),null);
  savePendingExport(storage,'original',pending);
  for(const response of [{found:false},{found:false,result:ack},{...receipt,request:{...receipt.request,extra:true}},{...receipt,result:{...ack,id:randomUUID()}}]) {
    await assert.rejects(completeArtifactMutation(ack,pending,checkedExportResult,checkedExportReceipt,async()=>response,clear,()=>true));assert.equal(clears,1);assert.deepEqual(readPendingExport(storage,'original'),pending);
  }
  let live=true;await assert.rejects(completeArtifactMutation(ack,pending,checkedExportResult,checkedExportReceipt,async()=>{live=false;return receipt;},clear,()=>live));assert.equal(clears,1);
  let held=false;await assert.rejects(completeArtifactMutation(ack,pending,checkedExportResult,checkedExportReceipt,async()=>{held=true;return receipt;},clear,()=>true,()=>!held));assert.equal(clears,1);
  await assert.rejects(completeArtifactMutation(ack,pending,checkedExportResult,checkedExportReceipt,async()=>{storage.setItem('understood:exports:original',JSON.stringify(changed));return receipt;},clear,()=>true));assert.equal(clears,1);assert.deepEqual(readPendingExport(storage,'original'),changed);
  assert.equal(checkedExportReceipt({found:false},pending),null);
});

test('export storage failure, corrupt payload, forged acknowledgements and filters fail closed before clearing',()=>{
  const storage=store();
  for(const value of ['', '{}',JSON.stringify({...created,unexpected:true}),JSON.stringify({...created,body:{...created.body,requestId:created.requestId}}),'x'.repeat(1501)]) {
    storage.setItem('understood:exports:scope',value);assert.throws(()=>readPendingExport(storage,'scope'));
  }
  assert.throws(()=>savePendingExport({getItem:()=>null,setItem(){},removeItem(){}},'scope',created),/No request was sent/);
  for(const value of [{...row,status:'published'},{...row,attempts:4},{...row,filename:'../../private.csv'},{...row,snapshot_json:[]},{...row,createdAt:'2026-02-30T10:00:00.000Z'},{...row,filters:{...row.filters,timezone:'unsupported-zone'}},{...row,filters:{...row.filters,crewId:'other'}},{...row,duplicate:'false'}])assert.throws(()=>checkedExportResult(value,created));
  for(const value of [{...result,attempts:2},{...result,requestId:randomUUID()},{...result,extra:true},{...result,acceptedAt:'bad'}])assert.throws(()=>checkedExportResult(value,retry));
  for(const value of [{...created.body,requestId:'bad'},{...created.body,requestId:created.requestId,filters:{...filters,responseFrom:'2026-02-29'}},{...created.body,requestId:created.requestId,org_id:'foreign'}])assert.throws(()=>exportInput(value));
  for(const value of [{requestId:retry.requestId,attempts:3},{requestId:retry.requestId,attempts:1,orgId:'foreign'},{attempts:1}])assert.throws(()=>exportRetryInput(retry.exportId,value));
  assert.deepEqual(checkedExportRow(row).filters,row.filters);
});

test('export recovery permits authorized auditors explicitly but never extends default artifact writer roles',()=>{
  const scope=JSON.stringify(['cedar','beirut','auditor']),session={authenticated:true,role:'staff',staffRole:'auditor',staffScope:scope,siteState:'active',mode:'credential',clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+60_000).toISOString()};
  assert.throws(()=>checkedArtifactScope(scope,session));assert.equal(checkedArtifactScope(scope,session,['owner','supervisor','auditor']),scope);
  assert.throws(()=>checkedArtifactScope(JSON.stringify(['cedar','other','auditor']),session,['owner','supervisor','auditor']));
});
