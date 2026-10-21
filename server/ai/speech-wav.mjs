import wavefile from 'wavefile';
import {inspectWav} from '../audio.mjs';
const {WaveFile}=wavefile;

// Gemini may return its 24 kHz default despite a 16 kHz request. Convert samples, not just the header.
export function normalizeSpeechWav(bytes) {
  if(!Buffer.isBuffer(bytes) || bytes.length<44 || bytes.length>44+90*24000*2+65536)throw Error('Unsupported speech WAV');
  const rate=bytes.readUInt32LE(24);
  if(rate===16000 && bytes.readUInt32LE(40)===bytes.length-44){inspectWav(bytes);return Buffer.from(bytes);}
  const size=bytes.readUInt32LE(40),dataEnd=44+size;
  if(![16000,24000].includes(rate) || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,16)!=='WAVEfmt '
    || bytes.readUInt32LE(16)!==16 || bytes.readUInt16LE(20)!==1 || bytes.readUInt16LE(22)!==1
    || bytes.readUInt32LE(28)!==rate*2 || bytes.readUInt16LE(32)!==2 || bytes.readUInt16LE(34)!==16
    || bytes.toString('ascii',36,40)!=='data' || bytes.readUInt32LE(4)!==bytes.length-8
    || size%2 || dataEnd>bytes.length || size/(rate*2)<0.25 || size/(rate*2)>90
    || bytes.length-dataEnd>65536)throw Error('Unsupported speech WAV');
  // Bound and discard trailing provider metadata; duplicate format/audio chunks are not metadata.
  let offset=dataEnd,chunks=0;
  while(offset<bytes.length) {
    if(++chunks>8 || offset+8>bytes.length || ['fmt ','data'].includes(bytes.toString('ascii',offset,offset+4)))throw Error('Unsupported speech WAV');
    const length=bytes.readUInt32LE(offset+4);offset+=8+length+(length%2);
    if(offset>bytes.length)throw Error('Unsupported speech WAV');
  }
  const source=new WaveFile(bytes),wav=new WaveFile();
  const samples=source.getSamples(true,Int16Array);
  if(samples.length!==size/2)throw Error('Unsupported speech WAV');
  wav.fromScratch(1,rate,'16',samples);
  if(rate!==16000)wav.toSampleRate(16000,{method:'sinc',LPF:true});
  const normalized=Buffer.from(wav.toBuffer());
  inspectWav(normalized);
  return normalized;
}
