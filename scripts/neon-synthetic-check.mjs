import {readFileSync,lstatSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {checkNeonTestDatabase} from '../server/postgres/neon-preflight.mjs';
export function loadNeonTestEnvironment(root){
  const path=resolve(root,'.env'),stat=lstatSync(path);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>65536)throw Error('Private Neon test configuration is unavailable');
  const text=readFileSync(path,'utf8');
  for(const name of ['UNDERSTOOD_NEON_TEST_URL','UNDERSTOOD_NEON_TEST_ISOLATED']){
    if(text.split(/\r?\n/).filter(line=>new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line)).length!==1)throw Error('Private Neon test configuration is ambiguous');
  }
  return parseEnv(text);
}
export async function runNeonCheck(root,args,{check=checkNeonTestDatabase}={}){
  if(args.length!==1 || args[0]!=='--confirm-synthetic')throw Error('Explicit synthetic Neon check confirmation is required');
  const env=loadNeonTestEnvironment(root),directory=resolve(root,'artifacts');
  await mkdir(directory,{recursive:true});const stat=lstatSync(directory);
  if(!stat.isDirectory() || stat.isSymbolicLink())throw Error('Local Neon evidence directory is unavailable');
  const path=resolve(directory,`neon-connection-${randomUUID()}.json`),startedAt=new Date().toISOString();
  await writeFile(path,JSON.stringify({startedAt,state:'checking',kind:'connection-only',productionVerdict:false},null,2)+'\n',{flag:'wx'});
  try{const result=await check(env);await writeFile(path,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),state:'passed',...result},null,2)+'\n');return {passed:true,path};}
  catch{await writeFile(path,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),state:'failed',kind:'connection-only',productionVerdict:false,error:'Connection, verified TLS or empty isolated target check failed. No application writes were requested.'},null,2)+'\n');return {passed:false,path};}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await runNeonCheck(process.cwd(),process.argv.slice(2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
  catch{console.error('Neon synthetic check configuration unavailable. No credential was printed or application write requested.');process.exitCode=1;}
}
