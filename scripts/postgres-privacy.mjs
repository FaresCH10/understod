import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {postgresBackupConnection} from '../server/postgres/backup-native.mjs';
import {exportPrivacyLedger,validatePrivacyLedger,planPrivacyReconciliation,replayPrivacyDeletions,replayPrivacyPolicies,replayPrivacyActivity,replayPrivacyBriefings,replayPrivacyRetirements,replayPrivacyRestrictions,privacyLedgerFingerprint} from '../server/postgres/privacy-ledger.mjs';
import {validatePostgresBackup} from './postgres-backup.mjs';
import {backupKey,readBackupCompletion,writeBackupCompletion,createPrivateDirectory,safeBackupPath,encryptBackupBytes,decryptBackupBytes} from '../server/backup-files.mjs';
import {compareSourceSnapshot} from '../server/postgres/source-inventory.mjs';
import {validateRestoreReplayState,restoreStateHash} from '../server/postgres/restore-replay-state.mjs';

const identityHash=connection=>{
  const value=postgresBackupConnection(connection);
  return createHash('sha256').update(`${value.host.toLowerCase()}:${value.port}/${value.database}`).digest('hex');
};

export async function createPrivacyLedgerExport({pool,connection,backupDirectory,directory,key,writersStopped=false}){
  if(writersStopped!==true)throw Error('Stop all source writers and cleanup workers before privacy export');
  const baseline=validatePostgresBackup(await readBackupCompletion(await safeBackupPath(backupDirectory),key));
  const sourceIdentitySha256=identityHash(connection);
  if(sourceIdentitySha256!==baseline.sourceIdentitySha256)throw Error('Privacy export must use the original backup source');
  const destination=await createPrivateDirectory(directory);
  const ledger=await exportPrivacyLedger(pool,baseline,{sourceIdentitySha256,writersStopped});
  await writeBackupCompletion(destination,ledger,key);
  return {backupId:baseline.id,ledgerId:ledger.id,capturedAt:ledger.capturedAt,ledgerFingerprint:privacyLedgerFingerprint(ledger),
    rows:Object.values(ledger.tables).reduce((n,rows)=>n+rows.length,0),objects:ledger.objects.length,encrypted:true,
    sourceMatchesBackupAtCapture:compareSourceSnapshot(baseline,ledger).sourceMatchesBackupAtCapture,
    authoritativeReconciliationComplete:false,activationAllowed:false,productionReady:false};
}

export async function inspectPrivacyRestore({pool,connection,backupDirectory,ledgerDirectory,directory,key,isolatedTarget=false,writersStopped=false}){
  if(isolatedTarget!==true || writersStopped!==true)throw Error('Privacy inspection requires a stopped isolated restore');
  const baseline=validatePostgresBackup(await readBackupCompletion(await safeBackupPath(backupDirectory),key));
  if(identityHash(connection)===baseline.sourceIdentitySha256)throw Error('Privacy restore inspection must not target the source database');
  const ledger=validatePrivacyLedger(await readBackupCompletion(await safeBackupPath(ledgerDirectory),key),baseline);
  const destination=await createPrivateDirectory(directory);
  const report=await planPrivacyReconciliation(pool,baseline,ledger,{isolatedTarget,writersStopped});
  await encryptBackupBytes(Buffer.from(JSON.stringify(report)),join(destination,'privacy-plan.enc'),key,`understood:restore:${baseline.id}:privacy-plan:${ledger.id}`);
  return report;
}

