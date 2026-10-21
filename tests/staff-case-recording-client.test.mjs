import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {StaffRecordingError,readStaffRecordingPending,retainStaffRecording,clearStaffRecordingPending,checkedStaffRecordingReceipt,checkedStaffRecordingPage,checkedStaffRecordingNotice,requestStaffRecording} from '../src/staff-case-recordings.ts';
import {staffCaseRecordingNotice} from '../src/recording-notice.ts';

const bytes=new Uint8Array(8044).fill(7),hash=createHash('sha256').update(bytes).digest('hex'),context='a'.repeat(64),id=randomUUID();
const session=()=>({authenticated:true,role:'staff',staffRole:'owner',staffScope:'["org","site","owner"]',siteState:'active',clientContext:context,expiresAt:new Date(Date.now()+60000).toISOString(),mode:'synthetic-credential'});
const scope=()=>({caseId:'case-14',assignmentId:'assignment-14'}),pending=()=>({id,hash,bytes:bytes.length,language:'ur'});
const receipt=(status='received')=>({requestId:id,...scope(),kind:'in_person',actorId:'owner',actorRole:'owner',language:'ur',sha256:hash,bytes:bytes.length,status,createdAt:'2026-10-20T09:00:00.000Z',receivedAt:status==='received'?'2026-10-20T09:00:01.000Z':null,clientContext:context});
const error=code=>reason=>reason instanceof StaffRecordingError&&reason.code===code;
const store=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('staff recording recovery stores metadata only and binds author role, context, case, assignment, declared language and bytes',async()=>{
  const storage=store(),s=session(),target=scope(),value=await retainStaffRecording(storage,s,target,id,bytes,'ur',()=>true);
  assert.deepEqual(value,pending());assert.deepEqual(readStaffRecordingPending(storage,s,target),value);assert.deepEqual(await retainStaffRecording(storage,s,target,id,bytes,'ur',()=>true),value);
  assert.equal([...storage.values.values()][0],JSON.stringify(pending()));assert.ok(![...storage.values.values()][0].includes('answer'));
  for(const [identity,selection] of [[{...s,clientContext:'b'.repeat(64)},target],[{...s,staffRole:'supervisor'},target],[{...s,staffScope:'["org","site","other"]',clientContext:'c'.repeat(64)},target],[s,{...target,caseId:'other'}],[s,{...target,assignmentId:'other'}]])assert.equal(readStaffRecordingPending(storage,identity,selection),null);
  for(const [newId,data,language] of [[randomUUID(),bytes,'ur'],[id,new Uint8Array(8044),'ur'],[id,bytes,'ar']])await assert.rejects(retainStaffRecording(storage,s,target,newId,data,language,()=>true),error('recovery'));
  assert.throws(()=>clearStaffRecordingPending(storage,s,target,{...value,id:randomUUID()},()=>true),error('recovery'));assert.deepEqual(readStaffRecordingPending(storage,s,target),value);
  assert.throws(()=>clearStaffRecordingPending(storage,s,target,value,()=>false),error('session'));assert.equal(storage.values.size,1);
  clearStaffRecordingPending(storage,s,target,value,()=>true);assert.equal(readStaffRecordingPending(storage,s,target),null);
});

test('recovery fails closed for malformed, denied, discarded and changed storage and for authority changes while hashing',async()=>{
  const s=session(),target=scope(),storage=store();await retainStaffRecording(storage,s,target,id,bytes,'ur',()=>true);const name=[...storage.values.keys()][0];
  for(const raw of ['not json','{}',JSON.stringify({...pending(),audio:'PRIVATE'}),'x'.repeat(301)]){storage.values.set(name,raw);assert.throws(()=>readStaffRecordingPending(storage,s,target),error('recovery'));}
  await assert.rejects(retainStaffRecording({...store(),setItem(){}},s,target,id,bytes,'ur',()=>true),error('recovery'));
  for(const mutate of [s=>s.clientContext='b'.repeat(64),s=>s.staffRole='supervisor',s=>s.expiresAt='2000-01-01T00:00:00.000Z']){
    const identity=session(),safe=store(),promise=retainStaffRecording(safe,identity,target,id,bytes,'ur',()=>true);mutate(identity);await assert.rejects(promise,error('session'));assert.equal(safe.values.size,0);
  }
  let current=true;const safe=store(),promise=retainStaffRecording(safe,session(),target,id,bytes,'ur',()=>current);current=false;await assert.rejects(promise,error('session'));assert.equal(safe.values.size,0);
  storage.values.set(name,JSON.stringify(pending()));assert.throws(()=>clearStaffRecordingPending({...storage,removeItem(){}},s,target,pending(),()=>true),error('recovery'));
});

test('staff audio receipts validate exact original author, role, purpose, scope, bytes and coherent stages',()=>{
  for(const status of ['received','storing','failed'])assert.deepEqual(checkedStaffRecordingReceipt(receipt(status),session(),scope(),pending()),receipt(status));
  for(const change of [{actorId:'other'},{actorRole:'supervisor'},{kind:'reply'},{caseId:'other'},{assignmentId:'other'},{requestId:randomUUID()},{sha256:'b'.repeat(64)},{bytes:8045},{language:'ar'},{status:'matched'},{receivedAt:null},{createdAt:'yesterday'},{receivedAt:'2026-10-19T09:00:00.000Z'},{audioUrl:'/private'}])assert.throws(()=>checkedStaffRecordingReceipt({...receipt(),...change},session(),scope(),pending()),error('invalid'));
  assert.throws(()=>checkedStaffRecordingReceipt({...receipt(),clientContext:'c'.repeat(64)},session(),scope(),pending()),error('session'));
  for(const staffRole of ['auditor','administrator'])assert.throws(()=>checkedStaffRecordingReceipt(receipt(),{...session(),staffRole},scope(),pending()),error('session'));
});

