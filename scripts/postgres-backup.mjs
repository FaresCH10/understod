import {createHash,randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresPool,withTransaction} from '../server/postgres/db.mjs';
import {schemaName,verifyMigrations} from '../server/postgres/migrate.mjs';
import {withBackupSnapshot,verifyRestoredInventory,quarantineRestoredDatabase} from '../server/postgres/backup.mjs';
import {postgresBackupConnection,nativeBackupSession,nativeBackupVersion,runNativePostgres} from '../server/postgres/backup-native.mjs';
import {sweepRestoredRetention,restoredRetentionState,requireQuarantine} from '../server/postgres/restore-retention.mjs';
import {createRestoreCleanupAccounting,inspectRestoreCleanupPredecessor,validCleanupAdmission} from '../server/postgres/restore-cleanup-accounting.mjs';
import {restoreStateHash} from '../server/postgres/restore-replay-state.mjs';
import {readRestoreReplayPredecessor} from './postgres-privacy.mjs';
import {validatePrivacyLedger,planPrivacyReconciliation} from '../server/postgres/privacy-ledger.mjs';
import {backupKey,createPrivateDirectory,encryptBackupStream,encryptBackupBytes,decryptBackupFile,decryptBackupBytes,
  fileSha256,regularBackupFile,writeBackupCompletion,readBackupCompletion,safeBackupPath} from '../server/backup-files.mjs';
import {localAudioStore,r2AudioStore} from '../server/private-storage.mjs';

const FORMAT='understood-postgres-private-backup-v1',sha=value=>createHash('sha256').update(value).digest('hex');
const archiveAAD=id=>`understood:backup:${id}:database`;
const objectAAD=(id,index)=>`understood:backup:${id}:object:${index}`;

export function validatePostgresBackup(manifest) {
  if(manifest?.format!==FORMAT || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manifest.id)
    || !Number.isFinite(Date.parse(manifest.createdAt)) || !/^[a-f0-9]{64}$/.test(manifest.sourceIdentitySha256)
    || !Number.isInteger(manifest.toolVersion) || manifest.toolVersion<16 || !manifest.database
    || !Array.isArray(manifest.database.tables) || manifest.database.tables.length<1 || manifest.database.tables.length>10000
    || !Array.isArray(manifest.database.sequences) || !/^[a-f0-9]{64}$/.test(manifest.database.definitionsSha256)
    || !Array.isArray(manifest.objects) || manifest.objects.length>50000 || !Array.isArray(manifest.files))throw Error('Invalid PostgreSQL backup manifest');
  schemaName(manifest.schema);
  const tables=new Set();
  for(const row of manifest.database.tables){
    if(typeof row.name!=='string' || !row.name.length || tables.has(row.name) || !Number.isSafeInteger(row.count) || row.count<0
      || !/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Invalid database backup inventory');
    tables.add(row.name);
  }
  if(!tables.has('schema_migrations'))throw Error('Backup migration ledger is missing');
  const ids=new Set();
  for(const row of manifest.objects){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
      || !['recording','source','source-original','generated','case-followup','case-voice'].includes(row.family)
      || ![row.org_id,row.site_id].every(value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value))
      || !['wav','original'].includes(row.format) || (row.family==='source-original')!==(row.format==='original')
      || typeof row.retained!=='boolean' || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isInteger(row.bytes)
      || row.bytes<1 || row.bytes>(row.format==='original'?10485760:2880044) || ids.has(row.id.toLowerCase()))throw Error('Invalid private backup inventory');
    ids.add(row.id.toLowerCase());
  }
  const expected=manifest.objects.map((row,index)=>row.retained?index:null).filter(index=>index!==null);
  if(manifest.files.length!==expected.length)throw Error('Backup object coverage mismatch');
  for(let i=0;i<expected.length;i++) {
    const file=manifest.files[i],index=expected[i];
    if(file.index!==index || file.name!==`object-${index}.enc` || !Number.isSafeInteger(file.bytes) || file.bytes!==manifest.objects[index].bytes+36
      || !/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid encrypted object coverage');
  }
  if(manifest.archive?.name!=='database.enc' || !Number.isSafeInteger(manifest.archive.bytes) || manifest.archive.bytes<=36
    || !/^[a-f0-9]{64}$/.test(manifest.archive.sha256))throw Error('Invalid encrypted database archive');
  return manifest;
}

