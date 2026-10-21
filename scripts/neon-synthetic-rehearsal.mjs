import {lstatSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadNeonTestEnvironment} from './neon-synthetic-check.mjs';
import {rehearseNeonDatabase} from '../server/postgres/neon-rehearsal.mjs';
import {interruptNeonAssessment} from '../server/postgres/neon-worker-interruption.mjs';
export async function runNeonRehearsal(root,args,{rehearse=rehearseNeonDatabase}={}){
  const optional=new Set(['--confirm-temporary-nologin-roles','--confirm-concurrency-extension','--confirm-owned-worker-interruption']);
  if(args[0]!=='--confirm-synthetic' || args.length>4 || new Set(args).size!==args.length || args.slice(1).some(arg=>!optional.has(arg)) || args.includes('--confirm-owned-worker-interruption') && !args.includes('--confirm-concurrency-extension'))throw Error('Explicit synthetic Neon rehearsal confirmation is required');
  const env=loadNeonTestEnvironment(root),runId=randomUUID(),directory=resolve(root,'artifacts');
  await mkdir(directory,{recursive:true});const stat=lstatSync(directory);if(!stat.isDirectory() || stat.isSymbolicLink())throw Error('Local Neon evidence directory unavailable');
  const path=resolve(directory,`neon-rehearsal-${runId}.json`),startedAt=new Date().toISOString();
  await writeFile(path,JSON.stringify({runId,startedAt,state:'starting',productionVerdict:false},null,2)+'\n',{flag:'wx'});
  const checkpoint=async value=>writeFile(path,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),...value},null,2)+'\n');
  const result=await rehearse(env,{runId,checkpoint,temporaryNologinRoles:args.includes('--confirm-temporary-nologin-roles'),extendedConcurrency:args.includes('--confirm-concurrency-extension'),
    ...(args.includes('--confirm-owned-worker-interruption')?{interruptAssessment:context=>interruptNeonAssessment(env,context)}:{})});return {passed:result.state==='passed',cleanup:result.cleanup,path};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await runNeonRehearsal(process.cwd(),process.argv.slice(2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
  catch{console.error('Neon rehearsal configuration or local evidence unavailable. No credential was printed. Reconcile the saved run before retrying.');process.exitCode=1;}
}
