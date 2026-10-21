import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedWorkerHelpHistory,readWorkerHelpHistory} from '../src/worker-help-history.ts';
import {workerHelpHistoryInput} from '../server/clarification-input.mjs';

const context='a'.repeat(64),scope={assignmentId:'assignment-30',version:3,language:'en'};
const session=()=>({authenticated:true,role:'worker',workerId:'worker-30',mode:'synthetic-credential',language:'en',clientContext:context,expiresAt:'2099-01-01T00:00:00.000Z'});
const row=()=>({id:'historical-case',status:'open',createdAt:'2026-10-02T09:18:00.000Z',helpText:'Synthetic help',owner:null});
const page=()=>({assignment:{id:scope.assignmentId,version:3,language:'en',state:'published'},cases:[row()],total:1,page:1,pageSize:5,clientContext:context});
const read=(send,identity=session(),selection=scope,n=1,current=()=>true)=>readWorkerHelpHistory(send,identity,selection,n,new AbortController().signal,current);

test('Help history input accepts bounded scalar pages only and rejects forged scope',()=>{
  assert.deepEqual(workerHelpHistoryInput('assignment',{}),{page:1,pageSize:5});
  assert.deepEqual(workerHelpHistoryInput('assignment',{page:'5000',pageSize:'5'}),{page:5000,pageSize:5});
  for(const value of [{page:0},{page:5001},{page:-1},{page:true},{page:[]},{page:'01'},{page:'1.0'},{page:'1e0'},{pageSize:50},{pageSize:true},{scope:'foreign'},null,[]])assert.throws(()=>workerHelpHistoryInput('assignment',value),/Invalid help history/);
  for(const id of ['',null,'bad\nid','a'.repeat(101)])assert.throws(()=>workerHelpHistoryInput(id),/Invalid help history/);
});

test('Help history validates exact assignment version/language, private-field-free cases, totals and page bounds',()=>{
  assert.deepEqual(checkedWorkerHelpHistory(page(),scope,1,context),page());
  for(const mutate of [p=>p.assignment.id='other',p=>p.assignment.language='ur',p=>p.assignment.version=4,p=>p.assignment.state='draft',p=>p.assignment.rubric='private',p=>p.notes='private',p=>p.total=2,p=>p.total=-1,p=>p.page=2,p=>p.pageSize=100,p=>p.cases[0].status='pending',p=>p.cases[0].id='bad\nid',p=>p.cases[0].notes='private',p=>p.cases[0].createdAt='bad',p=>p.cases[0].helpText='a'.repeat(501),p=>p.cases[0].owner='bad\nname']){
    const value=page();mutate(value);assert.throws(()=>checkedWorkerHelpHistory(value,scope,1,context),e=>e.code==='invalid');
  }
  const duplicate=page();duplicate.cases.push(row());duplicate.total=2;assert.throws(()=>checkedWorkerHelpHistory(duplicate,scope,1,context));
  const unordered=page();unordered.cases.push({...row(),id:'newer',createdAt:'2026-10-03T09:18:00.000Z'});unordered.total=2;assert.throws(()=>checkedWorkerHelpHistory(unordered,scope,1,context));
  const later=page();later.page=5000;later.cases=[];assert.equal(checkedWorkerHelpHistory(later,scope,5000,context).total,1);
  const changed=page();changed.clientContext='b'.repeat(64);assert.throws(()=>checkedWorkerHelpHistory(changed,scope,1,context),e=>e.code==='session');
});

test('Help history GET captures identity, carries no mutation and rejects invalid selection before transport',async()=>{
  let calls=0;
  const result=await read(async(url,options)=>{calls++;assert.equal(url,'/api/worker/briefings/assignment-30/help-history?page=1&pageSize=5');assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.equal(options.headers['x-client-session-context'],context);assert.equal(options.body,undefined);assert.equal(options.method,undefined);return Response.json(page());});
  assert.equal(calls,1);assert.equal(result.cases[0].helpText,'Synthetic help');
  for(const selection of [{...scope,assignmentId:''},{...scope,version:0},{...scope,language:'xyz'}])await assert.rejects(read(()=>assert.fail('No fetch'),session(),selection),e=>e.code==='invalid');
  await assert.rejects(read(()=>assert.fail('No fetch'),session(),scope,5001),e=>e.code==='invalid');
});

test('Help history rejects session, expiry and selection changes during transport and body parsing',async()=>{
  for(const change of [s=>s.clientContext='b'.repeat(64),s=>s.workerId='another',s=>s.expiresAt='2098-01-01T00:00:00.000Z',s=>s.expiresAt='2000-01-01T00:00:00.000Z']){
    const identity=session();await assert.rejects(read(async()=>{change(identity);return Response.json(page());},identity),e=>e.code==='session');
  }
  let current=true;await assert.rejects(read(async()=>({ok:true,status:200,async json(){current=false;return page();}}),session(),scope,1,()=>current),e=>e.code==='session');
  await assert.rejects(read(()=>assert.fail('No fetch'),session(),scope,1,()=>false),e=>e.code==='session');
});

test('Help history read failures never become an empty, resolved or otherwise manufactured result',async()=>{
  for(const status of [401,403,409])await assert.rejects(read(async()=>new Response('',{status})),e=>e.code==='session');
  for(const status of [404,429,500,503])await assert.rejects(read(async()=>new Response('',{status})),e=>e.code==='unavailable');
  await assert.rejects(read(async()=>Response.json({...page(),privateNotes:'not allowed'})),e=>e.code==='invalid');
  await assert.rejects(read(async()=>new Response('not json')));
});
