import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {neonTestConnection} from './neon-test-config.mjs';
import {checkNeonTestDatabase} from './neon-preflight.mjs';
import {runMigrations,verifyMigrations} from './migrate.mjs';
import {withTransaction} from './db.mjs';
import {domainTransaction,publish,submitAnswer} from './domain.mjs';
import {processOneAssessment} from './assessment-worker.mjs';
import {syntheticAssessmentAdapter} from './runtime.mjs';
import {getProcessingProvenance} from './processing-provenance.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../domain.mjs';
import {checkNeonScopedRoles} from './neon-role-check.mjs';
import {checkNeonConcurrency} from './neon-concurrency-check.mjs';
const outsideSql=`SELECT 'schema' AS kind,n.nspname AS namespace,'' AS name,n.oid::text AS identity FROM pg_namespace n
  WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND n.nspname<>$1
  UNION ALL SELECT c.relkind::text,n.nspname,c.relname,c.oid::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND n.nspname<>$1
  UNION ALL SELECT 'function',n.nspname,p.proname,p.oid::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND n.nspname<>$1
  UNION ALL SELECT 'type',n.nspname,t.typname,t.oid::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND n.nspname<>$1
  ORDER BY kind,namespace,name,identity`;
export function neonRehearsalSchema(runId){
  if(typeof runId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId))throw Error('Invalid synthetic Neon run identity');
  return 'understood_neon_test_'+runId.replaceAll('-','');
}
async function outsideFingerprint(pool,schema){return createHash('sha256').update(JSON.stringify((await pool.query(outsideSql,[schema])).rows)).digest('hex');}
export async function rehearseNeonDatabase(env,{runId=randomUUID(),makePool,preflight=checkNeonTestDatabase,checkpoint=async()=>{},temporaryNologinRoles=false,extendedConcurrency=false,interruptAssessment}={}){
  const schema=neonRehearsalSchema(runId),marker='Understood synthetic Neon rehearsal '+runId,config=neonTestConnection(env);
  const result={runId,schema,kind:'isolated-synthetic-database',state:'checking',checks:[],cleanup:'not-created',productionVerdict:false,providerCalls:0,realDataUsed:false};
  let pool,baseline,failed=false;
  const save=async phase=>{result.phase=phase;await checkpoint({...result,checks:[...result.checks]});};
  try{
    await save('preflight');const verified=await preflight(env,{makePool});if(verified.passed!==true || verified.databaseWrites!==0)throw Error('Neon preflight required');
    result.targetFingerprint=verified.targetFingerprint;result.postgresMajor=verified.postgresMajor;result.checks.push('verified-tls-empty-target');
    if(!makePool){const pg=await import('pg');makePool=value=>new pg.Pool(value);}
    pool=makePool(config);pool.on?.('error',()=>{failed=true;});baseline=await outsideFingerprint(pool,schema);
    await save('schema-creation');
    await withTransaction(pool,async client=>{await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`COMMENT ON SCHEMA "${schema}" IS '${marker}'`);});
    result.cleanup='pending';await save('migrations');
    const options={schema,integrationMode:'synthetic'},applied=await runMigrations(pool,options),verifiedMigrations=await verifyMigrations(pool,options);
    assert.equal(applied.length,verifiedMigrations.migrations);assert.equal((await runMigrations(pool,options)).length,0);
    result.migrationsApplied=applied.length;result.checks.push('migration-checksums-and-exact-replay');await save('synthetic-fixture');
    const owner={principal_type:'staff',principal_id:'owner',org_id:'a',site_id:'a',role:'owner'},worker={principal_type:'worker',principal_id:'worker',org_id:'a',site_id:'a'};
    await domainTransaction(pool,schema,async client=>{
      await client.query("INSERT INTO organizations(id,name) VALUES('a','Synthetic A'),('b','Synthetic B')");
      await client.query("INSERT INTO sites(id,org_id,name,timezone) VALUES('a','a','Synthetic site A','UTC'),('b','b','Synthetic site B','UTC')");
      await client.query("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','a','a','Synthetic owner','owner'),('auditor','a','a','Synthetic auditor','auditor'),('foreign','b','b','Synthetic foreign owner','owner')");
      await client.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','a','a','001','en'),('foreign-worker','b','b','002','en')");
      await client.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('briefing','a','a','Synthetic Neon rehearsal',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
    });
    await save('concurrent-publication');
    const request={requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['worker']},published=await Promise.all([publish(pool,owner,'briefing',request,options),publish(pool,owner,'briefing',request,options)]);
    assert.equal(published[0].id,published[1].id);assert.equal(published.filter(value=>!value.duplicate).length,1);result.checks.push('concurrent-publication-exactly-once');
    const assignment=await domainTransaction(pool,schema,async client=>(await client.query('SELECT id FROM assignments WHERE publication_id=$1',[published[0].id])).rows[0].id);
    await save('concurrent-submission');
    const submission=randomUUID(),answer='Finished items on the blue shelf; unfinished items on the yellow shelf.',received=await Promise.all([submitAnswer(pool,worker,assignment,submission,answer,options),submitAnswer(pool,worker,assignment,submission,answer,options)]);
    assert.equal(received[0].id,received[1].id);assert.equal(received.filter(value=>!value.duplicate).length,1);result.checks.push('concurrent-submission-exactly-once');
    await save('concurrent-assessment');
    const checked=await Promise.all([processOneAssessment(pool,syntheticAssessmentAdapter,options),processOneAssessment(pool,syntheticAssessmentAdapter,options)]);
    assert.equal(checked.filter(Boolean).length,1);
    const job=await domainTransaction(pool,schema,async client=>{
      result.committedCounts={};
      for(const table of ['publications','publication_requests','assignments','attempts','submission_receipts','assessment_jobs']){const count=(await client.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows[0].n;assert.equal(count,1);result.committedCounts[table]=count;}
      const attempt=(await client.query('SELECT outcome,assessment_status FROM attempts')).rows[0];assert.equal(attempt.outcome,'matched');assert.equal(attempt.assessment_status,'complete');
      assert.equal((await client.query("SELECT count(*)::integer AS n FROM audit WHERE action='answer.checked'")).rows[0].n,1);
      return (await client.query('SELECT id FROM assessment_jobs')).rows[0];
    });result.checks.push('concurrent-claimed-assessment-exactly-once');
    await save('scope-and-immutability');
    result.denials={};
    const denial=(name,code)=>error=>{if(error.code!==code)return false;result.denials[name]=code;return true;};
    await assert.rejects(domainTransaction(pool,schema,client=>client.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('forged','a','a',$1,'foreign-worker','en')",[published[0].id])),denial('foreignKey','23503'));
    await assert.rejects(domainTransaction(pool,schema,client=>client.query("UPDATE publications SET snapshot_json='{}' WHERE id=$1",[published[0].id])),denial('publication','23514'));
    await assert.rejects(domainTransaction(pool,schema,client=>client.query("UPDATE audit SET action='forged'")),denial('audit','23514'));
    const history=await getProcessingProvenance(pool,owner,'answer_check:'+job.id,{},options);assert.equal(history.publicationId,published[0].id);assert.equal(history.publicationVersion,1);assert.equal(history.assignmentId,assignment);assert.equal(history.total,0);
    assert.equal((await getProcessingProvenance(pool,{...owner,principal_id:'auditor',role:'auditor'},'answer_check:'+job.id,{},options)).total,0);
    await assert.rejects(getProcessingProvenance(pool,{...owner,principal_id:'foreign',org_id:'b',site_id:'b'},'answer_check:'+job.id,{},options),error=>error.message==='Processing job unavailable');
    result.denials.foreignReader='unavailable';
    result.checks.push('cross-tenant-foreign-key-and-reader-denial','immutable-publication-and-audit','exact-publication-provider-history-without-invented-journal');
    if(temporaryNologinRoles===true){
      await save('temporary-nologin-roles');
      result.roles=await checkNeonScopedRoles(pool,{schema,runId,checkpoint:async value=>{result.roles=value;await save('temporary-nologin-roles');}});
      assert.equal(result.roles.state,'passed');assert.equal(result.roles.cleanup,'verified-removed');result.checks.push('scoped-nologin-permissions-and-verified-role-cleanup');
    }
    if(extendedConcurrency===true){
      result.committedCountsPhase='after-core-assessment-before-extension';await save('extended-concurrency');
      result.concurrency=await checkNeonConcurrency(pool,{schema,runId,owner,worker,publicationId:published[0].id,interruptAssessment,checkpoint:async value=>{result.concurrency=value;await save('extended-concurrency');}});
      assert.equal(result.concurrency.state,'passed');result.checks.push('extended-auth-retry-lease-billing-withdrawal-concurrency');
    }
    assert.equal(failed,false);assert.equal(await outsideFingerprint(pool,schema),baseline);result.outsideCatalogIdentitiesUnchanged=true;result.state='passed';
  }catch(error){result.failedPhase=result.phase;result.state='failed';result.error='Synthetic database rehearsal did not pass. Inspect phase and guarded cleanup state.';if(/^[0-9A-Z]{5}$/.test(error?.code || ''))result.sqlState=error.code;}
  finally{
    if(pool){
      try{
        await save('cleanup');
        const rows=(await pool.query("SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname=$1",[schema])).rows;
        if(!rows.length)result.cleanup='absent';
        else if(rows[0].marker!==marker || await outsideFingerprint(pool,schema)!==baseline)result.cleanup='refused-scope-change';
        else{await pool.query(`DROP SCHEMA "${schema}" CASCADE`);assert.equal((await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rows.length,0);result.cleanup='verified-removed';result.outsideCatalogIdentitiesUnchanged=await outsideFingerprint(pool,schema)===baseline;}
      }catch{result.cleanup='unverified';}
      await pool.end();
    }
    if(!['not-created','absent','verified-removed'].includes(result.cleanup) || result.state==='passed' && result.outsideCatalogIdentitiesUnchanged!==true)result.state='failed';
    await save('finished');
  }
  return result;
}
