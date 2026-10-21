import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {checkedVoiceHttpReceipt,requestCaseVoice,VoiceRequestError} from '../src/case-voice-request.ts';
import {retainVoice,readVoicePending} from '../src/case-voice-recovery.ts';

const context='a'.repeat(64),bytes=new Uint8Array(8044).fill(13),hash=createHash('sha256').update(bytes).digest('hex'),id=randomUUID();
const session=()=>({clientContext:context,expiresAt:new Date(Date.now()+60000).toISOString()});
const help=()=>({kind:'help',id:'assignment-14'}),reply=()=>({kind:'reply',id:'case-14',assignmentId:'assignment-14'}),pending=()=>({id,hash});
const receipt=(scope=help(),status='received')=>({id,caseId:scope.kind==='help'?id:scope.id,assignmentId:scope.kind==='help'?scope.id:scope.assignmentId,kind:scope.kind,sha256:hash,status,
  createdAt:'2026-10-19T09:00:00.000Z',receivedAt:status==='received'?'2026-10-19T09:00:01.000Z':null,clientContext:context});
const error=code=>reason=>reason instanceof VoiceRequestError&&reason.code===code;
const call=(send,op={kind:'receipt'},s=session(),scope=help(),retained=pending(),current=()=>true,canMutate=current,signal=new AbortController().signal)=>requestCaseVoice(send,s,scope,retained,op,signal,current,canMutate);

test('voice HTTP receipts require exact context, assignment/case/recording digest and coherent server stages',()=>{
  for(const scope of [help(),reply()])for(const status of ['storing','received','failed'])assert.equal(checkedVoiceHttpReceipt(receipt(scope,status),scope,pending(),context).status,status);
  for(const row of [null,{}, {...receipt(),notes:'PRIVATE'}, {...receipt(),assignmentId:'foreign'}, {...receipt(),caseId:'foreign'},
    {...receipt(),id:randomUUID()}, {...receipt(),sha256:'b'.repeat(64)}, {...receipt(),status:'matched'}, {...receipt(),receivedAt:null},
    {...receipt(),createdAt:'yesterday'}, {...receipt(),receivedAt:'2026-10-18T09:00:01.000Z'}, {...receipt(),status:'failed'},
    {...receipt(),status:'storing'}, {...receipt(),assignmentId:''}])assert.throws(()=>checkedVoiceHttpReceipt(row,help(),pending(),context),error('invalid'));
  assert.throws(()=>checkedVoiceHttpReceipt({...receipt(reply()),assignmentId:'foreign'},reply(),pending(),context),error('invalid'));
  assert.throws(()=>checkedVoiceHttpReceipt({...receipt(),clientContext:'b'.repeat(64)},help(),pending(),context),error('session'));
  assert.throws(()=>checkedVoiceHttpReceipt(receipt(),help(),pending(),'bad'),error('invalid'));
});

test('voice receipt checks are scoped GET-only and explicit send uses the exact captured WAV bytes once',async()=>{
  const calls=[];const send=async(url,options)=>{calls.push({url,options});return Response.json(receipt());};
  await call(send);assert.equal(calls[0].url,`/api/worker/briefings/assignment-14/help-audio/${id}`);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
  assert.equal(calls[0].options.headers['x-client-session-context'],context);assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'include');assert.equal(calls[0].options.redirect,'error');
  await call(send,{kind:'send',bytes});assert.equal(calls.length,2);assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.headers['content-type'],'audio/wav');assert.deepEqual(calls[1].options.body,bytes);
  const scope=reply();await call(async(url,options)=>{assert.equal(url,`/api/clarifications/case-14/voice/${id}`);assert.equal(options.method,'GET');return Response.json(receipt(scope));},undefined,session(),scope);
  const mutable=new Uint8Array(bytes);const result=call(async(url,options)=>{assert.deepEqual(options.body,bytes);return Response.json(receipt());},{kind:'send',bytes:mutable});mutable.fill(99);await result;
});

