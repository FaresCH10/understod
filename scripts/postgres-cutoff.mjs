import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {postgresBackupConnection} from '../server/postgres/backup-native.mjs';
import {inspectSourceCutoff,sourceCutoffSummary} from '../server/postgres/source-cutoff.mjs';
import {validatePostgresBackup,verifyEncryptedBackupFiles,postgresBackupStorage} from './postgres-backup.mjs';
import {backupKey,readBackupCompletion,writeBackupCompletion,createPrivateDirectory,safeBackupPath,encryptBackupBytes} from '../server/backup-files.mjs';

export async function createSourceCutoffObservation({pool,connection,storage,backupDirectory,directory,key,writersStopped=false,runtimeRoles}){
  if(writersStopped!==true)throw Error('Source cutoff inspection requires all writers and cleanup workers stopped');
  const source=await safeBackupPath(backupDirectory),baseline=validatePostgresBackup(await readBackupCompletion(source,key));
  const config=postgresBackupConnection(connection),sourceIdentitySha256=createHash('sha256').update(`${config.host.toLowerCase()}:${config.port}/${config.database}`).digest('hex');
  if(sourceIdentitySha256!==baseline.sourceIdentitySha256)throw Error('Source cutoff inspection must use the original backup source');
  await verifyEncryptedBackupFiles(source,baseline);
  const destination=await createPrivateDirectory(directory);
  const {ledger,report}=await inspectSourceCutoff(pool,baseline,storage,{schema:baseline.schema,sourceIdentitySha256,writersStopped,runtimeRoles});
  await writeBackupCompletion(destination,ledger,key);
  await encryptBackupBytes(Buffer.from(JSON.stringify(report)),join(destination,'source-cutoff.enc'),key,`understood:source:${baseline.id}:cutoff:${ledger.id}`);
  return sourceCutoffSummary(report);
}

async function main(){
  const [backupDirectory,directory,...flags]=process.argv.slice(2);
  if(!backupDirectory || !directory || !flags.includes('--writers-stopped') || flags.length>2 || new Set(flags).size!==flags.length
    || flags.some(flag=>flag!=='--writers-stopped' && !flag.startsWith('--runtime-roles=')))throw Error('Usage: postgres-cutoff.mjs BACKUP NEW-OBSERVATION --writers-stopped [--runtime-roles=ROLE,ROLE]');
  const roleFlag=flags.find(flag=>flag.startsWith('--runtime-roles=')),runtimeRoles=roleFlag?.slice('--runtime-roles='.length).split(',');
  const connection={connectionString:process.env.UNDERSTOOD_POSTGRES_URL,tls:process.env.UNDERSTOOD_POSTGRES_TLS==='true',caFile:process.env.UNDERSTOOD_POSTGRES_CA_FILE};
  postgresBackupConnection(connection);
  const key=backupKey(process.env.UNDERSTOOD_BACKUP_KEY);let pool,storage;
  try{
    pool=await createPostgresPool(connection);storage=await postgresBackupStorage('UNDERSTOOD');
    const result=await createSourceCutoffObservation({pool,connection,storage,backupDirectory:resolve(backupDirectory),directory:resolve(directory),key,writersStopped:true,runtimeRoles});
    console.log(JSON.stringify(result));if(!result.cutoffCandidate)process.exitCode=2;
  }finally{key.fill(0);storage?.close?.();if(pool)await pool.end();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Source cutoff inspection failed. Keep writers stopped and preserve evidence; never activate a restore from this failure.');process.exitCode=1;
});
