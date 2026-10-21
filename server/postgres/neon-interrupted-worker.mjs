import assert from 'node:assert/strict';
import {neonTestConnection} from './neon-test-config.mjs';
import {neonTestRoles} from './neon-role-check.mjs';
import {domainTransaction} from './domain.mjs';
import {processOneAssessment} from './assessment-worker.mjs';
import {withPostgresClient} from './db.mjs';

export async function holdSyntheticAssessment(env,{runId,jobId,send,makePool}){
  neonTestRoles(runId);assert.match(jobId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(env.UNDERSTOOD_NEON_WORKER_CHILD_RUN,runId);assert.equal(typeof send,'function');
  const config=neonTestConnection(env),schema='understood_neon_test_'+runId.replaceAll('-','');
  if(!makePool){const pg=await import('pg');makePool=value=>new pg.Pool(value);}
  const pool=makePool({...config,max:1,application_name:'understood_neon_interruption_'+runId});pool.on?.('error',()=>{});
  try{
    await withPostgresClient(pool,client=>{assert.equal(client.connection?.stream?.encrypted,true);assert.equal(client.connection?.stream?.authorized,true);});
    await domainTransaction(pool,schema,async client=>{
      const identity=(await client.query('SELECT current_user AS current,session_user AS session,current_database() AS database')).rows[0];assert.equal(identity.current,identity.session);assert.equal(identity.current,config.role);assert.equal(identity.database,config.database);
      const marker=(await client.query("SELECT obj_description(oid,'pg_namespace') AS marker,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",[schema])).rows[0];
      assert.equal(marker?.marker,'Understood synthetic Neon rehearsal '+runId);assert.equal(marker?.owner,identity.current);
      const jobs=(await client.query("SELECT id FROM assessment_jobs WHERE status='queued' OR status='processing' AND lease_until<=clock_timestamp() ORDER BY id")).rows;
      assert.deepEqual(jobs,[{id:jobId}]);
    });
    assert.equal(await processOneAssessment(pool,{async assess(){send({type:'claimed',runId,jobId,pid:process.pid});await new Promise(()=>{});}}, {schema}),true);
  }finally{await pool.end();}
}
if(process.send && process.argv.length===4){
  // A listener keeps the IPC channel alive while the deliberately held adapter has no timer.
  process.on('message',()=>{});
  process.once('disconnect',()=>process.exit(1));
  holdSyntheticAssessment(process.env,{runId:process.argv[2],jobId:process.argv[3],send:message=>process.send(message)}).catch(()=>{process.send?.({type:'failed'});process.exit(1);});
}
