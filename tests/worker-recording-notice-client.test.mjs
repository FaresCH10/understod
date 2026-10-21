import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkerRecordingNotice,WorkerRecordingNoticeError} from '../src/worker-recording-notice.ts';

const session=()=>({clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()});
const notice=language=>({revision:2,configured:true,language,notice:'Synthetic private site recording information.'});
const fails=code=>reason=>reason instanceof WorkerRecordingNoticeError&&reason.code===code&&reason.message===code;

test('worker notice requests capture context and explicit language without changing identity',async()=>{
  const identity=session(),before={...identity},calls=[];
  for(const language of ['en','ar','ur']){
    const send=async(path,options)=>{calls.push({path,options});return Response.json(notice(language));};
    assert.equal(await readWorkerRecordingNotice(send,identity,language,new AbortController().signal,()=>true),notice(language).notice);
    const {path,options}=calls.at(-1);assert.equal(path,`/api/privacy/recording-notice?language=${language}`);
    assert.equal(options.method,'GET');assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
    assert.deepEqual(options.headers,{'x-client-session-context':identity.clientContext});assert.equal(options.body,undefined);assert.equal(options.signal.aborted,false);
  }
  assert.deepEqual(identity,before);
  assert.equal(await readWorkerRecordingNotice(async()=>Response.json({revision:0,configured:false,language:'ar',notice:null}),identity,'ar',new AbortController().signal,()=>true),null);
});
test('worker notice DTO rejects wrong language, private extras, incoherent revision and unsafe text',async()=>{
  for(const value of [null,[],{...notice('ur'),privateKey:'PRIVATE_DIAGNOSTIC'},{...notice('ur'),language:'en'},{...notice('ur'),revision:0},
    {...notice('ur'),revision:1000000001},{...notice('ur'),revision:-1},{...notice('ur'),configured:false},{...notice('ur'),notice:'short'},
    {...notice('ur'),notice:'x'.repeat(2001)},{...notice('ur'),notice:'Unsafe\u202e direction override text'},{...notice('ur'),revision:'2'}]){
    await assert.rejects(readWorkerRecordingNotice(async()=>Response.json(value),session(),'ur',new AbortController().signal,()=>true),fails('invalid'));
  }
});
test('worker notice pre-dispatch guards refuse stale context, authority, aborts and invalid languages',async()=>{
  let calls=0;const send=async()=>{calls++;return Response.json(notice('en'));};
  for(const identity of [{...session(),clientContext:'bad'},{...session(),expiresAt:new Date(Date.now()-1).toISOString()}])await assert.rejects(readWorkerRecordingNotice(send,identity,'en',new AbortController().signal,()=>true),fails('session'));
  await assert.rejects(readWorkerRecordingNotice(send,session(),'en',new AbortController().signal,()=>false),fails('session'));
  await assert.rejects(readWorkerRecordingNotice(send,session(),'fr',new AbortController().signal,()=>true),fails('invalid'));
  const command=new AbortController();command.abort();await assert.rejects(readWorkerRecordingNotice(send,session(),'en',command.signal,()=>true),fails('unavailable'));assert.equal(calls,0);
});
test('worker notice rechecks original identity and live authority around transport and parsing',async()=>{
  for(const phase of ['transport','body'])for(const change of ['context','expiry','authority']){
    const identity=session();let current=true;
    const alter=()=>{if(change==='context')identity.clientContext='b'.repeat(64);else if(change==='expiry')identity.expiresAt=new Date(Date.now()+7200000).toISOString();else current=false;};
    const send=async()=>{if(phase==='transport')alter();return {status:200,ok:true,json:async()=>{if(phase==='body')alter();return notice('en');}};};
    await assert.rejects(readWorkerRecordingNotice(send,identity,'en',new AbortController().signal,()=>current),fails('session'));
  }
});
test('worker notice failures are redacted and session mismatches are not ordinary outages',async()=>{
  for(const [status,error,code] of [[401,'PRIVATE_DIAGNOSTIC','session'],[403,'PRIVATE_DIAGNOSTIC','session'],[409,'Session context changed','session'],[409,'PRIVATE_DIAGNOSTIC','unavailable'],[503,'PRIVATE_DIAGNOSTIC','unavailable']]){
    await assert.rejects(readWorkerRecordingNotice(async()=>Response.json({error},{status}),session(),'en',new AbortController().signal,()=>true),fails(code));
  }
  for(const send of [async()=>{throw Error('PRIVATE_DIAGNOSTIC');},async()=>({ok:true,status:200,json:async()=>{throw Error('PRIVATE_DIAGNOSTIC');}})])await assert.rejects(readWorkerRecordingNotice(send,session(),'en',new AbortController().signal,()=>true),fails('unavailable'));
});
test('worker notice aborts during parsing cannot publish a successful notice or falsely lock the session',async()=>{
  const command=new AbortController(),send=async()=>({status:200,ok:true,json:async()=>{command.abort();return notice('en');}});
  await assert.rejects(readWorkerRecordingNotice(send,session(),'en',command.signal,()=>!command.signal.aborted),fails('unavailable'));
});
