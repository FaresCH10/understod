import {createHash} from 'node:crypto';
import {neonTestConnection} from './neon-test-config.mjs';
import {acquirePostgresClient,assertPostgresClientHealthy,guardPostgresPool,assertPostgresPoolHealthy} from './db.mjs';
const inspection=`SELECT current_database() AS database,current_user AS role,pg_backend_pid() AS backend,
  current_setting('server_version_num')::integer AS version,
  has_database_privilege(current_user,current_database(),'CREATE') AS can_create,
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','f','m') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) AS application_relations`;
export async function checkNeonTestDatabase(env,{makePool}={}){
  const config=neonTestConnection(env);
  if(!makePool){const pg=await import('pg');makePool=value=>new pg.Pool(value);}
  const pool=guardPostgresPool(makePool(config)),clients=[];let failed=false;
  pool.on?.('error',()=>{failed=true;});
  try{
    for(let index=0;index<2;index++){
      const client=await acquirePostgresClient(pool);clients.push(client);
      if(client.connection?.stream?.encrypted!==true || client.connection.stream.authorized!==true)throw Error('Neon certificate-verified transport is unavailable');
    }
    const observations=[];
    for(const client of clients){
      await client.query('BEGIN');
      try{
        await client.query('SET TRANSACTION READ ONLY');
        const row=(await client.query(inspection)).rows[0];
        if(!row || row.database!==config.database || row.role!==config.role || !Number.isInteger(row.backend) || row.backend<1
          || !Number.isInteger(row.version) || row.version<140000 || row.can_create!==true || row.application_relations!==0)throw Error('Neon isolated empty test target could not be verified');
        observations.push(row);await client.query('COMMIT');
      }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
    }
    for(const client of clients)assertPostgresClientHealthy(client);assertPostgresPoolHealthy(pool);
    if(failed || observations[0].backend===observations[1].backend || observations[0].version!==observations[1].version)throw Error('Independent Neon test connections could not be verified');
    return {passed:true,kind:'connection-only',certificateVerified:true,independentConnections:2,applicationRelations:0,
      postgresMajor:Math.floor(observations[0].version/10000),targetFingerprint:createHash('sha256').update(JSON.stringify([new URL(config.connectionString).hostname,config.database,config.role])).digest('hex'),
      channelBinding:'enabled-when-offered',databaseWrites:0,migrationsApplied:0,productionVerdict:false};
  }finally{for(const client of clients)client.release();await pool.end();}
}
