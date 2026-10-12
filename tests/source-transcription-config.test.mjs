import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSourceTranscription} from '../server/ai/source-transcription-config.mjs';
import {rehearsalConfig} from '../server/postgres/runtime.mjs';
import {resolve} from 'node:path';

const hash='a'.repeat(64);
const env={UNDERSTOOD_SOURCE_TRANSCRIPTION:'gemini-free',UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',
  UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash]),GEMINI_API_KEY:'test-only'};
test('source transcription is disabled by default and credentials alone never enable outbound calls',()=>{
  const fetchImpl=()=>assert.fail('Unexpected outbound call');
  assert.equal(resolveSourceTranscription({}, {fetchImpl}),undefined);
  assert.equal(resolveSourceTranscription({GEMINI_API_KEY:'test-only'},{fetchImpl}),undefined);
  assert.equal(resolveSourceTranscription({...env,UNDERSTOOD_SOURCE_TRANSCRIPTION:'disabled'},{fetchImpl}),undefined);
});
test('source transcription opt-in rejects unsafe runtime and malformed or empty allowlists without network',()=>{
  const fetchImpl=()=>assert.fail('Unexpected outbound call');
  for(const patch of [{UNDERSTOOD_SOURCE_TRANSCRIPTION:'other'},{UNDERSTOOD_TIER:'production'},
    {UNDERSTOOD_AI_MODE:'live'},{UNDERSTOOD_DATA_CLASS:'real-worker'},{UNDERSTOOD_ACCESS_MODE:'demo'},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:undefined},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:'[]'},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:'null'},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:'['},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify(['*'])},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:' '.repeat(7001)},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash,hash])},{GEMINI_API_KEY:''}])
    assert.throws(()=>resolveSourceTranscription({...env,...patch},{fetchImpl}));
});
test('source runtime exposes only immutable allowlisted transcription, not a general Gemini handle',()=>{
  const adapter=resolveSourceTranscription(env,{fetchImpl:()=>assert.fail('Unexpected outbound call')});
  assert.ok(Object.isFrozen(adapter));assert.ok(Object.isFrozen(adapter.provenance));
  assert.equal(adapter.permitsSourceAudio({sha256:hash}),true);assert.equal(adapter.permitsSourceAudio({sha256:'b'.repeat(64)}),false);
  assert.equal(adapter.permitsSourceAudio(null),false);assert.equal(adapter.prepare,undefined);assert.equal(adapter.assess,undefined);assert.equal(adapter.speech,undefined);
  assert.equal(JSON.stringify(adapter).includes('test-only'),false);
  const config=rehearsalConfig({...env,UNDERSTOOD_PUBLIC_ORIGIN:'http://127.0.0.1:3030',
    UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_source_config',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:resolve('data/source-runtime-synthetic')});
  assert.equal(config.sourceAdapter.permitsSourceAudio({sha256:hash}),true);
  assert.equal(config.sourceAdapter.provenance.dataClass,'synthetic');
});
