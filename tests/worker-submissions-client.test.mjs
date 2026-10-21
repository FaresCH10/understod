import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedWorkerSubmissions,readWorkerSubmissions,workerSubmissionState} from '../src/worker-submissions.ts';

const context='a'.repeat(64),scope={assignmentId:'assignment-30',version:3,language:'en'};
const session=()=>({authenticated:true,role:'worker',workerId:'worker-30',mode:'synthetic-credential',language:'en',clientContext:context,expiresAt:'2099-01-01T00:00:00.000Z'});
const receipt=()=>({id:'historical-submission-1',kind:'typed',receivedAt:'2026-10-02T09:18:00.000Z',isLatest:true,answerText:'Synthetic own answer',outcome:null,recordingId:null,audioStatus:null});
const page=()=>({assignment:{id:scope.assignmentId,version:3,language:'en',state:'published'},receipts:[receipt()],total:1,page:1,pageSize:5,clientContext:context});
const read=(send,identity=session(),selection=scope,n=1,current=()=>true)=>readWorkerSubmissions(send,identity,selection,n,new AbortController().signal,current);

test('worker history validates exact version/language, historical identifiers and bounded page shape',()=>{
  assert.deepEqual(checkedWorkerSubmissions(page(),scope,1,context),page());
  for(const mutate of [value=>value.assignment.id='another',value=>value.assignment.version=4,value=>value.assignment.language='ar',value=>value.assignment.rubric='private',value=>value.notes='private',value=>value.page=2,value=>value.pageSize=50,value=>value.total=-1,value=>value.total=2,value=>value.receipts[0].isLatest=false,value=>value.receipts[0].kind='unknown',value=>value.receipts[0].outcome='correct',value=>value.receipts[0].receivedAt='not a date',value=>value.receipts[0].answerText='a'.repeat(20001),value=>value.receipts[0].evidence=['private'],value=>value.receipts[0].recordingId='wrong-typed-audio',value=>value.receipts[0].id='bad\nid']){
    const value=page();mutate(value);assert.throws(()=>checkedWorkerSubmissions(value,scope,1,context));
  }
  const duplicate=page();duplicate.receipts.push({...receipt(),isLatest:false});duplicate.total=2;assert.throws(()=>checkedWorkerSubmissions(duplicate,scope,1,context));
  const past=page();past.page=5000;past.receipts=[];assert.equal(checkedWorkerSubmissions(past,scope,5000,context).total,1);
  const changed=page();changed.clientContext='b'.repeat(64);assert.throws(()=>checkedWorkerSubmissions(changed,scope,1,context),error=>error.code==='session');
});
test('received evidence never turns blocked, failed or unavailable audio into a pending or matched result',()=>{
  const row=receipt();assert.equal(workerSubmissionState(row),'pending');
  for(const outcome of ['matched','clarification','unassessable'])assert.equal(workerSubmissionState({...row,outcome}),outcome);
  const audio={...row,kind:'audio',recordingId:'recording',audioStatus:'received'};
  assert.equal(workerSubmissionState(audio),'pending');assert.equal(workerSubmissionState({...audio,audioStatus:'blocked'}),'paused');
  assert.equal(workerSubmissionState({...audio,audioStatus:'failed'}),'audioFailed');assert.equal(workerSubmissionState({...audio,recordingId:null}),'unavailable');
  assert.equal(workerSubmissionState({...audio,outcome:'matched',audioStatus:'failed'}),'matched');
});
test('history GET captures session context and sends no business mutation',async()=>{
  let calls=0;
  const value=await read(async(url,options)=>{calls++;assert.match(url,/assignment-30\/submissions\?page=1&pageSize=5$/);assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.equal(options.headers['x-client-session-context'],context);assert.equal(options.method,undefined);assert.equal(options.body,undefined);return Response.json(page());});
  assert.equal(calls,1);assert.equal(value.receipts[0].id,'historical-submission-1');
  for(const selection of [{...scope,version:0},{...scope,assignmentId:''},{...scope,language:'xyz'}])await assert.rejects(read(()=>{throw Error('Must not fetch');},session(),selection),error=>error.code==='invalid');
  await assert.rejects(read(()=>{throw Error('Must not fetch');},session(),scope,5001),error=>error.code==='invalid');
});
test('history drops identity, expiry and selection changes during transport or JSON parsing',async()=>{
  for(const change of [s=>s.clientContext='b'.repeat(64),s=>s.workerId='another',s=>s.expiresAt='2098-01-01T00:00:00.000Z']){
    const identity=session();await assert.rejects(read(async()=>{change(identity);return Response.json(page());},identity),error=>error.code==='session');
  }
  let current=true;await assert.rejects(read(async()=>({ok:true,status:200,async json(){current=false;return page();}}),session(),scope,1,()=>current),error=>error.code==='session');
  await assert.rejects(read(()=>{throw Error('Must not fetch');},session(),scope,1,()=>false),error=>error.code==='session');
});
test('history read failures are failures rather than empty histories or manufactured outcomes',async()=>{
  for(const status of [401,403,409])await assert.rejects(read(async()=>new Response('',{status})),error=>error.code==='session');
  for(const status of [404,429,500,503])await assert.rejects(read(async()=>new Response('',{status})),error=>error.code==='unavailable');
  await assert.rejects(read(async()=>Response.json({...page(),rubric:'private'})),error=>error.code==='invalid');
  await assert.rejects(read(async()=>new Response('not json')));
});