export async function verifyEncryptedBackupFiles(directory,manifest) {
  for(const file of [manifest.archive,...manifest.files]) {
    const path=join(directory,file.name),info=await regularBackupFile(path,{maxBytes:file.bytes});
    if(info.bytes!==file.bytes || await fileSha256(path)!==file.sha256)throw Error('Encrypted backup checksum mismatch');
  }
}

export async function createPostgresBackup({pool,storage,directory,scratchDirectory,key,connection,schema='public',writersStopped=false,
  dumpTool='pg_dump',runner=runNativePostgres}) {
  if(writersStopped!==true)throw Error('Backup requires all writers and cleanup workers stopped');
  await verifyMigrations(pool,{schema});
  const target=await createPrivateDirectory(directory),scratch=await createPrivateDirectory(scratchDirectory);
  let native;
  try {
    native=await nativeBackupSession(connection,scratch);
    const toolVersion=await nativeBackupVersion(dumpTool,{env:native.env,runner});
    const id=randomUUID();
    const manifest=await withBackupSnapshot(pool,{schema,writersStopped},async inventory=>{
      const archive=await runner(dumpTool,['--format=custom',`--schema=${schema}`,'--no-acl','--no-password',
        '--lock-wait-timeout=5s',`--snapshot=${inventory.snapshot}`],{env:native.env,
        consume:stream=>encryptBackupStream(stream,join(target,'database.enc'),key,archiveAAD(id))});
      const files=[];
      for(let index=0;index<inventory.objects.length;index++) {
        const row=inventory.objects[index];if(!row.retained)continue;
        const bytes=await (row.format==='original'?storage.readOriginal(row):storage.read(row));
        if(bytes.length!==row.bytes || sha(bytes)!==row.sha256)throw Error('Private backup object integrity failed');
        const name=`object-${index}.enc`,file=await encryptBackupBytes(bytes,join(target,name),key,objectAAD(id,index));
        files.push({index,name,...file});
      }
      return {format:FORMAT,id,createdAt:new Date().toISOString(),schema,toolVersion,sourceIdentitySha256:sha(native.identity),
        database:inventory.database,objects:inventory.objects,archive:{name:'database.enc',...archive},files};
    });
    validatePostgresBackup(manifest);
    await verifyEncryptedBackupFiles(target,manifest);
    await writeBackupCompletion(target,manifest,key);
    return {id:manifest.id,complete:true,tables:manifest.database.tables.length,objects:manifest.files.length,encrypted:true};
  }finally {if(native)await native.close();}
}

async function requireEmptyRestoreDatabase(pool,schema) {
  await withTransaction(pool,async client=>{
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`understood:migrations:${schema}`]);
    const count=(await client.query(`SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')+
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')+
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS n`)).rows[0].n;
    if(Number(count)!==0)throw Error('Restore requires a new empty isolated database');
    if((await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rows.length)
      await client.query(`DROP SCHEMA "${schema}"`);
  });
}

