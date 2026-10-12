import {createGeminiAdapter,GEMINI_MODELS} from './gemini.mjs';
import {transcriptionProvenance} from './audio-provenance.mjs';

export function resolveSourceTranscription(env=process.env,{fetchImpl=fetch}={}) {
  const mode=env.UNDERSTOOD_SOURCE_TRANSCRIPTION ?? 'disabled';
  if(mode==='disabled')return undefined;
  if(mode!=='gemini-free' || env.UNDERSTOOD_TIER!=='local' || env.UNDERSTOOD_AI_MODE!=='synthetic'
    || env.UNDERSTOOD_DATA_CLASS!=='synthetic' || env.UNDERSTOOD_ACCESS_MODE!=='credential')throw Error('Source provider requires an isolated synthetic credential runtime');
  let hashes;
  try {
    const raw=env.UNDERSTOOD_SYNTHETIC_AUDIO_HASHES;
    if(typeof raw!=='string' || raw.length>7000)throw Error();hashes=JSON.parse(raw);
    if(!Array.isArray(hashes) || !hashes.length)throw Error();
  }catch {throw Error('Set explicit synthetic audio fixture hashes before enabling source transcription');}
  const apiKey=env.GEMINI_API_KEY,adapter=createGeminiAdapter({apiKey,dataClass:'synthetic',syntheticAudioHashes:hashes,fetchImpl});
  // Expose transcription only; source titles, transcripts and worker assessments cannot use this handle.
  return Object.freeze({provenance:Object.freeze({dataClass:'synthetic',adapter:'gemini-source-allowlist-v1'}),
    transcriptionProvenance:transcriptionProvenance('gemini-source-allowlist-v1',GEMINI_MODELS.transcription),
    model:GEMINI_MODELS.transcription,permitsSourceAudio:adapter.permitsSourceAudio,transcribe:adapter.transcribe,
    withJournal:requestJournal=>Object.freeze({transcribe:createGeminiAdapter({apiKey,dataClass:'synthetic',syntheticAudioHashes:hashes,fetchImpl,requestJournal}).transcribe})});
}
