import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {fixtureState,retryState} from './restore-state-fixture.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
import {databaseInventory,privateObjectInventory,quarantineRestoredDatabase} from '../server/postgres/backup.mjs';
import {exportPrivacyLedger,replayPrivacyDeletions,replayPrivacyPolicies,replayPrivacyRetirements} from '../server/postgres/privacy-ledger.mjs';
import {sweepRestoredRetention} from '../server/postgres/restore-retention.mjs';
import {saveRetention,processOneAudioPurge} from '../server/postgres/retention.mjs';
import {saveTextRetention,processOneTextPurge} from '../server/postgres/text-retention.mjs';
import {saveCaseRetention,processOneCaseContentPurge} from '../server/postgres/case-retention.mjs';
import {saveGeneratedRetention,retireOneGeneratedBundle} from '../server/postgres/generated-retention.mjs';
import {expireGeneratedBundle} from '../server/postgres/generated-audio.mjs';
import {processOneSourceAudioCleanup} from '../server/postgres/source-audio-cleanup.mjs';
import {processOneCaseFollowupPurge} from '../server/postgres/case-followups.mjs';
import {processOneCaseVoicePurge} from '../server/postgres/case-voice.mjs';
import {localAudioStore} from '../server/private-storage.mjs';
import {encodeWav} from '../src/audio.ts';
import {backupKey,createPrivateDirectory,writeBackupCompletion,decryptBackupBytes} from '../server/backup-files.mjs';
import {createPrivacyLedgerExport,replayPrivacyRestoreRetirements} from '../scripts/postgres-privacy.mjs';