export async function restorePostgresBackup({pool,storage,directory,scratchDirectory,key,connection,isolatedTarget=false,trustedArchive=false,
  restoreTool='pg_restore',runner=runNativePostgres}) {
  if(isolatedTarget!==true || trustedArchive!==true)throw Error('Restore requires explicit isolated-target and trusted-archive confirmation');
  const source=await safeBackupPath(directory),scratch=await createPrivateDirectory(scratchDirectory);
  const manifest=validatePostgresBackup(await readBackupCompletion(source,key));
  await verifyEncryptedBackupFiles(source,manifest);
  if(typeof storage.isEmpty!=='function' || await storage.isEmpty()!==true)throw Error('Restore requires an empty isolated private storage namespace');
  let native,archivePath;
  try {
    native=await nativeBackupSession(connection,scratch);
    if(sha(native.identity)===manifest.sourceIdentitySha256)throw Error('Restore must not target the source database');
    const toolVersion=await nativeBackupVersion(restoreTool,{env:native.env,runner});
    if(toolVersion<manifest.toolVersion)throw Error('Restore tool must not be older than the backup tool');
    // Authenticate the entire archive before allowing its SQL to execute.
    archivePath=await decryptBackupFile(join(source,'database.enc'),join(scratch,'database.pgdump'),key,archiveAAD(manifest.id));
    await requireEmptyRestoreDatabase(pool,manifest.schema);
    await runner(restoreTool,['--single-transaction','--exit-on-error','--no-owner','--no-acl','--no-password',
      `--dbname=${native.env.PGDATABASE}`,archivePath],{env:native.env,maxOutputBytes:1024});
    await verifyMigrations(pool,{schema:manifest.schema});
    const inventory=await verifyRestoredInventory(pool,manifest,{schema:manifest.schema});
    const {state,...quarantine}=await quarantineRestoredDatabase(pool,{schema:manifest.schema,backupId:manifest.id,expected:manifest});
    for(const file of manifest.files) {
      const row=manifest.objects[file.index],bytes=await decryptBackupBytes(join(source,file.name),key,objectAAD(manifest.id,file.index),{maxBytes:row.bytes});
      if(bytes.length!==row.bytes || sha(bytes)!==row.sha256)throw Error('Restored private object integrity failed');
      if(row.format==='original')await storage.saveOriginal(row,bytes);else await storage.save(row,bytes);
      const readback=await (row.format==='original'?storage.readOriginal(row):storage.read(row));
      if(readback.length!==row.bytes || sha(readback)!==row.sha256)throw Error('Restored private object readback failed');
    }
    for(const row of manifest.objects.filter(row=>!row.retained)) {
      const exists=await (row.format==='original'?storage.existsOriginal(row):storage.exists(row));
      if(exists!==false)throw Error('Retired private object must remain absent after restore');
    }
    await verifyRestoredInventory(pool,state,{schema:manifest.schema});
    const targetState={...state,targetIdentitySha256:sha(native.identity)};
    await encryptBackupBytes(Buffer.from(JSON.stringify(targetState)),join(scratch,'quarantine-state.enc'),key,`understood:restore:${manifest.id}:quarantine-state`);
    const report={backupId:manifest.id,...inventory,...quarantine,objectReadbackVerified:true,quarantineStateSha256:sha(JSON.stringify(targetState)),
      privacyReconciliationRequired:true,productionReady:false};
    await encryptBackupBytes(Buffer.from(JSON.stringify(report)),join(scratch,'restore-result.enc'),key,`understood:restore:${manifest.id}:result`);
    return report;
  }finally {if(archivePath)await unlink(archivePath);if(native)await native.close();}
}

