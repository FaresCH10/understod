import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions,verifyRuntimePermissions,runtimeRoleName} from '../server/postgres/runtime-permissions.mjs';

async function main(){
  const [mode,role,...flags]=process.argv.slice(2),schema=process.env.UNDERSTOOD_POSTGRES_SCHEMA;
  if(!['configure','check'].includes(mode) || !schema || !role)throw Error('Usage: postgres-permissions.mjs configure|check ROLE');
  runtimeRoleName(role);
  if(mode==='configure' && (flags.length!==2 || new Set(flags).size!==2 || !flags.includes('--dedicated-database') || !flags.includes('--writers-stopped')))
    throw Error('Confirm dedicated database and stopped writers');
  if(mode==='check' && flags.length)throw Error('Unexpected permission-check flags');
  const pool=await createPostgresPool();
  try{
    await verifyMigrations(pool,{schema});
    const result=mode==='configure'?await configureRuntimePermissions(pool,{schema,role,dedicatedDatabase:true,writersStopped:true}):await verifyRuntimePermissions(pool,{schema,role});
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Runtime permission operation failed. Review dedicated database ownership, role authority and ACLs; secret details are not logged.');process.exitCode=1;
});
