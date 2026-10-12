import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {inspectSourceCutoff,sourceCutoffSummary} from '../server/postgres/source-cutoff.mjs';
import {compareSourceSnapshot,validateDatabaseInventory} from '../server/postgres/source-inventory.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
import {databaseInventory,privateObjectInventory,quarantineRestoredDatabase} from '../server/postgres/backup.mjs';
import {planPrivacyReconciliation} from '../server/postgres/privacy-ledger.mjs';
import {createPostgresBackup} from '../scripts/postgres-backup.mjs';
import {createSourceCutoffObservation} from '../scripts/postgres-cutoff.mjs';
import {receiveRecording} from '../server/postgres/recordings.mjs';
import {localAudioStore} from '../server/private-storage.mjs';
import {encodeWav} from '../src/audio.ts';
import {backupKey,readBackupCompletion,decryptBackupBytes} from '../server/backup-files.mjs';
import {configureRuntimePermissions,fenceSourceRuntime} from '../server/postgres/runtime-permissions.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex'),schema='source_cutoff_test',digest='a'.repeat(64);
const connection={connectionString:'postgresql://operator:private@127.0.0.1/source'};
const sourceIdentitySha256=hash('127.0.0.1:5432/source');
test('complete source coverage includes future/quoted tables, precise sequences, all object metadata and definitions in both directions',()=>{
  const database={tables:[{name:'schema_migrations',count:82,sha256:digest},{name:'future"evidence',count:1,sha256:digest}],
    sequences:[{name:'future_sequence',value:'9007199254740993',is_called:true}],definitionsSha256:digest};
  const baseline={database,objects:[{id:'object',retained:true,sha256:digest}]};
  const ledger={sourceInventory:structuredClone(database),objects:structuredClone(baseline.objects)};
  assert.equal(compareSourceSnapshot(baseline,ledger).sourceMatchesBackupAtCapture,true);
  for(const mutate of [value=>{value.sourceInventory.tables[1].sha256='b'.repeat(64);},value=>{value.sourceInventory.tables.pop();},
    value=>{value.sourceInventory.sequences[0].value='9007199254740994';},value=>{value.sourceInventory.sequences[0].is_called=false;},
    value=>{value.sourceInventory.definitionsSha256='c'.repeat(64);},value=>{value.objects[0].retained=false;},value=>{value.objects=[];}]){
    const changed=structuredClone(ledger);mutate(changed);assert.equal(compareSourceSnapshot(baseline,changed).sourceMatchesBackupAtCapture,false);
  }
  const duplicate=structuredClone(database);duplicate.tables.push({...duplicate.tables[0]});assert.throws(()=>validateDatabaseInventory(duplicate),/inventory row/);
  const imprecise=structuredClone(database);imprecise.sequences[0].value=9007199254740993;assert.throws(()=>validateDatabaseInventory(imprecise),/inventory value/);
  const content=structuredClone(database);content.tables[0].body='Private';assert.throws(()=>validateDatabaseInventory(content),/inventory row/);
});

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'understood-source-cutoff-')),db=new PGlite(),key=backupKey('f7'.repeat(32));
  const pool={async connect(){return {async query(sql,args){
    if(sql==='SELECT pg_export_snapshot() AS id')return {rows:[{id:'embedded-not-native-snapshot'}]};
    return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};
  },release(){}};}};
  await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
  await db.exec(`INSERT INTO organizations VALUES('org','Synthetic');INSERT INTO sites VALUES('site','org','Synthetic','UTC');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','org','site','Synthetic','en');
    INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','Synthetic','Synthetic source','ready');
    INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','org','site','brief',1,'{}','published');
    INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','org','site','pub','worker','en');
    INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true);
    CREATE TABLE "future""evidence"(id text PRIMARY KEY,payload jsonb);INSERT INTO "future""evidence" VALUES('original','{"preserved":true}');
    CREATE SEQUENCE future_sequence START 9007199254740993;`);
  const storage=localAudioStore(join(root,'audio'));
  const wav=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(0.2)}));
  await receiveRecording(pool,{principal_type:'worker',principal_id:'worker',org_id:'org',site_id:'site'},'assignment',randomUUID(),wav,storage,{schema});
  const backupDirectory=join(root,'backup'),archive=Buffer.from(await (await db.dumpDataDir('none')).arrayBuffer());
  const runner=async(tool,args,config)=>args[0]==='--version'?`${tool} (PostgreSQL) 18.0\n`:config.consume(Readable.from([archive]));
  await createPostgresBackup({pool,storage,connection,directory:backupDirectory,scratchDirectory:join(root,'backup-scratch'),key,schema,writersStopped:true,runner});
  const baseline=await readBackupCompletion(backupDirectory,key);
  const inventory=()=>withTransaction(pool,async client=>({database:await databaseInventory(client,schema),objects:await privateObjectInventory(client)}));
  return {root,db,pool,key,storage,baseline,backupDirectory,archive,inventory,options:{schema,sourceIdentitySha256,writersStopped:true},
    async close(){key.fill(0);await db.close();await rm(root,{recursive:true,force:true});}};
}