export async function sweepPostgresRestore({pool,storage,directory,ledgerDirectory,scratchDirectory,key,connection,stateFile,stateKind,isolatedTarget=false,writersStopped=false,maxCycles=100,maxMilliseconds=120000}){
  if(isolatedTarget!==true || writersStopped!==true)throw Error('Restore retention requires stopped writers and an isolated target');
  const source=await safeBackupPath(directory),manifest=validatePostgresBackup(await readBackupCompletion(source,key));
  const target=postgresBackupConnection(connection);
  if(sha(`${target.host.toLowerCase()}:${target.port}/${target.database}`)===manifest.sourceIdentitySha256)throw Error('Restore retention must not target the source database');
  if(!ledgerDirectory)throw Error('Restore retention requires a stopped-source acceptance/privacy ledger');
  const ledger=validatePrivacyLedger(await readBackupCompletion(await safeBackupPath(ledgerDirectory),key),manifest);
  const targetIdentitySha256=sha(`${target.host.toLowerCase()}:${target.port}/${target.database}`);
  const predecessor=await readRestoreReplayPredecessor({stateFile,stateKind,baseline:manifest,connection,key});
  const scratch=await createPrivateDirectory(scratchDirectory);
  await inspectRestoreCleanupPredecessor({pool,storage,baseline:manifest,predecessor,targetIdentitySha256,requireQuarantine});
  const sourcePlan=await planPrivacyReconciliation(pool,manifest,ledger,{isolatedTarget,writersStopped});
  const initial=await restoredRetentionState(pool,storage,{schema:manifest.schema,backupId:manifest.id});
  const accounted=predecessor.format==='understood-restore-cleanup-state-v1' && predecessor.immutableInputsVerified===true
    && validCleanupAdmission(predecessor.admission,{baseline:manifest,ledger,targetIdentitySha256});
  const cleanupGapReasons=['accepted_answer_or_result_changed','accepted_transcript_changed','accepted_private_object_unavailable'];
  const unaccountedInputGaps=sourcePlan.acceptedInputLifecycle.gaps.filter(gap=>!accounted || !cleanupGapReasons.includes(gap.reason));
  const blocked=sourcePlan.conflicts.length>0 || !accounted && !sourcePlan.acceptedInputLifecycle.sourceInputsRepresented
    || unaccountedInputGaps.length>0 || initial.unverifiedRetainedObjects>0;
  const admission=accounted?predecessor.admission:{format:'understood-restore-cleanup-admission-v1',backupId:manifest.id,targetIdentitySha256,
    ledgerId:ledger.id,ledgerFingerprint:sourcePlan.ledgerFingerprint,predecessorStateSha256:restoreStateHash(predecessor),
    sourceInputComparisonSha256:restoreStateHash(sourcePlan.acceptedInputLifecycle),sourceInputsRepresented:true,sourceConflicts:0,retainedBytesVerified:true};
  const result=blocked?{...initial,elapsedPoliciesReconciled:false,stop:'source_input_reconciliation_required',cycles:0,work:{},failedStages:[],
    limitation:'No cleanup was attempted. Recover missing or changed accepted input through a fresh stopped-source database/private-object backup; verify retained bytes.'}:
    await sweepRestoredRetention(pool,storage,{schema:manifest.schema,backupId:manifest.id,isolatedTarget,writersStopped,maxCycles,maxMilliseconds,
      accountingFactory:()=>createRestoreCleanupAccounting({pool,storage,baseline:manifest,ledger,predecessor,targetIdentitySha256,requireQuarantine,admission,
        persist:({sequence,kind,value})=>{
          if(sequence>100000)throw Error('Cleanup event bound exceeded');
          return encryptBackupBytes(Buffer.from(JSON.stringify(value)),join(scratch,`cleanup-${String(sequence).padStart(6,'0')}-${kind}.enc`),key,
            `understood:restore:${manifest.id}:cleanup-${kind}`);
        }})});
  const report={format:'understood-restore-elapsed-retention-v3',backupId:manifest.id,ledgerId:ledger.id,ledgerFingerprint:sourcePlan.ledgerFingerprint,
    acceptedInputLifecycle:sourcePlan.acceptedInputLifecycle,unaccountedInputGapCount:unaccountedInputGaps.length,
    accountedCleanupInputChanges:sourcePlan.acceptedInputLifecycle.gapCount-unaccountedInputGaps.length,
    sourceConflicts:sourcePlan.conflicts.length,checkedAt:new Date().toISOString(),...result};
  await encryptBackupBytes(Buffer.from(JSON.stringify(report)),join(scratch,'retention-result.enc'),key,`understood:restore:${manifest.id}:retention`);
  return report;
}

export const restoreRetentionSummary=result=>({format:result.format,backupId:result.backupId,ledgerId:result.ledgerId,checkedAt:result.checkedAt,
  stop:result.stop,cycles:result.cycles,elapsedPoliciesReconciled:result.elapsedPoliciesReconciled,pendingCount:result.pendingCount,
  unverifiedObjects:result.unverifiedObjects,unverifiedRetainedObjects:result.unverifiedRetainedObjects,sourceConflicts:result.sourceConflicts,
  acceptedInputGaps:result.acceptedInputLifecycle.gapCount,sourceInputsRepresented:result.acceptedInputLifecycle.sourceInputsRepresented,
  unaccountedInputGapCount:result.unaccountedInputGapCount,accountedCleanupInputChanges:result.accountedCleanupInputChanges,accountedEvents:result.accountedEvents,
  activationAllowed:false,productionReady:false});

function connectionConfig(prefix) {
  return {connectionString:process.env[`${prefix}_POSTGRES_URL`],tls:process.env[`${prefix}_POSTGRES_TLS`]==='true',caFile:process.env[`${prefix}_POSTGRES_CA_FILE`]};
}

