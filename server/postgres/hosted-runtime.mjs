import {verifyMigrations} from './migrate.mjs';
import {verifyRuntimePermissions} from './runtime-permissions.mjs';
import {createPostgresHostedServer} from './http.mjs';
import {loadPublicBuild} from '../public-build.mjs';

export async function startHostedApi(pool,storage,config,{directory='dist'}={}) {
  await verifyMigrations(pool,{schema:config.schema});
  await verifyRuntimePermissions(pool,{schema:config.schema});
  const publicBuild=await loadPublicBuild(directory),server=createPostgresHostedServer(pool,{storage,config,publicBuild});
  server.headersTimeout=15000;server.requestTimeout=30000;server.maxHeadersCount=100;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'0.0.0.0',()=>{server.off('error',reject);resolve();});});
  return server;
}
