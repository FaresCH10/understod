import {createGeminiAdapter,GEMINI_MODELS,GEMINI_ASSESSMENT_VERSION} from './gemini.mjs';
import {transcriptionProvenance} from './audio-provenance.mjs';

export function resolveRecordingAdapter(env=process.env,{fetchImpl=fetch}={}) {
  const mode=env.UNDERSTOOD_RECORDING_ADAPTER ?? 'disabled';
  if(mode==='disabled')return undefined;
  if(mode!=='gemini-free' || env.UNDERSTOOD_TIER!=='local' || env.UNDERSTOOD_AI_MODE!=='synthetic'
    || env.UNDERSTOOD_DATA_CLASS!=='synthetic' || env.UNDERSTOOD_ACCESS_MODE!=='credential')throw Error('Recording provider requires an isolated synthetic credential runtime');
  let hashes;
  try {
    const raw=env.UNDERSTOOD_SYNTHETIC_AUDIO_HASHES;
    if(typeof raw!=='string' || raw.length>7000)throw Error();hashes=JSON.parse(raw);
    if(!Array.isArray(hashes) || !hashes.length)throw Error();
  }catch {throw Error('Set explicit synthetic audio fixture hashes before enabling recording processing');}
  const options={apiKey:env.GEMINI_API_KEY,dataClass:'synthetic',syntheticAudioHashes:hashes,fetchImpl};
  const adapter=createGeminiAdapter(options);
  // This handle cannot prepare, translate or synthesize arbitrary content.
  return Object.freeze({provenance:Object.freeze({dataClass:'synthetic',adapter:'gemini-recording-allowlist-v1'}),
    transcriptionProvenance:transcriptionProvenance('gemini-recording-allowlist-v1',GEMINI_MODELS.transcription),
    assessmentProvenance:Object.freeze({adapter:'gemini-recording-assessment-v1',dataClass:'synthetic',model:GEMINI_MODELS.text,
      promptVersion:GEMINI_ASSESSMENT_VERSION,schemaVersion:GEMINI_ASSESSMENT_VERSION}),
    transcriptionModel:GEMINI_MODELS.transcription,assessmentModel:GEMINI_MODELS.text,
    permitsRecording:adapter.permitsSourceAudio,transcribe:adapter.transcribe,assess:adapter.assess,
    withJournal:requestJournal=>{
      const metered=createGeminiAdapter({...options,requestJournal});
      return Object.freeze({transcribe:metered.transcribe,assess:metered.assess});
    }});
}
