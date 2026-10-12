import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {withTransaction} from '../server/postgres/db.mjs';
import {databaseInventory,privateObjectInventory} from '../server/postgres/backup.mjs';
import {encryptBackupBytes} from '../server/backup-files.mjs';
import {restoreStateHash} from '../server/postgres/restore-replay-state.mjs';

// Older command fixtures start after separate unaccounted helper operations.
// This explicit synthetic checkpoint is not a production state-history backfill.
export async function fixtureState(f,key){
  const stateFile=join(f.root,'fixture-state.enc');
  const state=await withTransaction(f.targetPool,async client=>({format:'understood-restore-quarantine-state-v1',backupId:f.baseline.id,
    targetIdentitySha256:createHash('sha256').update('127.0.0.1:5432/restored').digest('hex'),capturedAt:new Date().toISOString(),
    baselineInventorySha256:restoreStateHash({database:f.baseline.database,objects:f.baseline.objects}),
    database:await databaseInventory(client,f.baseline.schema),objects:await privateObjectInventory(client),
    operation:'backup.restore.quarantined',activationAllowed:false,productionReady:false}));
  await encryptBackupBytes(Buffer.from(JSON.stringify(state)),stateFile,key,`understood:restore:${f.baseline.id}:quarantine-state`);
  return {stateFile,stateKind:'quarantine'};
}
export const retryState=directory=>({stateFile:join(directory,'replay-state.enc'),stateKind:'replay'});
