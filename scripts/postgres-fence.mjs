import {fileURLToPath} from 'node:url';
import {createPostgresPool,withTransaction} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {fenceSourceRuntime,inspectSourceRuntimeFence,runtimeRoleName} from '../server/postgres/runtime-permissions.mjs';

async function main(){
  const [mode,list,...flags]=process.argv.slice(2),schema=process.env.UNDERSTOOD_POSTGRES_SCHEMA;
  if(!['seal','check'].includes(mode) || !schema || !list)throw Error('Usage: postgres-fence.mjs seal|check ROLE[,ROLE]');
  const roles=list.split(',');roles.forEach(runtimeRoleName);
  if(mode==='seal' && (flags.length!==1 || flags[0]!=='--writers-stopped'))throw Error('Stop all API, worker and maintenance writers before sealing');
  if(mode==='check' && flags.length)throw Error('Unexpected source fence flags');
  const pool=await createPostgresPool();
  try{
    await verifyMigrations(pool,{schema});
    const result=mode==='seal'?await fenceSourceRuntime(pool,{schema,roles,writersStopped:true}):await withTransaction(pool,async client=>{
      await client.query('SET TRANSACTION READ ONLY');return inspectSourceRuntimeFence(client,{schema,roles});
    });
    console.log(JSON.stringify(result));
  }finally{await pool.end();}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{
  console.error('Source runtime fence operation failed. Keep writers stopped, preserve evidence and do not activate any target.');process.exitCode=1;
});