const schema='historical_privacy',hash=value=>createHash('sha256').update(value).digest('hex');
const owner={principal_type:'staff',principal_id:'owner',org_id:'org',site_id:'site',role:'owner'};
const sourceIdentitySha256=hash('127.0.0.1:5432/source');
const wav=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(0.2)}));
const original=Buffer.from('Synthetic original');
const inventory=pool=>withTransaction(pool,async client=>({database:await databaseInventory(client,schema),objects:await privateObjectInventory(client)}));
function poolFor(db){let failure='';return {async connect(){return {async query(sql,args){
  if(failure && sql.includes(failure))throw Error('Injected retirement failure');
  if(sql==='SELECT pg_export_snapshot() AS id')return {rows:[{id:'00000001-00000001-1'}]};
  return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};
},release(){}};},fail(value){failure=value;}};}
async function policies(pool,revision,days){
  await saveRetention(pool,owner,{requestId:randomUUID(),revision,audioDays:days??90,confirmed:true},{schema});
  for(const save of [saveTextRetention,saveCaseRetention,saveGeneratedRetention])await save(pool,owner,{requestId:randomUUID(),revision,days,confirmed:true},{schema});
}
async function fixture({currentDays=90}={}){
  const root=await mkdtemp(join(tmpdir(),'understood-historical-privacy-')),source=new PGlite(),pool=poolFor(source);
  const storage=localAudioStore(join(root,'source')),targetStorage=localAudioStore(join(root,'target'));
  let target;
  try{
    await source.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);
    await runMigrations(pool,{schema});
    await source.exec(`INSERT INTO organizations VALUES('org','Synthetic');INSERT INTO sites VALUES('site','org','Synthetic','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','org','site','Synthetic owner','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','org','site','Synthetic worker','en');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','Synthetic','Synthetic source','ready');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','org','site','brief',1,'{"facts":["blue","yellow"]}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','org','site','pub','worker','en');
      INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at) VALUES('job','org','site','brief',1,'prepare','ready',clock_timestamp());
      INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true);`);
    await policies(pool,0,90);
    const ids=Object.fromEntries(['recording','source','original','bundle','generated','followup','voice'].map(name=>[name,randomUUID()])),digest=hash(wav);
    await source.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,received_at,transcript)
      VALUES($1,'org','site','assignment','recorded',$2,1,$3,'received',clock_timestamp()-interval '10 days','Synthetic transcript')`,[ids.recording,digest,wav.length]);
    await source.exec(`INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,received_at,outcome,assessment_status,reasons_json,evidence_json)
      VALUES('answer','org','site','assignment','typed','Synthetic answer',clock_timestamp()-interval '10 days','matched','complete','["synthetic"]','[]');
      INSERT INTO clarifications(id,org_id,site_id,assignment_id,attempt_id,reason,notes,status,created_at)
      VALUES('case','org','site','assignment','answer','Synthetic reason','Synthetic notes','open',clock_timestamp()-interval '10 days');
      INSERT INTO case_messages(id,case_id,org_id,site_id,assignment_id,actor_type,actor_id,language,text,request_hash,created_at)
      VALUES('message','case','org','site','assignment','worker','worker','en','Synthetic message','${digest}',clock_timestamp()-interval '10 days');`);
    await source.query(`INSERT INTO source_audio_requests(request_id,org_id,site_id,requested_by,request_hash,title,id,sha256,bytes,duration_seconds,
      original_id,original_sha256,original_bytes,original_type,authority_json,status,created_at,received_at)
      VALUES('source-request','org','site','owner',$1,'Synthetic source',$2,$1,$3,1,$4,$5,$6,'audio/wav','{}','received',clock_timestamp()-interval '10 days',clock_timestamp()-interval '10 days')`,
      [digest,ids.source,wav.length,ids.original,hash(original),original.length]);
    await source.query(`INSERT INTO generated_bundles(id,org_id,site_id,briefing_id,revision,job_id,job_lease,manifest_json,manifest_hash,dependency_hash,state,stored_at)
      VALUES($1,'org','site','brief',1,'job','synthetic-job','{}',$2,$2,'attached',clock_timestamp()-interval '10 days')`,[ids.bundle,'0'.repeat(64)]);
    await source.query(`INSERT INTO generated_audio(id,bundle_id,org_id,site_id,language,text_hash,sha256,bytes,duration_seconds)
      VALUES($1,$2,'org','site','en',$3,$4,$5,1)`,[ids.generated,ids.bundle,'0'.repeat(64),digest,wav.length]);
    await source.query(`INSERT INTO case_followups(id,org_id,site_id,case_id,assignment_id,publication_id,actor_id,actor_role,language,source_text,request_hash,
      glossary_json,status,lease_token,lease_until,created_at) VALUES('followup','org','site','case','assignment','pub','owner','owner','en','Synthetic reply',$1,'{}',
      'processing','synthetic-followup',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '10 days')`,[digest]);
    await source.query(`INSERT INTO case_followup_audio(id,request_id,org_id,site_id,job_lease,language,text_hash,sha256,bytes,duration_seconds,state,created_at)
      VALUES($1,'followup','org','site','synthetic-followup','en',$2,$2,$3,1,'storing',clock_timestamp()-interval '10 days')`,[ids.followup,digest,wav.length]);
    await source.exec("UPDATE case_followups SET status='delivered',delivered_at=clock_timestamp()-interval '10 days',manifest_json='{}',lease_token=NULL,lease_until=NULL WHERE id='followup';UPDATE case_followup_audio SET state='attached' WHERE request_id='followup'");
    await source.query(`INSERT INTO case_voice(id,request_id,org_id,site_id,assignment_id,worker_id,kind,requested_case_id,language,sha256,bytes,duration_seconds,status,lease_token,lease_until,created_at)
      VALUES($1,'voice','org','site','assignment','worker','reply','case','en',$2,$3,1,'storing','voice-lease',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '10 days')`,[ids.voice,digest,wav.length]);
    await source.query(`INSERT INTO case_messages(id,case_id,org_id,site_id,assignment_id,actor_type,actor_id,language,text,request_hash,created_at)
      VALUES('voice','case','org','site','assignment','worker','worker','en','[Voice message]',$1,clock_timestamp()-interval '10 days')`,[digest]);
    await source.exec("UPDATE case_voice SET status='received',case_id='case',received_at=clock_timestamp()-interval '10 days',lease_token=NULL,lease_until=NULL WHERE request_id='voice'");
    const baselineInventory=await inventory(pool);
    assert.equal(baselineInventory.objects.length,6);assert.ok(baselineInventory.objects.every(row=>row.retained));
    for(const ref of baselineInventory.objects)for(const store of [storage,targetStorage]){
      if(ref.format==='original')await store.saveOriginal(ref,original);else await store.save(ref,wav);
    }
    const baseline={format:'understood-postgres-private-backup-v1',id:randomUUID(),createdAt:new Date().toISOString(),schema,toolVersion:16,
      sourceIdentitySha256,...baselineInventory,archive:{name:'database.enc',bytes:100,sha256:'b'.repeat(64)},
      files:baselineInventory.objects.map((ref,index)=>({index,name:`object-${index}.enc`,bytes:ref.bytes+36,sha256:'c'.repeat(64)}))};
    target=new PGlite({loadDataDir:await source.dumpDataDir('none')});const targetPool=poolFor(target);
    await target.exec(`SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);
    await policies(pool,1,7);
    // Authored past-resolution input only. Production replay never bypasses this clock.
    await source.exec('ALTER TABLE clarifications DISABLE TRIGGER case_resolution_clock');
    await source.exec("UPDATE clarifications SET status='resolved',resolved_at=clock_timestamp()-interval '10 days' WHERE id='case'");
    await source.exec('ALTER TABLE clarifications ENABLE TRIGGER case_resolution_clock');
    await processOneTextPurge(pool,{schema,kind:'attempt'});await processOneTextPurge(pool,{schema,kind:'recording'});
    await processOneCaseContentPurge(pool,{schema});await retireOneGeneratedBundle(pool,{schema});
    await expireGeneratedBundle(pool,storage,{schema});await processOneAudioPurge(pool,storage,{schema});
    await processOneSourceAudioCleanup(pool,storage,{schema});await processOneCaseFollowupPurge(pool,storage,{schema});await processOneCaseVoicePurge(pool,storage,{schema});
    assert.equal(await storage.isEmpty(),true,'all source bytes actually removed before policy extension');
    await policies(pool,2,currentDays);
    const ledger=await exportPrivacyLedger(pool,baseline,{schema,sourceIdentitySha256,writersStopped:true});
    await quarantineRestoredDatabase(targetPool,{schema,backupId:baseline.id});
    const options={isolatedTarget:true,writersStopped:true};
    return {root,source,pool,storage,target,targetPool,targetStorage,ids,baseline,ledger,options,
      async decisions(){await replayPrivacyDeletions(targetPool,baseline,ledger,options);await replayPrivacyPolicies(targetPool,baseline,ledger,options);},
      async close(){await target.close();await source.close();await rm(root,{recursive:true,force:true});}};
  }catch(error){if(target)await target.close();await source.close();await rm(root,{recursive:true,force:true});throw error;}
}

