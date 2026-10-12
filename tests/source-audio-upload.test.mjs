import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSourceAudio} from '../src/source-audio.ts';
import {prepareSourceUpload,savePendingSourceUpload,readPendingSourceUpload,clearPendingSourceUpload,checkSourceUpload,sendSourceUpload,checkedSourceUploadReceipt} from '../src/source-audio-upload.ts';
import {sourceAudioInput} from '../server/source-audio-input.mjs';

const id='8deac46b-26eb-4cb3-9c4c-f3d03fdf7753';
const session={clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()};
const input={requestId:id,title:' Synthetic source ',generationLanguages:['en','ar']};
const samples=Float32Array.from({length:48000},(_,i)=>Math.sin(i/10)*0.5);
const decoded={duration:1,sampleRate:48000,numberOfChannels:1,getChannelData:()=>samples};
const prepared=()=>prepareSourceAudio(new Blob(['synthetic original'],{type:'audio/webm'}),id,async()=>decoded);
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const receipt=p=>({requestId:p.requestId,requestHash:p.requestHash,status:'received',receivedAt:new Date().toISOString(),briefingId:null});

test('source upload matches the server hash and exact binary frame; receipt references contain no audio',async()=>{
  const audio=await prepared(),pending=await prepareSourceUpload(audio,input,session),storage=store();
  assert.equal(pending.title,'Synthetic source');assert.ok(Object.isFrozen(pending));assert.ok(Object.isFrozen(pending.generationLanguages));
  savePendingSourceUpload(storage,session,pending);assert.deepEqual(readPendingSourceUpload(storage,session),pending);
  let calls=0;
  const result=await sendSourceUpload(pending,audio,async(url,options)=>{
    calls++;assert.equal(url,'/api/source-audio');assert.equal(options.method,'POST');assert.equal(options.headers['x-client-session-context'],session.clientContext);
    assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');
    const bytes=Buffer.from(await options.body.arrayBuffer()),length=bytes.readUInt32LE(0),wavLength=bytes.readUInt32LE(4);
    const meta=JSON.parse(bytes.subarray(8,8+length).toString()),wav=bytes.subarray(8+length,8+length+wavLength),original=bytes.subarray(8+length+wavLength);
    const parsed=sourceAudioInput(meta,original,wav);assert.equal(parsed.requestHash,pending.requestHash);
    assert.equal(original.toString(),'synthetic original');assert.equal(wav.length,32044);
    return Response.json({...receipt(pending),duplicate:false});
  });
  assert.equal(calls,1);assert.equal(result.status,'received');
  assert.ok(JSON.stringify(readPendingSourceUpload(storage,session)).length<1024);
  clearPendingSourceUpload(storage,session,pending);assert.equal(readPendingSourceUpload(storage,session),null);
});

test('source upload fails closed on storage errors, expiry, changed intent and wrong original bytes',async()=>{
  const audio=await prepared(),pending=await prepareSourceUpload(audio,input,session),storage=store();
  assert.throws(()=>savePendingSourceUpload({...storage,setItem:()=>{throw Error();}},session,pending),/No upload was sent/);
  savePendingSourceUpload(storage,session,pending);
  assert.throws(()=>savePendingSourceUpload(storage,session,{...pending,title:'Other title'}),/Resolve/);
  assert.throws(()=>readPendingSourceUpload(storage,{...session,expiresAt:'2000-01-01T00:00:00.000Z'}),/ended/);
  storage.setItem(`understood:source-upload:${session.clientContext}`,'null');assert.throws(()=>readPendingSourceUpload(storage,session),/cannot be verified/);
  let calls=0;const fetcher=async()=>{calls++;throw Error('must not send');};
  const wrong=await prepareSourceAudio(new Blob(['different original'],{type:'audio/webm'}),id,async()=>decoded);
  await assert.rejects(sendSourceUpload(pending,wrong,fetcher),/exact original/);assert.equal(calls,0);
  await assert.rejects(checkedSourceUploadReceipt({found:true,...receipt(pending)},{...pending,title:'Changed title'}),/hash/);
});

test('source receipt lookup never sends audio or retries a failed POST automatically',async()=>{
  const audio=await prepared(),pending=await prepareSourceUpload(audio,input,session);let calls=0;
  await assert.rejects(sendSourceUpload(pending,audio,async()=>{calls++;throw Error('lost acknowledgement');}),/lost acknowledgement/);assert.equal(calls,1);
  const absent=await checkSourceUpload(pending,async(url,options)=>{
    calls++;assert.equal(url,`/api/source-audio/${id}`);assert.equal(options.body,undefined);assert.equal(options.method,undefined);
    return Response.json({found:false,requestId:id});
  });assert.equal(absent.found,false);assert.equal(calls,2);
  for(const value of [{found:true,...receipt(pending),requestHash:'b'.repeat(64)},{found:false,requestId:id,secret:'invalid'},
    {found:true,...receipt(pending),status:'transcribed',briefingId:'different'}, {found:true,...receipt(pending),receivedAt:null}])
    await assert.rejects(checkedSourceUploadReceipt(value,pending),/does not match/);
  assert.equal((await checkedSourceUploadReceipt({found:true,...receipt(pending),status:'blocked'},pending)).status,'blocked');
  assert.equal((await checkedSourceUploadReceipt({found:true,...receipt(pending),audioStatus:'removed'},pending)).audioStatus,'removed');
  await assert.rejects(checkedSourceUploadReceipt({found:true,...receipt(pending),audioStatus:'unverified'},pending),/does not match/);
});
