import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {compareRestoreInputs} from '../server/postgres/restore-input-lifecycle.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {withBackupSnapshot,quarantineRestoredDatabase,databaseInventory,privateObjectInventory} from '../server/postgres/backup.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
import {exportPrivacyLedger,planPrivacyReconciliation,validatePrivacyLedger} from '../server/postgres/privacy-ledger.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {receiveRecording} from '../server/postgres/recordings.mjs';
import {localAudioStore} from '../server/private-storage.mjs';
import {encodeWav} from '../src/audio.ts';
import {sweepPostgresRestore,restoreRetentionSummary} from '../scripts/postgres-backup.mjs';
import {backupKey,createPrivateDirectory,writeBackupCompletion,decryptBackupBytes} from '../server/backup-files.mjs';

const families=['publications','assignments','submission_receipts','attempts','recordings','source_audio_requests','generated_bundles','generated_audio','case_followups','case_followup_audio','case_voice','clarifications','help_requests','case_messages','case_reviews'];
const empty=()=>Object.fromEntries(families.map(name=>[name,[]]));
const clock='2026-01-01T00:00:00Z',digest='a'.repeat(64);
test('all upload families detect later acceptance, input changes and retained object gaps without promoting cutoff',()=>{
  for(const [family,field] of [['recordings','received_at'],['source_audio_requests','received_at'],['generated_bundles','stored_at'],['case_followups','delivered_at'],['case_voice','received_at']]){
    const source=empty(),target=empty(),row={id:'id',org_id:'org',site_id:'site',[field]:clock};
    if(family==='recordings')source.submission_receipts=[{assignment_id:undefined,submission_id:undefined,org_id:'org',site_id:'site',received_at:clock,kind:'audio'}];
    target.submission_receipts=structuredClone(source.submission_receipts);
    source[family]=[row];target[family]=[{...row,[field]:null}];
    const result=compareRestoreInputs(source,target,[],[]);
    assert.ok(result.gaps.some(gap=>gap.family===family && gap.reason==='accepted_after_backup'));
    assert.equal(result.recoveryRequired,'fresh_stopped_source_backup');assert.equal(result.sourceCutoffEstablished,false);assert.equal(result.activationAllowed,false);
  }
  const source=empty(),target=empty(),object={id:'id',family:'source',org_id:'org',site_id:'site',sha256:digest,bytes:100,format:'wav',retained:true};
  for(const objects of [[],[{...object,retained:false}],[{...object,sha256:'b'.repeat(64)}]])
    assert.equal(compareRestoreInputs(source,target,[object],objects).gaps[0].reason,'accepted_private_object_unavailable');
  source.case_messages=[{id:'message',request_hash:digest}];target.case_messages=[{id:'message',request_hash:'b'.repeat(64)}];
  assert.equal(compareRestoreInputs(source,target,[],[]).gaps[0].reason,'input_identity_changed');
});

test('unbound acceptance is explicit while unchanged abandoned staging can be cleaned',()=>{
  const source=empty(),target=empty();source.recordings=[{id:'staged',received_at:null}];target.recordings=structuredClone(source.recordings);
  assert.equal(compareRestoreInputs(source,target,[],[]).sourceInputsRepresented,true);
  source.recordings[0].received_at=clock;target.recordings[0].received_at=clock;
  assert.equal(compareRestoreInputs(source,target,[],[]).gaps[0].reason,'source_acceptance_unbound');
  const typed={id:'answer',assignment_id:'assignment',submission_id:'submission',org_id:'org',site_id:'site',received_at:clock,input_sha256:digest,result_sha256:digest,redacted:false};
  source.attempts=[typed];target.attempts=[{...typed,result_sha256:'c'.repeat(64)}];
  source.submission_receipts=[{sequence:'9007199254740993',assignment_id:'assignment',submission_id:'submission',org_id:'org',site_id:'site',received_at:clock,kind:'typed'}];
  target.submission_receipts=structuredClone(source.submission_receipts);
  assert.ok(compareRestoreInputs(source,target,[],[]).gaps.some(gap=>gap.reason==='accepted_answer_or_result_changed'));
});

