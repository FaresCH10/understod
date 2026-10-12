import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {resolveRecordingAdapter} from '../server/ai/recording-config.mjs';
import {rehearsalConfig,rehearsalTasks} from '../server/postgres/runtime.mjs';

const hash='a'.repeat(64),fetchImpl=()=>assert.fail('Unexpected outbound call');
const env={UNDERSTOOD_RECORDING_ADAPTER:'gemini-free',UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',
  UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash]),GEMINI_API_KEY:'test-only'};
test('recording provider stays disabled without explicit synthetic opt-in',async()=>{
  assert.equal(resolveRecordingAdapter({GEMINI_API_KEY:'test-only'},{fetchImpl}),undefined);
  assert.equal(resolveRecordingAdapter({...env,UNDERSTOOD_RECORDING_ADAPTER:'disabled'},{fetchImpl}),undefined);
  const tasks=rehearsalTasks({connect:()=>assert.fail('Disabled stage touched database')},{},{schema:'public'});
  assert.equal(await tasks.recording(),false);
});
test('recording opt-in rejects real data, hosted tiers and unsafe hash lists without network',()=>{
  for(const patch of [{UNDERSTOOD_RECORDING_ADAPTER:'other'},{UNDERSTOOD_TIER:'production'},{UNDERSTOOD_TIER:'staging'},
    {UNDERSTOOD_AI_MODE:'live'},{UNDERSTOOD_DATA_CLASS:'real'},{UNDERSTOOD_ACCESS_MODE:'demo'},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:undefined},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:'[]'},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:'['},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify(['*'])},
    {UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash,hash])},{UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:' '.repeat(7001)},{GEMINI_API_KEY:''}])
    assert.throws(()=>resolveRecordingAdapter({...env,...patch},{fetchImpl}));
});
test('recording runtime exposes only immutable allowlisted transcription and assessment',()=>{
  const adapter=resolveRecordingAdapter(env,{fetchImpl});
  assert.ok(Object.isFrozen(adapter));assert.ok(Object.isFrozen(adapter.provenance));
  assert.equal(adapter.permitsRecording({sha256:hash}),true);assert.equal(adapter.permitsRecording({sha256:'b'.repeat(64)}),false);
  assert.equal(adapter.permitsRecording(null),false);
  for(const name of ['prepare','translate','speech'])assert.equal(adapter[name],undefined);
  assert.equal(JSON.stringify(adapter).includes('test-only'),false);
  const config=rehearsalConfig({...env,UNDERSTOOD_PUBLIC_ORIGIN:'http://127.0.0.1:3030',
    UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_recording_config',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:resolve('data/recording-runtime-synthetic')});
  assert.equal(config.recordingAdapter.permitsRecording({sha256:hash}),true);
});