test('staff recording pages enforce metadata-only bounded consistent order, stages, capabilities and session context',()=>{
  const item={requestId:id,actorId:'owner',actorRole:'owner',actorName:'Synthetic owner',language:'ur',status:'received',createdAt:receipt().createdAt,receivedAt:receipt().receivedAt,durationSeconds:.25,available:true};
  const page={caseId:scope().caseId,page:1,pageSize:10,total:1,canRecord:true,items:[item],clientContext:context};
  assert.deepEqual(checkedStaffRecordingPage(page,scope().caseId,1,context),page);
  for(const change of [{items:[]},{total:50001},{page:2},{pageSize:20},{caseId:'other'},{canRecord:'true'},{items:[{...item,sha256:hash}]},{items:[{...item,status:'storing'}]},{items:[{...item,durationSeconds:0}]},{items:[{...item,receivedAt:null}]}])assert.throws(()=>checkedStaffRecordingPage({...page,...change},scope().caseId,1,context),error('invalid'));
  assert.throws(()=>checkedStaffRecordingPage({...page,clientContext:'b'.repeat(64)},scope().caseId,1,context),error('session'));
});

test('staff recording transport uses GET-only receipt recovery and explicit original-byte POST without provider or scope overrides',async()=>{
  const calls=[],fetcher=async(path,options)=>{calls.push({path,options});return Response.json(receipt());};
  await requestStaffRecording(fetcher,session(),scope(),pending(),{kind:'receipt'},new AbortController().signal,()=>true);
  assert.equal(calls[0].path,`/api/clarifications/case-14/in-person-recordings/${id}`);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
  const mutable=new Uint8Array(bytes),promise=requestStaffRecording(fetcher,session(),scope(),pending(),{kind:'send',bytes:mutable},new AbortController().signal,()=>true);mutable.fill(99);await promise;
  assert.equal(calls.length,2);assert.deepEqual(calls[1].options.body,bytes);assert.equal(calls[1].options.headers['x-recording-language'],'ur');assert.equal(calls[1].options.headers['content-type'],'audio/wav');assert.equal(calls[1].options.headers['x-client-session-context'],context);assert.equal(calls[1].options.credentials,'include');assert.equal(calls[1].options.cache,'no-store');assert.equal(calls[1].options.redirect,'error');
});

test('invalid audio commands and changes during hash, transport or body parsing cannot send or accept',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json(receipt());};
  for(const operation of [{kind:'delete'},{kind:'receipt',bytes},{kind:'send',bytes:new Uint8Array(8043)},{kind:'send',bytes:new Uint8Array(8044)}])await assert.rejects(requestStaffRecording(fetcher,session(),scope(),pending(),operation,new AbortController().signal,()=>true),error('invalid'));
  await assert.rejects(requestStaffRecording(fetcher,session(),scope(),pending(),{kind:'send',bytes},new AbortController().signal,()=>true,()=>false),error('blocked'));assert.equal(calls,0);
  for(const phase of ['transport','body']){let current=true;const send=async()=>{if(phase==='transport')current=false;return {ok:true,status:200,json:async()=>{if(phase==='body')current=false;return receipt();}};};await assert.rejects(requestStaffRecording(send,session(),scope(),pending(),{kind:'receipt'},new AbortController().signal,()=>current),error('session'));}
  for(const response of [Response.json({error:'Session context changed'},{status:409}),Response.json({},{status:403})])await assert.rejects(requestStaffRecording(async()=>response,session(),scope(),pending(),{kind:'receipt'},new AbortController().signal,()=>true),error('session'));
});

test('staff-purpose recording notices use validated role-bound site text and never call the recording a worker answer',()=>{
  const value={revision:0,configured:false,notices:{en:'',ar:'',ur:''},canWrite:true,recoveryScope:session().staffScope};
  for(const lang of ['en','ar','ur']){assert.equal(checkedStaffRecordingNotice(value,session(),lang),null);for(const text of Object.values(staffCaseRecordingNotice(lang)))assert.ok(text.trim());}
  assert.match(staffCaseRecordingNotice('en').processing,/not a worker answer/);assert.match(staffCaseRecordingNotice('en').processing,/not sent to AI/);assert.match(staffCaseRecordingNotice('en').processing,/does not resolve/);
  const supervisor={...session(),staffRole:'supervisor'};assert.equal(checkedStaffRecordingNotice({...value,canWrite:false,recoveryScope:null},supervisor,'ar'),null);
  for(const changed of [{...value,canWrite:false},{...value,recoveryScope:'foreign'},{...value,configured:true},{...value,notices:{...value.notices,ur:'partial'}}])assert.throws(()=>checkedStaffRecordingNotice(changed,session(),'ur'),error('invalid'));
});