const schema='input_restore_test',hash=value=>createHash('sha256').update(value).digest('hex');
const sourceIdentitySha256=hash('127.0.0.1:5432/source');
function poolFor(db){return {async connect(){return {async query(sql,args){
  if(sql==='SELECT pg_export_snapshot() AS id')return {rows:[{id:'embedded-snapshot-not-native'}]};
  return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};
},release(){}};}};}
async function capture(pool){
  return withBackupSnapshot(pool,{schema,writersStopped:true},async snapshot=>({format:'understood-postgres-private-backup-v1',id:randomUUID(),createdAt:new Date().toISOString(),schema,
    sourceIdentitySha256,toolVersion:16,database:snapshot.database,objects:snapshot.objects,archive:{name:'database.enc',bytes:100,sha256:digest},
    files:snapshot.objects.map((row,index)=>({index,name:`object-${index}.enc`,bytes:row.bytes+36,sha256:digest}))}));
}
test('real post-backup typed/audio acceptance blocks destructive cleanup; fresh physical capture preserves original receipts and bytes',async()=>{
  const db=new PGlite(),pool=poolFor(db),root=await mkdtemp(join(tmpdir(),'understood-input-restore-')),key=backupKey('e8'.repeat(32));
  let older,fresh;try{
    await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
    await db.exec(`INSERT INTO organizations VALUES('org','Synthetic');INSERT INTO sites VALUES('site','org','Synthetic','UTC');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('typed-worker','org','site','Typed','en'),('audio-worker','org','site','Audio','en');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','Synthetic','Synthetic source','ready');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','org','site','brief',1,'{}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('typed','org','site','pub','typed-worker','en'),('audio','org','site','pub','audio-worker','en');
      INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true);`);
    const baseline=await capture(pool);older=new PGlite({loadDataDir:await db.dumpDataDir('none')});await older.exec(`SET search_path TO ${schema},pg_catalog`);
    const oldPool=poolFor(older),sourceStorage=localAudioStore(join(root,'source-audio')),targetStorage=localAudioStore(join(root,'target-audio'));
    const worker=id=>({principal_type:'worker',principal_id:id,org_id:'org',site_id:'site'});
    await submitAnswer(pool,worker('typed-worker'),'typed',randomUUID(),'Synthetic accepted typed answer',{schema});
    const wav=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(0.2)}));
    const accepted=await receiveRecording(pool,worker('audio-worker'),'audio',randomUUID(),wav,sourceStorage,{schema});
    const ledger=await exportPrivacyLedger(pool,baseline,{schema,sourceIdentitySha256,writersStopped:true});
    assert.equal(ledger.tables.submission_receipts.length,2);assert.doesNotMatch(JSON.stringify(ledger),/Synthetic accepted typed answer/);
    for(const change of [row=>{row.sequence='900719925474099312345';},row=>{row.kind='audio';},row=>{row.received_at='2000-01-01T00:00:00Z';},row=>{row.privateText='Forbidden';}]){
      const altered=structuredClone(ledger);change(altered.tables.submission_receipts[0]);assert.throws(()=>validatePrivacyLedger(altered,baseline),/acceptance evidence/);
    }
    const {state:oldState}=await quarantineRestoredDatabase(oldPool,{schema,backupId:baseline.id,expected:baseline});
    oldState.targetIdentitySha256=hash('127.0.0.1:5432/target');
    const oldStateFile=join(root,'old-state.enc');
    const {encryptBackupBytes}=await import('../server/backup-files.mjs');
    await encryptBackupBytes(Buffer.from(JSON.stringify(oldState)),oldStateFile,key,`understood:restore:${baseline.id}:quarantine-state`);
    const plan=await planPrivacyReconciliation(oldPool,baseline,ledger,{isolatedTarget:true,writersStopped:true});
    assert.ok(plan.acceptedInputLifecycle.gaps.some(row=>row.family==='submission_receipts'));assert.ok(plan.acceptedInputLifecycle.gaps.some(row=>row.family==='private_objects'));
    const backupDirectory=await createPrivateDirectory(join(root,'old-backup')),ledgerDirectory=await createPrivateDirectory(join(root,'old-ledger'));
    await writeBackupCompletion(backupDirectory,baseline,key);await writeBackupCompletion(ledgerDirectory,ledger,key);
    let removals=0;const storage={...targetStorage,async remove(){removals++;},async removeOriginal(){removals++;}};
    const args={pool:oldPool,storage,directory:backupDirectory,ledgerDirectory,scratchDirectory:join(root,'blocked-result'),key,stateFile:oldStateFile,stateKind:'quarantine',
      connection:{connectionString:'postgresql://operator:private@127.0.0.1/target'},isolatedTarget:true,writersStopped:true};
    const blocked=await sweepPostgresRestore(args);assert.equal(blocked.stop,'source_input_reconciliation_required');assert.equal(blocked.cycles,0);assert.equal(removals,0);
    const summary=restoreRetentionSummary(blocked);assert.equal(summary.acceptedInputGaps,blocked.acceptedInputLifecycle.gapCount);
    assert.equal('acceptedInputLifecycle' in summary,false);assert.doesNotMatch(JSON.stringify(summary),new RegExp(accepted.id));
    assert.equal((await older.query('SELECT count(*)::int AS n FROM recordings')).rows[0].n,0);
    assert.deepEqual(JSON.parse((await decryptBackupBytes(join(args.scratchDirectory,'retention-result.enc'),key,`understood:restore:${baseline.id}:retention`)).toString()),blocked);
    assert.deepEqual(await sourceStorage.read(ledger.objects.find(row=>row.id===accepted.id)),wav);

    const latest=await capture(pool),latestLedger=await exportPrivacyLedger(pool,latest,{schema,sourceIdentitySha256,writersStopped:true});
    fresh=new PGlite({loadDataDir:await db.dumpDataDir('none')});await fresh.exec(`SET search_path TO ${schema},pg_catalog`);
    const freshPool=poolFor(fresh);
    // Physical embedded restart advances WAL-reserved sequence values. Emulate
    // logical pg_restore's authored setval before asserting the exact inventory.
    for(const sequence of latest.database.sequences)await fresh.query('SELECT setval($1::regclass,$2::bigint,$3)',
      [`${schema}."${sequence.name.replaceAll('"','""')}"`,sequence.value,sequence.is_called]);
    assert.deepEqual(await withTransaction(freshPool,async client=>({database:await databaseInventory(client,schema),objects:await privateObjectInventory(client)})),
      {database:latest.database,objects:latest.objects});
    const freshDirectory=await createPrivateDirectory(join(root,'fresh-backup')),freshLedgerDirectory=await createPrivateDirectory(join(root,'fresh-ledger'));
    await writeBackupCompletion(freshDirectory,latest,key);await writeBackupCompletion(freshLedgerDirectory,latestLedger,key);
    const {state:freshState}=await quarantineRestoredDatabase(freshPool,{schema,backupId:latest.id,expected:latest});
    freshState.targetIdentitySha256=hash('127.0.0.1:5432/target');const freshStateFile=join(root,'fresh-state.enc');
    await encryptBackupBytes(Buffer.from(JSON.stringify(freshState)),freshStateFile,key,`understood:restore:${latest.id}:quarantine-state`);
    const freshArgs={...args,stateFile:freshStateFile,pool:freshPool,storage:targetStorage,directory:freshDirectory,ledgerDirectory:freshLedgerDirectory,scratchDirectory:join(root,'missing-bytes-result')};
    const missingBytes=await sweepPostgresRestore(freshArgs);assert.equal(missingBytes.acceptedInputLifecycle.gapCount,0);assert.equal(missingBytes.unverifiedRetainedObjects,1);assert.equal(missingBytes.cycles,0);
    const corruptBytes=await sweepPostgresRestore({...freshArgs,scratchDirectory:join(root,'corrupt-bytes-result'),storage:{...targetStorage,async read(){return Buffer.alloc(1);}}});
    assert.equal(corruptBytes.unverifiedRetainedObjects,1);assert.equal(corruptBytes.cycles,0);assert.equal(corruptBytes.elapsedPoliciesReconciled,false);
    const ref=latest.objects[0];await targetStorage.save(ref,await sourceStorage.read(ref));
    const recovered=await sweepPostgresRestore({...freshArgs,scratchDirectory:join(root,'recovered-result')});
    assert.equal(recovered.elapsedPoliciesReconciled,true);assert.equal(recovered.acceptedInputLifecycle.sourceInputsRepresented,true);assert.equal(recovered.activationAllowed,false);
    assert.deepEqual((await fresh.query('SELECT sequence::text,received_at,kind FROM submission_receipts ORDER BY sequence')).rows,
      (await db.query('SELECT sequence::text,received_at,kind FROM submission_receipts ORDER BY sequence')).rows);
    assert.equal((await fresh.query('SELECT answer_text FROM attempts')).rows[0].answer_text,'Synthetic accepted typed answer');
    assert.deepEqual(await targetStorage.read(ref),wav);
  }finally{key.fill(0);if(older)await older.close();if(fresh)await fresh.close();await db.close();await rm(root,{recursive:true,force:true});}
});