export async function postgresBackupStorage(prefix,{restore=false}={}) {
  const mode=process.env[`${prefix}_BACKUP_STORAGE`];
  if(mode==='local') {
    const root=process.env[`${prefix}_AUDIO_ROOT`];if(!root)throw Error('Explicit private audio root is required');
    const path=await safeBackupPath(root);
    if(restore)await createPrivateDirectory(path);
    return localAudioStore(path);
  }
  if(mode==='r2')return r2AudioStore({accountId:process.env[`${prefix}_R2_ACCOUNT_ID`],bucket:process.env[`${prefix}_R2_BUCKET`],
    jurisdiction:process.env[`${prefix}_R2_JURISDICTION`],accessKeyId:process.env[`${prefix}_R2_ACCESS_KEY_ID`],secretAccessKey:process.env[`${prefix}_R2_SECRET_ACCESS_KEY`]});
  throw Error('Select explicit local or R2 private backup storage');
}

async function main() {
  const [mode,directory,scratchDirectory,...flags]=process.argv.slice(2);
  const ledgerFlag=flags.find(flag=>flag.startsWith('--ledger='));
  const ledgerDirectory=ledgerFlag?.slice('--ledger='.length);
  const stateFlag=flags.find(flag=>flag.startsWith('--state-file=')),kindFlag=flags.find(flag=>flag.startsWith('--state-kind='));
  if(!['backup','restore','retention'].includes(mode) || !directory || !scratchDirectory
    || flags.some(flag=>!['--writers-stopped','--isolated-target','--trusted-archive'].includes(flag) && ![ledgerFlag,stateFlag,kindFlag].includes(flag))
    || new Set(flags.map(flag=>flag.split('=')[0])).size!==flags.length || ledgerFlag && (mode!=='retention' || !ledgerDirectory)
    || mode!=='retention' && (stateFlag || kindFlag) || mode==='retention' && (!ledgerDirectory || !stateFlag || !kindFlag))
    throw Error('Retention requires --ledger=STOPPED-SOURCE-LEDGER --state-file=PATH --state-kind=quarantine|replay|cleanup plus stopped/isolated confirmations. Backup and restore retain their existing arguments.');
  const prefix=mode==='backup'?'UNDERSTOOD':'UNDERSTOOD_RESTORE',connection=connectionConfig(prefix),key=backupKey(process.env.UNDERSTOOD_BACKUP_KEY);
  if(mode==='backup' && !flags.includes('--writers-stopped') || mode==='restore' && (!flags.includes('--isolated-target') || !flags.includes('--trusted-archive'))
    || mode==='retention' && (!flags.includes('--isolated-target') || !flags.includes('--writers-stopped')))
    throw Error('Explicit maintenance confirmations are required before connecting');
  const pool=await createPostgresPool(connection);let storage;
  try {
    storage=await postgresBackupStorage(prefix,{restore:mode==='restore'});
    const options={pool,storage,directory:resolve(directory),scratchDirectory:resolve(scratchDirectory),key,connection,
      dumpTool:process.env.UNDERSTOOD_PG_DUMP || 'pg_dump',restoreTool:process.env.UNDERSTOOD_PG_RESTORE || 'pg_restore'};
    const result=mode==='backup'?await createPostgresBackup({...options,schema:process.env.UNDERSTOOD_POSTGRES_SCHEMA || 'public',writersStopped:flags.includes('--writers-stopped')}):
      mode==='restore'?await restorePostgresBackup({...options,isolatedTarget:flags.includes('--isolated-target'),trustedArchive:flags.includes('--trusted-archive')}):
        await sweepPostgresRestore({...options,ledgerDirectory:resolve(ledgerDirectory),stateFile:resolve(stateFlag.slice('--state-file='.length)),stateKind:kindFlag.slice('--state-kind='.length),isolatedTarget:flags.includes('--isolated-target'),writersStopped:flags.includes('--writers-stopped')});
    console.log(JSON.stringify(mode==='retention'?restoreRetentionSummary(result):result));
    if(mode==='retention' && !result.elapsedPoliciesReconciled)process.exitCode=2;
  }finally {key.fill(0);storage?.close?.();await pool.end();}
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Backup/restore failed. Keep the target isolated; do not activate an incomplete restore. Check the maintenance runbook without publishing secrets.');
  process.exitCode=1;
});
