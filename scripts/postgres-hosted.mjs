import {hostedSyntheticConfig} from '../server/postgres/hosted-config.mjs';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {verifyRuntimePermissions} from '../server/postgres/runtime-permissions.mjs';
import {startHostedApi} from '../server/postgres/hosted-runtime.mjs';
import {runRehearsalWorker as runPostgresWorker} from '../server/postgres/runtime.mjs';
import {r2AudioStore} from '../server/private-storage.mjs';

async function main() {
  const mode=process.argv[2] ?? 'api';if(!['api','worker','check'].includes(mode))throw Error('Use postgres-hosted.mjs api, worker or check');
  const config=hostedSyntheticConfig(),pool=await createPostgresPool(),storage=r2AudioStore(config.storageConfig),stop=new AbortController();let server;
  const shutdown=()=>stop.abort();process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try {
    if(mode==='api') {
      server=await startHostedApi(pool,storage,config);console.log(`Hosted SYNTHETIC PostgreSQL API listening on port ${config.port}. Real worker data is not approved.`);
      if(!stop.signal.aborted)await new Promise(resolve=>stop.signal.addEventListener('abort',resolve,{once:true}));
    }else {
      const result=await verifyMigrations(pool,{schema:config.schema});
      await verifyRuntimePermissions(pool,{schema:config.schema});
      if(mode==='check'){console.log(`Hosted synthetic schema verified (${result.migrations} migrations). No storage/provider connection was tested.`);return;}
      console.log('Hosted SYNTHETIC PostgreSQL worker started. Free-tier provider dispatch is disabled.');
      await runPostgresWorker(pool,storage,config,{signal:stop.signal,onError:stage=>console.error(`Hosted worker stage failed: ${stage}`)});
    }
  }finally {
    process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);
    if(server){const timer=setTimeout(()=>server.closeAllConnections(),25000);timer.unref();try{await new Promise(resolve=>server.close(resolve));}finally{clearTimeout(timer);}}
    storage.close();await pool.end();
  }
}
main().catch(()=>{console.error('Hosted runtime unavailable. Check synthetic staging configuration, trusted proxy, verified migrations, TLS and private storage. Secret details are not logged.');process.exitCode=1;});
