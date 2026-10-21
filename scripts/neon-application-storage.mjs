import {lstatSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadNeonStorageTestEnvironment} from './neon-storage-check.mjs';
import {neonStorageTestConfig} from '../server/neon-storage-test.mjs';
import {rehearseNeonApplicationStorage} from '../evaluation/neon-storage-rehearsal.mjs';

export async function runNeonApplicationStorage(root,args,{rehearse=rehearseNeonApplicationStorage,signal}={}){
  if(args.length!==1||args[0]!=='--confirm-six-family-synthetic-storage')throw Error('Explicit six-family synthetic storage authorization is required');
  const env=loadNeonStorageTestEnvironment(root);neonStorageTestConfig(env);
  const directory=resolve(root,'artifacts');await mkdir(directory,{recursive:true});
  const info=lstatSync(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Application storage evidence directory unavailable');
  const runId=randomUUID(),startedAt=new Date().toISOString(),path=resolve(directory,'neon-application-storage-'+runId+'.json');
  await writeFile(path,JSON.stringify({runId,startedAt,state:'starting',productionReady:false},null,2)+'\n',{flag:'wx'});
  const result=await rehearse(env,{runId,confirmed:true,signal,checkpoint:async value=>
    writeFile(path,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),...value},null,2)+'\n')});
  return {passed:result.state==='passed',cleanup:result.cleanup,path,productionReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
  try{const result=await runNeonApplicationStorage(process.cwd(),process.argv.slice(2),{signal:controller.signal});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
  catch{console.error('Synthetic application storage check unavailable. No credentials printed; inspect saved evidence before retrying.');process.exitCode=1;}
}
