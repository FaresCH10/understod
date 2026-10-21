import {fileURLToPath} from 'node:url';
import {createPostgresPool,withTransaction} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {fenceSourceRuntime,inspectSourceRuntimeFence,runtimeRoleName} from '../server/postgres/runtime-permissions.mjs';

export function sourceFenceArguments(args){
  const [mode,list,...flags]=args;
  if(!['seal','check'].includes(mode) || !list)throw Error('Usage: postgres-fence.mjs seal|check ROLE[,ROLE]');
  const roles=list.split(',');roles.forEach(runtimeRoleName);
  if(!roles.length || roles.length>16 || new Set(roles).size!==roles.length)throw Error('List distinct runtime roles');
  const profiles={};
  for(const profile of ['worker','operator']) {
    const prefix=`--${profile}-roles=`,selected=flags.filter(value=>value.startsWith(prefix));
    if(selected.length>1)throw Error('Select each service profile once');
    const selectedRoles=selected.length?selected[0].slice(prefix.length).split(','):[];selectedRoles.forEach(runtimeRoleName);
    if(new Set(selectedRoles).size!==selectedRoles.length || selectedRoles.some(role=>!roles.includes(role) || Object.hasOwn(profiles,role)))
      throw Error('Service roles must be distinct disjoint subsets of fenced identities');
    for(const role of selectedRoles)profiles[role]=profile;
  }
  const rest=flags.filter(value=>!value.startsWith('--worker-roles=') && !value.startsWith('--operator-roles='));
  if(mode==='seal' && (rest.length!==1 || rest[0]!=='--writers-stopped'))throw Error('Stop all API, worker and maintenance writers before sealing');
  if(mode==='check' && flags.length)throw Error('Unexpected source fence flags');
  return {mode,roles,profiles};
}

async function main(){
  const {mode,roles,profiles}=sourceFenceArguments(process.argv.slice(2)),schema=process.env.UNDERSTOOD_POSTGRES_SCHEMA;
  if(!schema)throw Error('Explicit source schema required');
  const pool=await createPostgresPool();
  try{
    await verifyMigrations(pool,{schema});
    const result=mode==='seal'?await fenceSourceRuntime(pool,{schema,roles,profiles,writersStopped:true}):await withTransaction(pool,async client=>{
      await client.query('SET TRANSACTION READ ONLY');return inspectSourceRuntimeFence(client,{schema,roles});
    });
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Source runtime fence operation failed. Keep writers stopped, preserve evidence and do not activate any target.');process.exitCode=1;
});