test('historical retirement restores original short-policy erasure across all six byte families without changing current policies, outcomes or case clock',async()=>{
  const f=await fixture();try{
    const sourceBefore=await inventory(f.pool),publication=(await f.target.query('SELECT * FROM publications')).rows,
      assignments=(await f.target.query('SELECT * FROM assignments')).rows,caseClock=(await f.target.query('SELECT status,resolved_at,created_at,attempt_id FROM clarifications')).rows;
    await f.decisions();const result=await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options);
    assert.equal(result.journaled,8);assert.equal(result.textRetirements,2);assert.equal(result.caseRetirements,1);assert.equal(result.generatedRetirements,1);assert.equal(result.queuedAudio,4);
    assert.equal(result.activationAllowed,false);assert.equal(result.authoritativeReconciliationComplete,false);assert.equal(result.productionReady,false);
    assert.deepEqual((await f.target.query('SELECT * FROM publications')).rows,publication);assert.deepEqual((await f.target.query('SELECT * FROM assignments')).rows,assignments);
    assert.deepEqual((await f.target.query('SELECT status,resolved_at,created_at,attempt_id FROM clarifications')).rows,caseClock);
    assert.deepEqual((await f.target.query('SELECT answer_text,outcome FROM attempts')).rows,[{answer_text:'[Expired]',outcome:'matched'}]);
    assert.equal((await f.target.query('SELECT transcript FROM recordings')).rows[0].transcript,null);
    assert.equal((await f.target.query('SELECT reason,notes FROM clarifications')).rows[0].reason,'[Expired]');
    assert.equal((await f.target.query('SELECT source_text FROM case_followups')).rows[0].source_text,'[Expired]');
    for(const table of ['text_retention_policies','case_retention_policies','generated_retention_policies'])assert.equal((await f.target.query(`SELECT days FROM ${table}`)).rows[0].days,90);
    const proof=(await f.target.query("SELECT * FROM restore_privacy_retirements WHERE kind='case-content'")).rows[0];
    assert.equal(proof.source_identity_json.status,'resolved');assert.ok(Date.parse(proof.source_identity_json.resolved_at)<Date.parse(f.baseline.createdAt));
    assert.equal(proof.source_policy_json.request_json.days,7);assert.equal(proof.source_policy_json.revision,2);
    assert.equal((await f.target.query('SELECT completed_at FROM case_content_purges')).rows[0].completed_at>=proof.imported_at,true);
    assert.equal((await f.target.query('SELECT status,completed_at FROM recording_purges')).rows[0].status,'queued');
    assert.equal((await f.target.query('SELECT status,completed_at FROM recording_purges')).rows[0].completed_at,null);
    assert.equal((await f.target.query('SELECT status FROM source_audio_purges')).rows[0].status,'queued');
    for(const ref of f.baseline.objects)assert.equal(ref.format==='original'?await f.targetStorage.existsOriginal(ref):await f.targetStorage.exists(ref),true,'replay queues byte removal rather than fabricating absence');
    const afterReplay=await inventory(f.targetPool);
    assert.equal((await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options)).duplicate,true);assert.deepEqual(await inventory(f.targetPool),afterReplay);
    const sweep=await sweepRestoredRetention(f.targetPool,f.targetStorage,{schema,backupId:f.baseline.id,...f.options});
    assert.equal(sweep.stop,'reconciled');assert.equal(sweep.retiredObjects,6);assert.equal(sweep.activationAllowed,false);assert.equal(await f.targetStorage.isEmpty(),true);
    assert.deepEqual(await inventory(f.pool),sourceBefore);
    assert.equal((await f.target.query("SELECT count(*)::int AS n FROM audit WHERE action='backup.restore.privacy.retirements'")).rows[0].n,1);
  }finally{await f.close();}
});