test('locked source observation verifies exact full inventory and private bytes, keeps source read-only and detects later non-submission changes',async()=>{
  const f=await fixture();let target;try{
    const before=await f.inventory();
    const {ledger,report}=await inspectSourceCutoff(f.pool,f.baseline,f.storage,f.options);
    assert.equal(report.cutoffCandidate,true);assert.equal(report.sourceCutoffEstablished,false);assert.equal(report.activationAllowed,false);assert.equal(report.productionReady,false);
    assert.deepEqual(report.privateVerification,{retained:1,retired:0,unverifiedRetained:0,unverifiedRetired:0});assert.equal(report.unboundSourceInputs,0);
    assert.equal(ledger.sourceInventory.sequences.find(row=>row.name==='future_sequence').value,'9007199254740993');
    assert.deepEqual(await f.inventory(),before);
    await f.db.exec(`UPDATE "future""evidence" SET payload='{"later":true}';SELECT nextval('future_sequence');`);
    const later=await inspectSourceCutoff(f.pool,f.baseline,f.storage,f.options);
    assert.equal(later.report.cutoffCandidate,false);assert.ok(later.report.coverage.tables.some(row=>row.key==='future"evidence'));assert.equal(later.report.coverage.sequences.length,1);
    target=new PGlite({loadDataDir:new Blob([f.archive])});await target.exec(`SET search_path TO ${schema},pg_catalog`);
    const targetPool={async connect(){return {async query(sql,args){return args?.length?target.query(sql,args):(await target.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
    await quarantineRestoredDatabase(targetPool,{schema,backupId:f.baseline.id});
    const plan=await planPrivacyReconciliation(targetPool,f.baseline,later.ledger,{isolatedTarget:true,writersStopped:true});
    assert.equal(plan.acceptedInputLifecycle.gapCount,0);assert.deepEqual(plan.conflicts,[]);
    assert.equal(plan.sourceSnapshot.sourceMatchesBackupAtCapture,false);assert.equal(plan.sourceSnapshot.tables.length,1);assert.equal(plan.sourceSnapshot.sequences.length,1);
    const summary=sourceCutoffSummary(later.report);assert.equal(summary.changedTables,1);assert.equal('coverage' in summary,false);assert.doesNotMatch(JSON.stringify(summary),/future/);
    const changed=await f.inventory();await inspectSourceCutoff(f.pool,f.baseline,f.storage,f.options);assert.deepEqual(await f.inventory(),changed);
    await assert.rejects(inspectSourceCutoff(f.pool,f.baseline,f.storage,{...f.options,writersStopped:false}),/stopped/);
    await assert.rejects(inspectSourceCutoff(f.pool,f.baseline,f.storage,{...f.options,sourceIdentitySha256:digest}),/original backup source/);
    await f.db.exec("UPDATE system_controls SET jobs_paused=false WHERE id='global'");
    await assert.rejects(inspectSourceCutoff(f.pool,f.baseline,f.storage,f.options),/Pause jobs/);
  }finally{if(target)await target.close();await f.close();}
});

test('missing/corrupt retained bytes and unknown retired absence cannot promote a source observation',async()=>{
  const f=await fixture();try{
    for(const storage of [{...f.storage,async read(){throw Error('Private detail');}},{...f.storage,async read(){return Buffer.alloc(1);}}]){
      const {report}=await inspectSourceCutoff(f.pool,f.baseline,storage,f.options);
      assert.equal(report.coverage.sourceMatchesBackupAtCapture,true);assert.equal(report.privateVerification.unverifiedRetained,1);assert.equal(report.cutoffCandidate,false);
      assert.doesNotMatch(JSON.stringify(report),/Private detail/);
    }
    const id=randomUUID();await f.db.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status)
      VALUES($1,'org','site','assignment','abandoned',$2,1,100,'storing')`,[id,digest]);
    for(const exists of [async()=>undefined,async()=>true,async()=>{throw Error('Unknown private absence');}]){
      const {report}=await inspectSourceCutoff(f.pool,f.baseline,{...f.storage,exists},f.options);
      assert.equal(report.privateVerification.retired,1);assert.equal(report.privateVerification.unverifiedRetired,1);assert.equal(report.cutoffCandidate,false);
    }
  }finally{await f.close();}
});

test('encrypted source command authenticates backup files, source identity and new output; failures never authorize release',async()=>{
  const f=await fixture();try{
    const args={pool:f.pool,connection,storage:f.storage,backupDirectory:f.backupDirectory,directory:join(f.root,'observation'),key:f.key,writersStopped:true};
    await assert.rejects(createSourceCutoffObservation({...args,writersStopped:false}),/stopped/);
    await assert.rejects(createSourceCutoffObservation({...args,connection:{connectionString:'postgresql://operator:private@127.0.0.1/target'}}),/original backup source/);
    const before=await f.inventory(),summary=await createSourceCutoffObservation(args);
    assert.equal(summary.cutoffCandidate,true);assert.equal(summary.activationAllowed,false);assert.equal('coverage' in summary,false);assert.deepEqual(await f.inventory(),before);
    const ledger=await readBackupCompletion(args.directory,f.key);
    const aad=`understood:source:${f.baseline.id}:cutoff:${ledger.id}`;
    const report=JSON.parse((await decryptBackupBytes(join(args.directory,'source-cutoff.enc'),f.key,aad)).toString());
    assert.deepEqual(sourceCutoffSummary(report),summary);assert.equal(report.ledgerId,ledger.id);
    assert.deepEqual((await readdir(args.directory)).sort(),['manifest.enc','source-cutoff.enc']);
    await assert.rejects(decryptBackupBytes(join(args.directory,'source-cutoff.enc'),f.key,`${aad}:other`),/authentication/);
    await assert.rejects(createSourceCutoffObservation(args),/EEXIST/);
    await f.db.exec(`UPDATE "future""evidence" SET payload='{"later":true}'`);
    const changed=await f.inventory(),laterDirectory=join(f.root,'later-observation');
    const later=await createSourceCutoffObservation({...args,directory:laterDirectory});assert.equal(later.changedTables,1);assert.equal(later.cutoffCandidate,false);
    assert.deepEqual((await readdir(laterDirectory)).sort(),['manifest.enc','source-cutoff.enc']);assert.deepEqual(await f.inventory(),changed);
    const archivePath=join(f.backupDirectory,'database.enc'),bytes=await readFile(archivePath);bytes[25]^=1;await writeFile(archivePath,bytes);
    await assert.rejects(createSourceCutoffObservation({...args,directory:join(f.root,'corrupt-observation')}),/checksum/);
    assert.deepEqual(await f.inventory(),changed);
  }finally{await f.close();}
});

test('authenticated source observation binds explicit live runtime fencing before and after private verification without promoting release',async()=>{
  const f=await fixture();try{
    const role='source_runtime';await f.db.exec(`CREATE ROLE ${role} LOGIN`);
    await configureRuntimePermissions(f.pool,{schema,role,dedicatedDatabase:true,writersStopped:true});
    await assert.rejects(inspectSourceCutoff(f.pool,f.baseline,f.storage,{...f.options,runtimeRoles:[role]}),/not fenced/);
    await fenceSourceRuntime(f.pool,{schema,roles:[role],writersStopped:true});
    const before=await f.inventory(),directory=join(f.root,'fenced-observation');
    const result=await createSourceCutoffObservation({pool:f.pool,connection,storage:f.storage,backupDirectory:f.backupDirectory,directory,key:f.key,writersStopped:true,runtimeRoles:[role]});
    assert.equal(result.cutoffCandidate,true);assert.equal(result.runtimeWriteFenceVerified,true);assert.equal(result.runtimeRoles,1);
    assert.equal(result.sourceCutoffEstablished,false);assert.equal(result.activationAllowed,false);assert.equal(result.productionReady,false);
    const ledger=await readBackupCompletion(directory,f.key),aad=`understood:source:${f.baseline.id}:cutoff:${ledger.id}`;
    const report=JSON.parse((await decryptBackupBytes(join(directory,'source-cutoff.enc'),f.key,aad)).toString());
    assert.deepEqual(report.runtimeWriteFence.roles,[role]);assert.equal(report.sourceIdentitySha256,sourceIdentitySha256);
    assert.deepEqual(await f.inventory(),before);
    const drift={...f.storage,async read(reference){await f.db.exec(`GRANT INSERT ON organizations TO ${role}`);return f.storage.read(reference);}};
    await assert.rejects(inspectSourceCutoff(f.pool,f.baseline,drift,{...f.options,runtimeRoles:[role]}),/not fenced/);
    // The failed read-only observation rolled back the fixture's injected grant.
    const checked=await inspectSourceCutoff(f.pool,f.baseline,f.storage,{...f.options,runtimeRoles:[role]});
    assert.equal(checked.report.runtimeWriteFence.verified,true);assert.deepEqual(await f.inventory(),before);
  }finally{await f.close();}
});
