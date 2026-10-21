import {verifyMigrations} from './migrate.mjs';
import {verifyRuntimePermissions} from './runtime-permissions.mjs';
import {createPostgresHostedServer} from './http.mjs';
import {loadPublicBuild,loadOperatorBuild} from '../public-build.mjs';
import {createPostgresOperatorServer} from './operator-http.mjs';

async function listenHosted(server,port) {
  server.headersTimeout=15000;server.requestTimeout=30000;server.maxHeadersCount=100;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.off('error',reject);resolve();});});
  return server;
}

export async function startHostedApi(pool,storage,config,{directory='dist'}={}) {
  if(config?.service!=='api' || config.runtimeRoleProfile!=='application' || config.operatorAccess!==false)throw Error('Invalid hosted API service');
  await verifyMigrations(pool,{schema:config.schema});
  await verifyRuntimePermissions(pool,{schema:config.schema});
  const publicBuild=await loadPublicBuild(directory),server=createPostgresHostedServer(pool,{storage,config,publicBuild});
  return listenHosted(server,config.port);
}

export async function startHostedOperator(pool,config,{directory='dist'}={}) {
  if(config?.service!=='operator' || config.runtimeRoleProfile!=='operator' || config.operatorAccess!==true)throw Error('Invalid hosted operator service');
  await verifyMigrations(pool,{schema:config.schema});
  await verifyRuntimePermissions(pool,{schema:config.schema,profile:'operator'});
  const publicBuild=await loadOperatorBuild(directory);
  return listenHosted(createPostgresOperatorServer(pool,{config,publicBuild}),config.port);
}
