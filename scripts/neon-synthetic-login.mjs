import {lstatSync} from 'node:fs';
import {mkdir,writeFile,open,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadNeonTestEnvironment} from './neon-synthetic-check.mjs';
import {rehearseNeonLogin} from '../server/postgres/neon-login-rehearsal.mjs';
export async function replaceLoginEvidence(path,value){
  const temporary=path+'.'+randomUUID()+'.tmp';let file;
  try{
    file=await open(temporary,'wx',0o600);await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();await file.close();file=null;
    await rename(temporary,path);
  }finally{if(file)await file.close();await rm(temporary,{force:true});}
}
export async function runNeonLogin(root,args,{rehearse=rehearseNeonLogin,signal}={}){
  if(args.length!==2 || args[0]!=='--confirm-synthetic' || !['--confirm-temporary-database-and-login','--confirm-temporary-database-and-two-logins','--confirm-temporary-database-and-three-logins'].includes(args[1]))throw Error('Explicit temporary database and LOGIN authorization required');
  const operatorServices=args[1]==='--confirm-temporary-database-and-three-logins',separateServices=operatorServices||args[1]==='--confirm-temporary-database-and-two-logins';
  const env=loadNeonTestEnvironment(root),runId=randomUUID(),directory=resolve(root,'artifacts');await mkdir(directory,{recursive:true});
  const stat=lstatSync(directory);if(!stat.isDirectory() || stat.isSymbolicLink())throw Error('Local LOGIN evidence directory unavailable');
  const path=resolve(directory,(operatorServices?'neon-three-roles-':separateServices?'neon-service-roles-':'neon-login-')+runId+'.json'),startedAt=new Date().toISOString();
  await writeFile(path,JSON.stringify({runId,startedAt,state:'starting',productionVerdict:false},null,2)+'\n',{flag:'wx'});
  const result=await rehearse(env,{runId,confirmed:true,separateServices,...(operatorServices?{operatorServices:true,confirmedOperator:true}:{}),signal,checkpoint:async value=>replaceLoginEvidence(path,{startedAt,updatedAt:new Date().toISOString(),...value})});
  return {passed:result.state==='passed',cleanupDatabase:result.cleanupDatabase,cleanupRole:result.cleanupRole,
    ...(separateServices?{cleanupWorkerRole:result.cleanupWorkerRole}:{}),...(operatorServices?{cleanupOperatorRole:result.cleanupOperatorRole}:{}),path};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
  try{const result=await runNeonLogin(process.cwd(),process.argv.slice(2),{signal:controller.signal});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
  catch{console.error('Temporary LOGIN configuration or local evidence unavailable. No credential was printed. Reconcile the recorded resources before retrying.');process.exitCode=1;}
}
