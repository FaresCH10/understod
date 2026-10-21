import test from 'node:test';
import assert from 'node:assert/strict';
import wavefile from 'wavefile';
import {inspectWav} from '../server/audio.mjs';
import {normalizeSpeechWav} from '../server/ai/speech-wav.mjs';
const {WaveFile}=wavefile;

function tone(rate=24000,hz=1000,duration=1) {
  const samples=Int16Array.from({length:Math.round(rate*duration)},(_,i)=>Math.round(12000*Math.sin(2*Math.PI*hz*i/rate)));
  const wav=new WaveFile();wav.fromScratch(1,rate,'16',samples);return Buffer.from(wav.toBuffer());
}
function rms(bytes){let sum=0;for(let i=244;i<bytes.length-200;i+=2)sum+=bytes.readInt16LE(i)**2;return Math.sqrt(sum/((bytes.length-444)/2));}
test('speech WAV converts actual 24 kHz samples to canonical 16 kHz without changing duration or source bytes',()=>{
  const source=tone(),before=Buffer.from(source),normalized=normalizeSpeechWav(source),info=inspectWav(normalized);
  assert.deepEqual(source,before);assert.equal(normalized.readUInt32LE(24),16000);assert.equal(info.durationSeconds,1);
  assert.equal(info.bytes,32044);assert.ok(rms(normalized)>7000&&rms(normalized)<10000);
  let crossings=0;for(let i=46;i<normalized.length;i+=2)if(normalized.readInt16LE(i-2)<=0&&normalized.readInt16LE(i)>0)crossings++;
  assert.ok(crossings>=999&&crossings<=1001,'Pitch is preserved instead of changing playback speed');
});
test('speech WAV resampling filters frequencies above the target Nyquist limit and preserves existing 16 kHz bytes',()=>{
  const low=normalizeSpeechWav(tone(24000,1000)),high=normalizeSpeechWav(tone(24000,10000));
  assert.ok(rms(high)<rms(low)*0.2,'Downsampling must attenuate high-frequency aliasing');
  const existing=tone(16000);assert.deepEqual(normalizeSpeechWav(existing),existing);assert.notEqual(normalizeSpeechWav(existing),existing);
});
test('speech WAV rejects unsupported rates, stereo, silence, corrupt lengths, tiny and oversized audio',()=>{
  const stereo=tone();stereo.writeUInt16LE(2,22);
  const corrupt=tone();corrupt.writeUInt32LE(1,40);
  const silent=tone();silent.fill(0,44);
  const fmt=tone();fmt.writeUInt32LE(18,16);
  for(const bytes of [Buffer.alloc(20),tone(48000),stereo,corrupt,silent,fmt,tone(24000,1000,0.1),Buffer.alloc(44+90*24000*2+65538)])
    assert.throws(()=>normalizeSpeechWav(bytes));
});
function withMetadata(source,{id='iXML',length=6100,declared=length}={}) {
  const chunk=Buffer.alloc(8+length+length%2);chunk.write(id);chunk.writeUInt32LE(declared,4);
  const bytes=Buffer.concat([source,chunk]);bytes.writeUInt32LE(bytes.length-8,4);return bytes;
}
test('speech WAV strips bounded trailing metadata, retaining only actual audio frames at either supported rate',()=>{
  for(const rate of [16000,24000]) {
    const original=tone(rate),withTags=withMetadata(original),normalized=normalizeSpeechWav(withTags);
    assert.equal(inspectWav(normalized).durationSeconds,1);assert.equal(normalized.length,32044);
    assert.deepEqual(normalized,normalizeSpeechWav(original));
  }
  for(const options of [{id:'data'},{id:'fmt '},{length:65536},{declared:7000}])assert.throws(()=>normalizeSpeechWav(withMetadata(tone(),options)));
  const unframed=Buffer.concat([tone(),Buffer.alloc(3)]);unframed.writeUInt32LE(unframed.length-8,4);
  assert.throws(()=>normalizeSpeechWav(unframed));
});
