import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions,verifyRuntimePermissions,runtimeRoleName,runtimeProfile} from '../server/postgres/runtime-permissions.mjs';

export function runtimePermissionArguments(args){
  const [mode,role,...flags]=args;
  if(!['configure','check'].includes(mode) || !role)throw Error('Usage: postgres-permissions.mjs configure|check ROLE [--profile=worker|operator]');
  runtimeRoleName(role);
  const selected=flags.filter(value=>value.startsWith('--profile='));
  if(selected.length>1)throw Error('Select one runtime permission profile');
  const profile=runtimeProfile(selected.length?selected[0].slice('--profile='.length):'application');
  const rest=flags.filter(value=>!value.startsWith('--profile='));
  if(mode==='configure' && (rest.length!==2 || new Set(rest).size!==2 || !rest.includes('--dedicated-database') || !rest.includes('--writers-stopped')))
    throw Error('Confirm dedicated database and stopped writers');
  if(mode==='check' && rest.length)throw Error('Unexpected permission-check flags');
  return {mode,role,profile};
}

async function main(){
  const {mode,role,profile}=runtimePermissionArguments(process.argv.slice(2)),schema=process.env.UNDERSTOOD_POSTGRES_SCHEMA;
  if(!schema)throw Error('Explicit runtime schema required');
  const pool=await createPostgresPool();
  try{
    await verifyMigrations(pool,{schema});
    const result=mode==='configure'?await configureRuntimePermissions(pool,{schema,role,profile,dedicatedDatabase:true,writersStopped:true}):await verifyRuntimePermissions(pool,{schema,role,profile});
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Runtime permission operation failed. Review dedicated database ownership, role authority and ACLs; secret details are not logged.');process.exitCode=1;
});
