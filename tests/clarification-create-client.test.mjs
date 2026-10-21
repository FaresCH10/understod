import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {canonicalCreation,creationHash,readCreation,retainCreation,clearCreation,checkedCreationReceipt,checkedCreationSubject,checkedCreationSubjects} from '../src/clarification-create.ts';

const context='a'.repeat(64),createdAt='2026-10-20T07:00:00.000Z';
const session=()=>({authenticated:true,role:'staff',staffRole:'owner',staffScope:'["qa","beirut","owner"]',siteState:'active',mode:'credential',clientContext:context,expiresAt:new Date(Date.now()+60000).toISOString()});
const store=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const content=()=>({assignmentId:'assignment-14',publicationId:'publication-3',version:3,attemptId:null,reason:'Synthetic private staff follow-up'});
const subject=()=>({assignmentId:'assignment-14',publicationId:'publication-3',version:3,worker:'Worker 014',title:'Synthetic handover',language:'en',createdAt});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipt=(pending,value=content())=>({requestId:pending.id,caseId:pending.id,assignmentId:value.assignmentId,publicationId:value.publicationId,version:value.version,attemptId:value.attemptId,actorId:'owner',actorRole:'owner',requestHash:pending.hash,selectionHash:pending.selectionHash,createdAt,clientContext:context});

test('creation recovery retains only metadata, binds the exact selection and private reason, and clears only matching receipts',async()=>{
  const storage=store(),scope=session(),value=content(),pending=await retainCreation(storage,scope,value,()=>true);
  assert.equal(pending.hash,digest(value));assert.equal(pending.hash,await creationHash({...value,reason:` ${value.reason} `}));
  assert.deepEqual(Object.keys(pending).sort(),['hash','id','selectionHash']);
  for(const privateValue of [value.reason,value.assignmentId,value.publicationId])assert.equal(JSON.stringify([...storage.values]).includes(privateValue),false);
  assert.deepEqual(await retainCreation(storage,scope,value,()=>true),pending);
  for(const changed of [{reason:'Another private reason'},{attemptId:'attempt-14'},{publicationId:'other'},{version:4},{assignmentId:'other'}])await assert.rejects(retainCreation(storage,scope,{...value,...changed},()=>true),error=>error.code==='conflict');
  assert.equal(readCreation(storage,{...scope,clientContext:'b'.repeat(64)}),null);
  await checkedCreationReceipt(receipt(pending),pending,scope);
  assert.throws(()=>clearCreation(storage,scope,{...pending,id:randomUUID()}),error=>error.code==='conflict');
  clearCreation(storage,scope,pending);assert.equal(storage.values.size,0);
});

test('creation hashing rejects changed authority, full session bindings and competing recovery metadata',async()=>{
  for(const change of ['authority','scope','context','expiry','role']){
    const storage=store(),scope=session();let live=true;const result=retainCreation(storage,scope,content(),()=>live);
    if(change==='authority')live=false;if(change==='scope')scope.staffScope='["qa","tripoli","owner"]';if(change==='context')scope.clientContext='b'.repeat(64);if(change==='expiry')scope.expiresAt=createdAt;if(change==='role')scope.staffRole='supervisor';
    await assert.rejects(result,error=>error.code==='session');assert.equal(storage.values.size,0);
  }
  const storage=store(),scope=session(),result=retainCreation(storage,scope,content(),()=>true);
  storage.setItem(`understood:clarification-create:${context}`,JSON.stringify({id:randomUUID(),hash:'c'.repeat(64),selectionHash:'d'.repeat(64)}));
  await assert.rejects(result,error=>error.code==='conflict');
  await assert.rejects(retainCreation({...store(),setItem(){}},session(),content(),()=>true),error=>error.code==='storage');
});

test('creation receipts reject substituted metadata, actors, contexts and diagnostic fields',async()=>{
  const scope=session(),pending=await retainCreation(store(),scope,content(),()=>true),row=receipt(pending);
  for(const changed of [{caseId:'other'},{assignmentId:'other'},{publicationId:'other'},{version:4},{attemptId:'other'},{actorId:'supervisor'},{actorRole:'supervisor'},{requestHash:'c'.repeat(64)},{selectionHash:'c'.repeat(64)},{clientContext:'b'.repeat(64)},{privateReason:'forbidden'},{createdAt:'yesterday'}])await assert.rejects(checkedCreationReceipt({...row,...changed},pending,scope));
  const substituted={...row,assignmentId:'other'},forged={...pending,selectionHash:digest({assignmentId:'other',publicationId:row.publicationId,version:row.version,attemptId:row.attemptId})};
  await assert.rejects(checkedCreationReceipt(substituted,forged,scope));
});

test('creation subject pages and latest response envelopes reject mixed identity, incoherent counts and unexpected fields',()=>{
  const row=subject(),page={items:[row],total:1,page:1,pageSize:10,search:'',clientContext:context};
  checkedCreationSubjects(page,1,'',context);
  for(const changed of [{items:[row,row],total:2},{total:2},{page:2},{pageSize:20},{search:'other'},{clientContext:'b'.repeat(64)},{rawDiagnostic:'forbidden'}])assert.throws(()=>checkedCreationSubjects({...page,...changed},1,'',context));
  const latestAttempt={id:'attempt-14',text:'Synthetic answer',outcome:'matched',complete:true,receivedAt:createdAt,existingCaseId:null},detail={...row,latestAttempt,clientContext:context};
  checkedCreationSubject(detail,row.assignmentId,context);
  for(const changed of [{complete:false},{outcome:null},{existingCaseId:'../other'},{text:''},{unexpected:true}])assert.throws(()=>checkedCreationSubject({...detail,latestAttempt:{...latestAttempt,...changed}},row.assignmentId,context));
  assert.throws(()=>checkedCreationSubject(detail,'other',context));
  for(const changed of [{reason:'bad'},{reason:'x'.repeat(501)},{reason:'bad\u0000reason'},{attemptId:undefined},{version:0},{extra:true}])assert.throws(()=>canonicalCreation({...content(),...changed}));
});