test('voice invalid commands, scopes, hashes, sessions and denied writes cannot dispatch',async()=>{
  let calls=0;const send=async()=>{calls++;return Response.json(receipt());};
  for(const op of [{kind:'delete'},{kind:'receipt',bytes},{kind:'send',bytes:[]},{kind:'send',bytes:new Uint8Array(8043)}, {kind:'send',bytes:new Uint8Array(2880045)}, {kind:'send',bytes:new Uint8Array(8044)}])
    await assert.rejects(call(send,op),error('invalid'));
  for(const scope of [{kind:'other',id:'assignment-14'},{kind:'help',id:'bad\nid'},{kind:'reply',id:'case-14'},{kind:'reply',id:'case-14',assignmentId:'foreign\nid'}, {...help(),site:'foreign'}])
    await assert.rejects(call(send,undefined,session(),scope),error('invalid'));
  for(const retained of [{id:'bad',hash}, {id,hash:'bad'},{...pending(),bytes}])await assert.rejects(call(send,undefined,session(),help(),retained),error('invalid'));
  for(const identity of [{...session(),expiresAt:'2000-01-01T00:00:00.000Z'},{...session(),clientContext:'bad'}])await assert.rejects(call(send,undefined,identity),error('session'));
  await assert.rejects(call(send,{kind:'send',bytes},session(),help(),pending(),()=>true,()=>false),error('blocked'));
  const aborted=new AbortController();aborted.abort();await assert.rejects(call(send,undefined,session(),help(),pending(),()=>true,()=>true,aborted.signal),error('unavailable'));
  assert.equal(calls,0);
});

test('voice identities and selections are checked across hashing, dispatch and body parsing',async()=>{
  let calls=0,live=true;
  const stopped=call(async()=>{calls++;return Response.json(receipt());},{kind:'send',bytes},session(),help(),pending(),()=>live);live=false;await assert.rejects(stopped,error('session'));assert.equal(calls,0);
  for(const mutate of [s=>s.clientContext='b'.repeat(64),s=>s.expiresAt='2000-01-01T00:00:00.000Z']){
    const identity=session();await assert.rejects(call(async()=>{mutate(identity);return Response.json(receipt());},undefined,identity),error('session'));
  }
  const scope=reply();await assert.rejects(call(async()=>{scope.assignmentId='other';return Response.json(receipt(scope));},undefined,session(),scope),error('session'));
  const retained=pending();await assert.rejects(call(async()=>{retained.hash='b'.repeat(64);return Response.json(receipt());},undefined,session(),help(),retained),error('session'));
  live=true;await assert.rejects(call(async()=>({ok:true,status:200,json:async()=>{live=false;return receipt();}}),undefined,session(),help(),pending(),()=>live),error('session'));
  let allowed=true;await assert.rejects(call(async()=>{allowed=false;return Response.json(receipt());},{kind:'send',bytes},session(),help(),pending(),()=>true,()=>allowed),error('blocked'));
});

test('voice errors never expose diagnostics, invent absence or automatically replay an uncertain upload',async()=>{
  for(const [status,body,code] of [[401,null,'session'],[403,null,'session'],[409,{error:'Session context changed'},'session'],[409,{error:'Voice storage in progress'},'conflict'],[404,{error:'Voice receipt unavailable'},'unavailable'],[503,{error:'PRIVATE SQL DIAGNOSTIC'},'unavailable']])
    await assert.rejects(call(async()=>Response.json(body,{status})),reason=>error(code)(reason)&&!reason.message.includes('PRIVATE'));
  await assert.rejects(call(async()=>new Response('PRIVATE INVALID JSON')),error('unavailable'));
  await assert.rejects(call(async()=>{throw Error('PRIVATE TRANSPORT');}),error('unavailable'));
  const values=new Map(),store={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const identity=session(),scope=help(),retained=await retainVoice(store,identity,scope,id,bytes);let posts=0;
  await assert.rejects(call(async(url,options)=>{if(options.method==='POST')posts++;return Response.json({...receipt(),privateNotes:'PRIVATE'});},{kind:'send',bytes},identity,scope,retained),error('invalid'));
  await assert.rejects(call(async(url,options)=>{assert.equal(options.method,'GET');return Response.json({error:'Voice receipt unavailable'},{status:404});},undefined,identity,scope,retained),error('unavailable'));
  assert.deepEqual(readVoicePending(store,identity,scope),retained);assert.equal(posts,1);assert.equal(JSON.stringify([...values]).includes('bytes'),false);
});
