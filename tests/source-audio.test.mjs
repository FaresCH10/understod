import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSourceAudio,prepareSourceAudio,SOURCE_AUDIO_MAX_BYTES} from '../src/source-audio.ts';
import {inspectWav} from '../server/audio.mjs';

const id='8deac46b-26eb-4cb3-9c4c-f3d03fdf7753';
const source=new Blob(['synthetic compressed audio'],{type:'audio/webm'});
const samples=Float32Array.from({length:48000},(_,i)=>Math.sin(i/10)*0.5);
const decoded={duration:1,sampleRate:48000,numberOfChannels:1,getChannelData:()=>samples};

test('supervisor source audio is bounded before decode and retains original plus one canonical WAV',async()=>{
  assert.throws(()=>checkSourceAudio(new Blob()),/nonempty/);
  assert.throws(()=>checkSourceAudio(new Blob([new Uint8Array(SOURCE_AUDIO_MAX_BYTES+1)])),/10 MB/);
  assert.throws(()=>checkSourceAudio({size:3}),/nonempty/);
  let calls=0;
  const result=await prepareSourceAudio(source,id,async value=>{calls++;assert.equal(value,source);return decoded;});
  assert.equal(result.original,source);assert.equal(result.durationSeconds,1);assert.equal(result.byteLength,32044);
  assert.equal(result.recording.submissionId,id);assert.equal(calls,1);assert.ok(Object.isFrozen(result));
  const bytes=await result.recording.bytes();assert.equal(inspectWav(Buffer.from(bytes)).durationSeconds,1);
  bytes.fill(0);assert.equal(inspectWav(Buffer.from(await result.recording.bytes())).durationSeconds,1);assert.equal(calls,1);
  await assert.rejects(prepareSourceAudio(source,'invalid',async()=>decoded),/Invalid recording/);
});

test('supervisor source rejects corrupt, silent, overlong and unsupported decoded audio without a preview',async()=>{
  for(const audio of [{...decoded,duration:91},{...decoded,duration:0.1},{...decoded,numberOfChannels:9},{...decoded,numberOfChannels:1.5},{...decoded,getChannelData:()=>new Float32Array(48000)}])await assert.rejects(prepareSourceAudio(source,id,async()=>audio),/between|channel|No audio/);
  await assert.rejects(prepareSourceAudio(source,id,async()=>{throw Error('Corrupt source');}),/Corrupt source/);
  let calls=0;await assert.rejects(prepareSourceAudio(new Blob([new Uint8Array(SOURCE_AUDIO_MAX_BYTES+1)]),id,async()=>{calls++;return decoded;}),/10 MB/);assert.equal(calls,0);
});

test('canceled source preparation cannot expose a late decode as a usable preview',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(prepareSourceAudio(source,id,async()=>{calls++;return decoded;},controller.signal),{name:'AbortError'});assert.equal(calls,0);
  let finish;const late=new AbortController();
  const preparing=prepareSourceAudio(source,id,()=>new Promise(resolve=>{finish=resolve;}),late.signal);
  await new Promise(resolve=>setImmediate(resolve));late.abort();finish(decoded);
  await assert.rejects(preparing,{name:'AbortError'});
});
