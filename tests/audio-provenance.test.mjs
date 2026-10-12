import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {sourceTranscriptionInputHash,recordingTranscriptionInputHash,transcriptionProvenance} from '../server/ai/audio-provenance.mjs';
import {assessmentInputHash} from '../server/ai/assessment-config.mjs';
import {resolveRecordingAdapter} from '../server/ai/recording-config.mjs';
import {resolveSourceTranscription} from '../server/ai/source-transcription-config.mjs';
import {GEMINI_MODELS} from '../server/ai/gemini.mjs';

test('audio fingerprints bind source receipt/authority and exact frozen recording publication inputs',()=>{
  const row={id:'recording',request_id:'request',request_hash:'a'.repeat(64),org_id:'org',site_id:'site',assignment_id:'assignment',
    sha256:'b'.repeat(64),bytes:32044,duration_seconds:1,original_sha256:'c'.repeat(64),original_bytes:123,authority_json:{role:'owner',revision:1}};
  const input={question:'Which bay?',askedFacts:['12 cartons at bay 4'],language:'ar',publicationId:'publication',version:3,answer:'12 cartons at bay 4'};
  const source=sourceTranscriptionInputHash(row),recording=recordingTranscriptionInputHash(row,input);
  for(const patch of [{request_hash:'d'.repeat(64)},{authority_json:{role:'owner',revision:2}},{original_bytes:124},{org_id:'other'},
    {site_id:'other'},{request_id:'other'},{sha256:'e'.repeat(64)},{bytes:64044}])assert.notEqual(sourceTranscriptionInputHash({...row,...patch}),source);
  for(const patch of [{id:'other'},{assignment_id:'other'},{org_id:'other'},{site_id:'other'},{sha256:'e'.repeat(64)},{bytes:64044},{duration_seconds:2}])
    assert.notEqual(recordingTranscriptionInputHash({...row,...patch},input),recording);
  for(const patch of [{question:'Another question'},{askedFacts:['5 cartons at bay 7']},{language:'en'},{publicationId:'other'},{version:4}])
    assert.notEqual(recordingTranscriptionInputHash(row,{...input,...patch}),recording);
  assert.equal(recordingTranscriptionInputHash(row,{...input,answer:'Later transcript'}),recording);
  assert.notEqual(assessmentInputHash({...input,answer:'Later transcript'}),assessmentInputHash(input));
});

test('synthetic source and recording adapters freeze exact per-stage model/prompt/schema provenance without credentials',()=>{
  const env={UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',
    UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify(['a'.repeat(64)]),GEMINI_API_KEY:'synthetic-never-sent'};
  const options={fetchImpl:()=>assert.fail('Unexpected network')};
  const source=resolveSourceTranscription({...env,UNDERSTOOD_SOURCE_TRANSCRIPTION:'gemini-free'},options);
  const recording=resolveRecordingAdapter({...env,UNDERSTOOD_RECORDING_ADAPTER:'gemini-free'},options);
  assert.deepEqual(source.transcriptionProvenance,transcriptionProvenance('gemini-source-allowlist-v1',GEMINI_MODELS.transcription));
  assert.deepEqual(recording.transcriptionProvenance,transcriptionProvenance('gemini-recording-allowlist-v1',GEMINI_MODELS.transcription));
  assert.ok(Object.isFrozen(source.transcriptionProvenance));assert.ok(Object.isFrozen(recording.transcriptionProvenance));
  assert.ok(Object.isFrozen(recording.assessmentProvenance));assert.equal(recording.assessmentProvenance.model,GEMINI_MODELS.text);
  assert.doesNotMatch(JSON.stringify([source,recording]),/synthetic-never-sent/);
});

test('migration preserves unknown historical operation evidence and requires provenance on future audio operations',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'understood-audio-provenance-'));
  const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
  try {
    const source=resolve('server/postgres/migrations');
    for(const name of await readdir(source))if(/^\d{3}_[a-z0-9_]+\.sql$/.test(name) && name<'067_')await copyFile(join(source,name),join(directory,name));
    assert.equal((await runMigrations(pool,{directory})).length,66);
    await db.exec("INSERT INTO organizations VALUES('legacy','Synthetic legacy');");
    const id=randomUUID();
    await db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','recording-transcription','legacy-recording',$2,$3,'synthetic',4,CURRENT_DATE)`,[id,randomUUID(),GEMINI_MODELS.transcription]);
    await db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','case-followup','legacy-followup',$2,$3,'synthetic',3,CURRENT_DATE)`,[randomUUID(),randomUUID(),GEMINI_MODELS.text]);
    await db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','preparation','legacy-preparation',$2,$3,'synthetic',1,CURRENT_DATE)`,[randomUUID(),randomUUID(),GEMINI_MODELS.text]);
    const before=(await db.query('SELECT * FROM provider_operations')).rows;
    const remaining=(await readdir(source)).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name) && name>='067_').sort();
    assert.deepEqual(await runMigrations(pool),remaining);
    const after=(await db.query('SELECT * FROM provider_operations')).rows;
    assert.ok(after.every(row=>row.preparation_context_json===null));
    assert.deepEqual(after.map(({preparation_context_json,...row})=>row),before);
    assert.equal(before[0].input_hash,null);assert.equal(before[0].provenance_json,null);
    await assert.rejects(db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','recording-transcription','future-recording',$2,$3,'synthetic',4,CURRENT_DATE)`,[randomUUID(),randomUUID(),GEMINI_MODELS.transcription]),/audio_operations_provenance/);
    await assert.rejects(db.query('UPDATE provider_operations SET input_hash=$1 WHERE id=$2',['a'.repeat(64),id]),/immutable/);
    await assert.rejects(db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','case-followup','future-followup',$2,$3,'synthetic',3,CURRENT_DATE)`,[randomUUID(),randomUUID(),GEMINI_MODELS.text]),/followup_operations_provenance/);
    await assert.rejects(db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day)
      VALUES($1,'legacy','preparation','future-preparation',$2,$3,'synthetic',1,CURRENT_DATE)`,[randomUUID(),randomUUID(),GEMINI_MODELS.text]),/preparation_operations_provenance/);
  }finally {
    await db.close();
    const target=resolve(directory),parent=resolve(tmpdir());
    assert.ok(target.startsWith(parent+'\\') || target.startsWith(parent+'/'));
    assert.ok(target.slice(parent.length+1).startsWith('understood-audio-provenance-'));
    await rm(target,{recursive:true,force:true});
  }
});
