import {createRecordingSubmission,type RecordingSubmission} from './audio.ts';

export const SOURCE_AUDIO_MAX_BYTES=10*1024*1024;
export type PreparedSourceAudio=Readonly<{original:Blob;recording:RecordingSubmission;durationSeconds:number;byteLength:number}>;

export function checkSourceAudio(source:Blob) {
  if(!(source instanceof Blob) || !source.size)throw Error('Choose a nonempty audio file.');
  if(source.size>SOURCE_AUDIO_MAX_BYTES)throw Error('Source audio must be no larger than 10 MB.');
}

export async function decodeSourceAudio(source:Blob):Promise<AudioBuffer> {
  checkSourceAudio(source);
  const context=new AudioContext();
  try {return await context.decodeAudioData(await source.arrayBuffer());}
  finally {await context.close().catch(()=>{});}
}

export async function prepareSourceAudio(source:Blob,requestId:string,decode=decodeSourceAudio,signal?:AbortSignal):Promise<PreparedSourceAudio> {
  checkSourceAudio(source);signal?.throwIfAborted();
  const recording=createRecordingSubmission(source,requestId,async value=>{
    signal?.throwIfAborted();
    const audio=await decode(value);signal?.throwIfAborted();
    // Bound channel allocation before the existing canonical encoder runs.
    if(!Number.isInteger(audio.numberOfChannels) || audio.numberOfChannels<1 || audio.numberOfChannels>8)throw Error('Unsupported source audio channel count.');
    return audio;
  });
  const bytes=await recording.bytes();signal?.throwIfAborted();
  return Object.freeze({original:source,recording,durationSeconds:(bytes.length-44)/32000,byteLength:bytes.length});
}