test('explicit current policy disable cannot resurrect retired text or audio and failed physical cleanup never releases the restored target',async()=>{
  const f=await fixture({currentDays:null});try{
    await f.decisions();await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options);
    assert.equal((await f.target.query('SELECT days FROM text_retention_policies')).rows[0].days,null);
    const failed={...f.targetStorage,async remove(){},async removeOriginal(){}};
    const sweep=await sweepRestoredRetention(f.targetPool,failed,{schema,backupId:f.baseline.id,...f.options,maxCycles:1});
    assert.equal(sweep.elapsedPoliciesReconciled,false);assert.equal(sweep.activationAllowed,false);assert.ok(sweep.unverifiedObjects>0);
    assert.equal((await f.target.query('SELECT status FROM recording_purges')).rows[0].status,'queued');
    assert.equal((await f.target.query('SELECT completed_at FROM recording_purges')).rows[0].completed_at,null);
    assert.equal((await f.target.query('SELECT answer_text FROM attempts')).rows[0].answer_text,'[Expired]');
  }finally{await f.close();}
});

test('a later backup of a quarantined restore carries original case-resolution provenance without inventing a resolution in either target',async()=>{
  const f=await fixture();let second;
  try{
    await f.decisions();
    const laterBaseline={...f.baseline,id:randomUUID(),createdAt:new Date().toISOString(),...await inventory(f.targetPool)};
    second=new PGlite({loadDataDir:await f.target.dumpDataDir('none')});const secondPool=poolFor(second);
    await second.exec(`SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);
    const clock=(await second.query('SELECT status,resolved_at,created_at,attempt_id FROM clarifications')).rows;
    await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options);
    const laterLedger=await exportPrivacyLedger(f.targetPool,laterBaseline,{schema,sourceIdentitySha256,writersStopped:true});
    assert.equal(laterLedger.tables.clarifications[0].status,'open');assert.equal(laterLedger.tables.clarifications[0].resolved_at,null);
    assert.equal(laterLedger.tables.restore_privacy_retirements.find(row=>row.kind==='case-content').source_identity_json.status,'resolved');
    await quarantineRestoredDatabase(secondPool,{schema,backupId:laterBaseline.id});
    await replayPrivacyDeletions(secondPool,laterBaseline,laterLedger,f.options);await replayPrivacyPolicies(secondPool,laterBaseline,laterLedger,f.options);
    const result=await replayPrivacyRetirements(secondPool,laterBaseline,laterLedger,f.options);
    assert.equal(result.caseRetirements,1);assert.equal(result.journaled,8);assert.equal(result.activationAllowed,false);
    assert.deepEqual((await second.query('SELECT status,resolved_at,created_at,attempt_id FROM clarifications')).rows,clock);
    const root=f.ledger.tables.clarifications[0].resolved_at;
    assert.equal((await second.query("SELECT source_identity_json FROM restore_privacy_retirements WHERE kind='case-content'")).rows[0].source_identity_json.resolved_at,root);
    assert.equal((await second.query('SELECT reason FROM clarifications')).rows[0].reason,'[Expired]');
  }finally{if(second)await second.close();await f.close();}
});

test('missing original decisions, invalid original cutoff and audit failure roll back historical proof, redaction and cleanup queues atomically',async()=>{
  const f=await fixture();try{
    await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options),/original deletion and policy decisions/);
    await f.decisions();const before=await inventory(f.targetPool);
    f.targetPool.fail('INSERT INTO audit');await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options),/Injected/);f.targetPool.fail('');
    assert.deepEqual(await inventory(f.targetPool),before);
    const future=structuredClone(f.ledger);future.tables.case_content_purges[0].completed_at='2100-01-01T00:00:00+00:00';
    await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,future,f.options),/original policy evidence/);
    assert.deepEqual(await inventory(f.targetPool),before);
    const changed=structuredClone(f.ledger);changed.tables.generated_bundles[0].manifest_hash='f'.repeat(64);
    await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,changed,f.options),/conflicts/);
    assert.deepEqual(await inventory(f.targetPool),before);
    await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options);
    const accepted=await inventory(f.targetPool),altered=structuredClone(f.ledger);altered.tables.generated_retention_policies[0].updated_at=f.baseline.createdAt;
    await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,altered,f.options),/conflicts|ledger receipt conflict/);
    assert.deepEqual(await inventory(f.targetPool),accepted);
  }finally{await f.close();}
});

test('historical proof remains immutable and cannot authorize erasure outside original quarantine or rewrite an honest case resolution clock',async()=>{
  const f=await fixture();try{
    await f.decisions();await replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options);
    await assert.rejects(f.target.exec("UPDATE restore_privacy_retirements SET source_receipt_json='{}'"),/immutable/);
    await assert.rejects(f.target.exec('DELETE FROM restore_privacy_retirements'),/immutable/);
    await assert.rejects(f.target.exec("UPDATE clarifications SET resolved_at=clock_timestamp()-interval '10 days' WHERE id='case'"),/clock|resolution/i);
    await f.target.exec("UPDATE system_controls SET provider_paused=false WHERE id='global'");
    await assert.rejects(replayPrivacyRetirements(f.targetPool,f.baseline,f.ledger,f.options),/quarantine/);
    const proof=(await f.target.query("SELECT * FROM restore_privacy_retirements WHERE kind='case-content'")).rows[0];
    await assert.rejects(f.target.query(`INSERT INTO restore_privacy_retirements(kind,reference_id,org_id,site_id,backup_id,ledger_id,ledger_fingerprint,
      source_identity_json,source_receipt_json,source_policy_json,source_captured_at) VALUES('case-content','other','org','site',$1,$2,$3,$4,$5,$6,$7)`,
      [proof.backup_id,proof.ledger_id,proof.ledger_fingerprint,JSON.stringify(proof.source_identity_json),JSON.stringify(proof.source_receipt_json),JSON.stringify(proof.source_policy_json),proof.source_captured_at]),/quarantine/);
  }finally{await f.close();}
});

test('encrypted historical replay requires original-source ledger, confirmed distinct stopped target, fresh output and exact retry receipt',async()=>{
  const f=await fixture(),key=backupKey('e3'.repeat(32));try{
    const backupDirectory=await createPrivateDirectory(join(f.root,'backup'));await writeBackupCompletion(backupDirectory,f.baseline,key);
    const ledgerDirectory=join(f.root,'ledger');await createPrivacyLedgerExport({pool:f.pool,connection:{connectionString:'postgresql://operator:private@127.0.0.1/source'},
      backupDirectory,directory:ledgerDirectory,key,writersStopped:true});
    // This distinct export has its own exact receipt identity; replay its decisions first.
    const {readBackupCompletion}=await import('../server/backup-files.mjs');
    const ledger=await readBackupCompletion(ledgerDirectory,key);
    await replayPrivacyDeletions(f.targetPool,f.baseline,ledger,f.options);await replayPrivacyPolicies(f.targetPool,f.baseline,ledger,f.options);
    const args={...await fixtureState(f,key),pool:f.targetPool,connection:{connectionString:'postgresql://operator:private@127.0.0.1/restored'},backupDirectory,ledgerDirectory,
      directory:join(f.root,'result'),key,...f.options,confirmed:true};
    await assert.rejects(replayPrivacyRestoreRetirements({...args,confirmed:false}),/confirmed/);
    await assert.rejects(replayPrivacyRestoreRetirements({...args,writersStopped:false}),/stopped/);
    await assert.rejects(replayPrivacyRestoreRetirements({...args,connection:{connectionString:'postgresql://operator:private@127.0.0.1/source'}}),/source database/);
    const result=await replayPrivacyRestoreRetirements(args);
    const purpose=`understood:restore:${f.baseline.id}:privacy-retirements:${ledger.id}`;
    const saved=JSON.parse((await decryptBackupBytes(join(args.directory,'privacy-retirements.enc'),key,purpose)).toString('utf8'));
    assert.deepEqual(saved,result);assert.equal(saved.activationAllowed,false);
    await assert.rejects(decryptBackupBytes(join(args.directory,'privacy-retirements.enc'),key,`${purpose}:wrong`),/authentication/);
    await assert.rejects(replayPrivacyRestoreRetirements(args),/EEXIST/);
    const before=await inventory(f.targetPool);
    assert.equal((await replayPrivacyRestoreRetirements({...args,...retryState(args.directory),directory:join(f.root,'retry')})).duplicate,true);
    assert.deepEqual(await inventory(f.targetPool),before);
  }finally{key.fill(0);await f.close();}
});
