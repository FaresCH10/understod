import assert from 'node:assert/strict';
import {lstat,mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {getCACertificates} from 'node:tls';
import {execFileSync} from 'node:child_process';
import {fileSha256,safeBackupPath} from '../server/backup-files.mjs';
import {loadNeonTestEnvironment} from './neon-synthetic-check.mjs';
import {rehearseNeonBackup} from '../server/postgres/neon-backup-rehearsal.mjs';

export const EDB_ARCHIVE_SHA256='e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2';
export async function privateBackupScratch(root){
  if(process.platform!=='win32')throw Error('This portable-client rehearsal currently requires Windows');
  const parent=await safeBackupPath(join(root,'.tools','neon-backup-private'));
  if(!(await lstat(parent)).isDirectory())throw Error('Operator-only scratch parent required');
  // The path is passed in an isolated environment variable, never interpolated into PowerShell code.
  const output=execFileSync(join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
    ['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:UNDERSTOOD_SCRATCH_CHECK; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if(-not $a.AreAccessRulesProtected -or $a.Access.Count -ne 1 -or $a.Access[0].IsInherited -or $a.Access[0].AccessControlType -ne 'Allow' -or $a.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid -or ($a.Access[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl){exit 1}; 'private'"],
    {windowsHide:true,encoding:'utf8',timeout:15000,env:{SystemRoot:process.env.SystemRoot || 'C:\\Windows',UNDERSTOOD_SCRATCH_CHECK:parent}});
  assert.equal(output.trim(),'private');
  const scratch=join(parent,randomUUID());await mkdir(scratch,{mode:0o700});return scratch;
}

export async function runNeonBackup(root,args,{rehearse=rehearseNeonBackup}={}){
  if(args.length!==2 || args[0]!=='--confirm-synthetic' || args[1]!=='--confirm-two-temporary-databases')throw Error('Explicit two-database synthetic backup authorization required');
  root=resolve(root);const env=loadNeonTestEnvironment(root),tools=join(root,'.tools','postgresql-18.6-5');
  assert.equal(await fileSha256(join(tools,'binaries.zip')),EDB_ARCHIVE_SHA256);
  const bin=await safeBackupPath(join(tools,'clients','pgsql','bin')),dumpTool=join(bin,'pg_dump.exe'),restoreTool=join(bin,'pg_restore.exe');
  for(const path of [dumpTool,restoreTool])assert.equal((await lstat(path)).isFile(),true);
  const scratch=await privateBackupScratch(root),caFile=join(scratch,'node-trusted-roots.pem');
  const roots=getCACertificates('bundled');assert.ok(roots.length>0);await writeFile(caFile,roots.join('\n')+'\n',{flag:'wx',mode:0o600});
  const runId=randomUUID(),directory=await safeBackupPath(join(root,'artifacts'));await mkdir(directory,{recursive:true});
  const path=join(directory,'neon-backup-'+runId+'.json'),startedAt=new Date().toISOString();
  await writeFile(path,JSON.stringify({runId,startedAt,state:'starting',productionVerdict:false},null,2)+'\n',{flag:'wx'});
  const result=await rehearse(env,{confirmed:true,scratchPrivate:true,runId,root,scratch,caFile,dumpTool,restoreTool,
    checkpoint:value=>writeFile(path,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),...value},null,2)+'\n')});
  const remaining=await readdir(scratch);
  const passfilesRemoved=remaining.length===1 && remaining[0]==='node-trusted-roots.pem';
  if(!passfilesRemoved){result.state='failed';result.scratchNeedsReconciliation=true;}
  await writeFile(path,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),...result,passfilesRemoved,archiveSha256:EDB_ARCHIVE_SHA256},null,2)+'\n');
  return {passed:result.state==='passed',cleanup:result.cleanup,passfilesRemoved,path};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await runNeonBackup(process.cwd(),process.argv.slice(2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
  catch{console.error('Native backup prerequisites or admission unavailable. No credential was printed. Reconcile any recorded resources before retrying.');process.exitCode=1;}
}