export async function readRestoreReplayPredecessor({stateFile,stateKind,baseline,connection,key}){
  if(!stateFile || !['quarantine','replay','cleanup'].includes(stateKind))throw Error('Authenticated predecessor state file and kind are required');
  const purpose=`understood:restore:${baseline.id}:${stateKind}-state`;
  const bytes=await decryptBackupBytes(stateFile,key,purpose,{maxBytes:16*1024*1024});
  let state;try{state=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
  if(state.format!==`understood-restore-${stateKind}-state-v1`)throw Error('Restore state purpose mismatch');
  return validateRestoreReplayState(state,{baseline,targetIdentitySha256:identityHash(connection)});
}

async function replayPrivacyRestore(operation,{pool,connection,backupDirectory,ledgerDirectory,directory,key,stateFile,stateKind,isolatedTarget=false,writersStopped=false,confirmed=false}){
  if(confirmed!==true || isolatedTarget!==true || writersStopped!==true)throw Error('Privacy decision replay requires confirmed stopped isolated restore');
  const baseline=validatePostgresBackup(await readBackupCompletion(await safeBackupPath(backupDirectory),key));
  if(identityHash(connection)===baseline.sourceIdentitySha256)throw Error('Privacy decision replay must not target the source database');
  const ledger=validatePrivacyLedger(await readBackupCompletion(await safeBackupPath(ledgerDirectory),key),baseline);
  const predecessor=await readRestoreReplayPredecessor({stateFile,stateKind,baseline,connection,key});
  if(predecessor.format==='understood-restore-cleanup-state-v1')throw Error('Privacy replay after physical cleanup requires cross-phase reconciliation; preserve the cleanup checkpoint');
  const destination=await createPrivateDirectory(directory);
  const replay={deletions:replayPrivacyDeletions,policies:replayPrivacyPolicies,activity:replayPrivacyActivity,briefings:replayPrivacyBriefings,retirements:replayPrivacyRetirements,restrictions:replayPrivacyRestrictions}[operation];
  if(!replay)throw Error('Unsupported privacy replay operation');
  const result=await replay(pool,baseline,ledger,{isolatedTarget,writersStopped,predecessor,targetIdentitySha256:identityHash(connection),
    prepareState:state=>encryptBackupBytes(Buffer.from(JSON.stringify(state)),join(destination,'replay-state.enc'),key,`understood:restore:${baseline.id}:replay-state`)});
  // A lost acknowledgement can reuse the candidate only after exact inventory
  // and committed audit receipt validation inside the next transaction.
  await encryptBackupBytes(Buffer.from(JSON.stringify(result)),join(destination,`privacy-${operation}.enc`),key,`understood:restore:${baseline.id}:privacy-${operation}:${ledger.id}`);
  return result;
}

export const replayPrivacyRestoreDeletions=options=>replayPrivacyRestore('deletions',options);
export const replayPrivacyRestorePolicies=options=>replayPrivacyRestore('policies',options);
export const replayPrivacyRestoreActivity=options=>replayPrivacyRestore('activity',options);
export const replayPrivacyRestoreBriefings=options=>replayPrivacyRestore('briefings',options);
export const replayPrivacyRestoreRetirements=options=>replayPrivacyRestore('retirements',options);
export const replayPrivacyRestoreRestrictions=options=>replayPrivacyRestore('restrictions',options);

async function main(){
  const [mode,backupDirectory,ledgerDirectory,...rest]=process.argv.slice(2),target=mode!=='export';
  const directory=target?rest.shift():ledgerDirectory,flags=rest;
  const stateFlag=flags.find(flag=>flag.startsWith('--state-file=')),kindFlag=flags.find(flag=>flag.startsWith('--state-kind='));
  const isReplay=['deletions','policies','activity','briefings','retirements','restrictions'].includes(mode);
  if(!['export','plan','deletions','policies','activity','briefings','retirements','restrictions'].includes(mode) || !backupDirectory || !ledgerDirectory || !directory
    || flags.some(flag=>!['--writers-stopped','--isolated-target','--confirmed'].includes(flag) && !flag.startsWith('--state-file=') && !flag.startsWith('--state-kind='))
    || new Set(flags.map(flag=>flag.split('=')[0])).size!==flags.length || !flags.includes('--writers-stopped')
    || target && !flags.includes('--isolated-target') || isReplay && (!flags.includes('--confirmed') || !stateFlag || !kindFlag)
    || !isReplay && (stateFlag || kindFlag))throw Error('Replay requires --writers-stopped --isolated-target --confirmed --state-file=PATH --state-kind=quarantine|replay. Export and plan retain their existing arguments.');
  const prefix=target?'UNDERSTOOD_RESTORE':'UNDERSTOOD';
  const connection={connectionString:process.env[`${prefix}_POSTGRES_URL`],tls:process.env[`${prefix}_POSTGRES_TLS`]==='true',caFile:process.env[`${prefix}_POSTGRES_CA_FILE`]};
  identityHash(connection);
  const key=backupKey(process.env.UNDERSTOOD_BACKUP_KEY);let pool;
  try{
    pool=await createPostgresPool(connection);
    const options={pool,connection,backupDirectory:resolve(backupDirectory),directory:resolve(directory),key,writersStopped:true};
    if(!target)console.log(JSON.stringify(await createPrivacyLedgerExport(options)));
    else{
      const args={...options,ledgerDirectory:resolve(ledgerDirectory),isolatedTarget:true};
      const replay={deletions:replayPrivacyRestoreDeletions,policies:replayPrivacyRestorePolicies,activity:replayPrivacyRestoreActivity,briefings:replayPrivacyRestoreBriefings,retirements:replayPrivacyRestoreRetirements,restrictions:replayPrivacyRestoreRestrictions}[mode];
      const result=replay?await replay({...args,confirmed:true,stateFile:resolve(stateFlag.slice('--state-file='.length)),stateKind:kindFlag.slice('--state-kind='.length)}):await inspectPrivacyRestore(args);
      console.log(JSON.stringify({backupId:result.backupId,ledgerId:result.ledgerId,conflicts:result.conflicts.length,
        missingReceipts:Object.values(result.missingReceipts).reduce((n,value)=>n+value,0),changedPolicies:Object.values(result.changedPolicies).reduce((n,value)=>n+value,0),
        privateRetirements:result.privateRetirements,...(replay?{duplicate:result.duplicate,importedRequests:result.importedRequests,importedActors:result.importedActors,changedPolicyRows:result.changedPolicyRows,
          journaled:result.journaled,textRetirements:result.textRetirements,caseRetirements:result.caseRetirements,generatedRetirements:result.generatedRetirements,queuedAudio:result.queuedAudio,
          activityRedactions:result.activityRedactions,briefingRedactions:result.briefingRedactions,historicalContentReplayPending:result.historicalContentReplayPending,
          changedStaff:result.changedStaff,disabledWorkers:result.disabledWorkers,changedSites:result.changedSites,stateSha256:restoreStateHash(result.state)}:{}),
        acceptedInputGaps:result.acceptedInputLifecycle.gapCount,sourceInputsRepresented:result.acceptedInputLifecycle.sourceInputsRepresented,
        sourceMatchesBackupAtCapture:result.sourceSnapshot.sourceMatchesBackupAtCapture,changedSourceTables:result.sourceSnapshot.tables.length,
        changedSourceSequences:result.sourceSnapshot.sequences.length,changedSourceObjects:result.sourceSnapshot.objects.length,
        authoritativeReconciliationComplete:false,activationAllowed:false,productionReady:false}));
      process.exitCode=2;
    }
  }finally{key.fill(0);if(pool)await pool.end();}
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Privacy ledger operation failed. Preserve evidence and keep the restore isolated; do not publish database credentials or private identifiers.');process.exitCode=1;
});
