import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {preparePendingImport,readPendingImport,savePendingImport,clearPendingImport,checkedImportPreview,checkedImportAcknowledgement,importRecoveryDecision} from '../src/worker-import-recovery.ts';
import {completeStaffRequest} from '../src/staff-request.ts';
const scope=JSON.stringify(['org','site','actor']);
const fixture=()=>{const records=new Map();return {records,storage:{getItem:key=>records.get(key) ?? null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)}};};
const file=()=>new File(['worker_id,language\nSynthetic 031,ar\n'],'crew.csv');
const preview=pending=>({id:pending.requestId,filename:'crew.csv',sha256:pending.sha256,filenameHash:pending.filenameHash,status:'validated',createdAt:'2026-10-13T10:00:00.000Z',expiresAt:'2026-10-14T10:00:00.000Z',totalRows:1,validRows:1,invalidRows:0,rows:[{row:2,workerId:'Synthetic 031',language:'ar',crew:'',errors:[],valid:true}],errors:[],imported:0});

test('CSV recovery retains only scoped immutable intent fingerprints, never bytes, labels or filenames',async()=>{
  const {storage,records}=fixture(),input=file(),pending=await preparePendingImport(input,randomUUID());
  assert.equal(pending.sha256,createHash('sha256').update(await input.text()).digest('hex'));
  assert.equal(pending.filenameHash,createHash('sha256').update(input.name).digest('hex'));
  savePendingImport(storage,scope,pending);assert.deepEqual(readPendingImport(storage,scope),pending);
  assert.equal(readPendingImport(storage,JSON.stringify(['org','other','actor'])),null);
  assert.doesNotMatch(JSON.stringify([...records]),/Synthetic 031|crew\.csv|worker_id|language/);
  assert.throws(()=>savePendingImport(storage,scope,{...pending,sha256:'b'.repeat(64)}),/pending/i);
  assert.throws(()=>savePendingImport(storage,scope,{...pending,phase:'confirm',bytes:null}),/pending/i);
  assert.throws(()=>clearPendingImport(storage,scope,{...pending,requestId:randomUUID()}),/changed/i);
  clearPendingImport(storage,scope,pending);assert.equal(readPendingImport(storage,scope),null);
  await assert.rejects(preparePendingImport(new File([],'crew.csv'),randomUUID()));
  await assert.rejects(preparePendingImport(new File(['x'],'../crew.csv'),randomUUID()));
  await assert.rejects(preparePendingImport(new File([new Uint8Array(256*1024+1)],'crew.csv'),randomUUID()));
});

test('CSV preview and confirmation evidence require exact IDs, intent fingerprints and bounded consistent counts',async()=>{
  const pending=await preparePendingImport(file(),randomUUID()),value=preview(pending);
  assert.deepEqual(checkedImportPreview(value,pending.requestId,pending),value);
  for(const patch of [{id:randomUUID()},{sha256:'0'.repeat(64)},{filenameHash:'0'.repeat(64)},{validRows:2},{status:'queued'},{token:'private'},{rows:[{...value.rows[0],valid:false}]},{totalRows:1001}])assert.throws(()=>checkedImportPreview({...value,...patch},pending.requestId,pending),/verified|match/i);
  const result={id:pending.requestId,status:'imported',imported:1,duplicate:false};
  assert.deepEqual(checkedImportAcknowledgement(result,value),result);
  for(const patch of [{id:randomUUID()},{imported:0},{status:'validated'},{duplicate:null}])assert.throws(()=>checkedImportAcknowledgement({...result,...patch},value),/verified|match/i);
});

test('unknown confirmation recovers only through matching imported/expired state, never by treating validated as completed',async()=>{
  const upload=await preparePendingImport(file(),randomUUID()),pending={...upload,phase:'confirm',bytes:null},value=preview(pending);
  assert.equal(importRecoveryDecision(checkedImportPreview(value,pending.requestId,pending),pending),'waiting');
  assert.equal(importRecoveryDecision(checkedImportPreview({...value,status:'imported',imported:1},pending.requestId,pending),pending),'imported');
  assert.equal(importRecoveryDecision(checkedImportPreview({...value,status:'expired',totalRows:0,validRows:0,invalidRows:0,rows:[],imported:1},pending.requestId,pending),pending),'expired');
  assert.equal(importRecoveryDecision(value,upload),'ready');
});

test('changed or held authority cannot clear CSV recovery after asynchronous receipt validation',async()=>{
  const {storage}=fixture(),pending=await preparePendingImport(file(),randomUUID()),value=preview(pending);savePendingImport(storage,scope,pending);
  for(const held of [false,true]){
    let current=true,allowed=true,release;const wait=new Promise(resolve=>{release=resolve;});
    const completion=completeStaffRequest(value,async value=>{await wait;return checkedImportPreview(value,pending.requestId,pending);},()=>clearPendingImport(storage,scope,pending),()=>current,()=>allowed);
    if(held)allowed=false;else current=false;release();await assert.rejects(completion,/context changed|verification is pending/i);
    assert.deepEqual(readPendingImport(storage,scope),pending);
  }
  assert.throws(()=>savePendingImport({...storage,setItem(){}},JSON.stringify(['org','site','other']),pending),/No request was sent/);
  assert.throws(()=>clearPendingImport({...storage,removeItem(){}},scope,pending),/cleared/);
});
