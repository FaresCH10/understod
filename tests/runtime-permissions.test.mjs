import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions,verifyRuntimePermissions,runtimeRoleName,fenceSourceRuntime,inspectSourceRuntimeFence} from '../server/postgres/runtime-permissions.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
import {databaseInventory} from '../server/postgres/backup.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {runRehearsalWorker} from '../server/postgres/runtime.mjs';

const schema='runtime_permissions_test',role='understood_runtime_test';
async function fixture(){
  const db=new PGlite(),pool={async connect(){return {async query(sql,args){
    if(sql==='SELECT pg_export_snapshot() AS id')return {rows:[{id:'embedded-not-native-snapshot'}]};
    return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog;CREATE ROLE ${role} LOGIN;CREATE ROLE runtime_other`);
  await runMigrations(pool,{schema});
  await db.exec(`INSERT INTO organizations VALUES('org','Synthetic');INSERT INTO sites VALUES('site','org','Synthetic','UTC');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','org','site','Synthetic','en');
    INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','Synthetic','Synthetic source','ready');
    INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','org','site','brief',1,'{}','published');
    INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','org','site','pub','worker','en');
    CREATE TABLE future_evidence(id text);CREATE SEQUENCE future_sequence;`);
  const configure=()=>configureRuntimePermissions(pool,{schema,role,dedicatedDatabase:true,writersStopped:true});
  const runtime=()=>db.exec(`SET SESSION AUTHORIZATION ${role};SET search_path TO ${schema},pg_catalog`);
  const owner=async()=>{await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');assert.equal((await db.query('SELECT current_user AS name')).rows[0].name,'postgres');};
  return {db,pool,configure,runtime,owner,async close(){await db.close();}};
}

test('dedicated runtime role keeps actual accepted-input writes but cannot migrate, truncate, forge restore journals or delegate authority',async()=>{
  const f=await fixture();try{
    const configured=await f.configure();assert.equal(configured.restricted,true);assert.equal(configured.productionReady,false);
    await f.runtime();assert.deepEqual(await verifyRuntimePermissions(f.pool,{schema,role}),configured);
    await f.db.query("UPDATE organizations SET name='Synthetic changed' WHERE id='org'");
    await submitAnswer(f.pool,{principal_type:'worker',principal_id:'worker',org_id:'org',site_id:'site'},'assignment','accepted','Finished items go on blue, unfinished on yellow.',{schema});
    assert.equal((await f.db.query('SELECT sequence::text AS sequence FROM submission_receipts')).rows[0].sequence,'1');
    for(const sql of [
      'CREATE TABLE runtime_ddl(id text)','CREATE TEMP TABLE runtime_shadow(id text)','CREATE SCHEMA runtime_escape',
      'ALTER TABLE organizations DISABLE TRIGGER ALL','DROP TABLE organizations','TRUNCATE organizations',
      "INSERT INTO schema_migrations(version,checksum) VALUES('forged','forged')",
      'DELETE FROM restore_access_restrictions','UPDATE sqlite_import_runs SET checksum=checksum',
      'SELECT * FROM future_evidence',"SELECT nextval('future_sequence')", "SELECT setval('submission_receipts_sequence_seq',100)",
      'CREATE ROLE runtime_escalation SUPERUSER',"SET session_replication_role='replica'",
    ])await assert.rejects(f.db.exec(sql),/permission denied|must be owner|not permitted|does not exist/i,sql);
    await f.db.exec(`GRANT SELECT ON organizations TO runtime_other`);
    assert.equal((await f.db.query("SELECT has_table_privilege('runtime_other','organizations','SELECT') AS allowed")).rows[0].allowed,false);
    await assert.rejects(f.db.exec("UPDATE publications SET snapshot_json='{\"forged\":true}'"),/immutable/);
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM submission_receipts')).rows[0].count,1);
    await f.owner();await f.db.exec('CREATE TABLE later_evidence(id text)');await f.runtime();
    await assert.rejects(f.db.query('SELECT * FROM later_evidence'),/permission denied/);
    assert.equal((await verifyRuntimePermissions(f.pool,{schema})).restricted,true);
  }finally{await f.close();}
});

test('permission setup is explicit, atomic and rejects privileged/member/owner/missing roles without altering business rows',async()=>{
  const f=await fixture();try{
    await assert.rejects(configureRuntimePermissions(f.pool,{schema,role}),/Confirm/);
    for(const value of ['runtime;DROP TABLE organizations','pg_shadow','Runtime',''])assert.throws(()=>runtimeRoleName(value),/Invalid/);
    await assert.rejects(configureRuntimePermissions(f.pool,{schema,role:'missing',dedicatedDatabase:true,writersStopped:true}),/unprivileged/);
    await f.db.exec(`ALTER ROLE ${role} CREATEDB`);await assert.rejects(f.configure(),/unprivileged/);
    await f.db.exec(`ALTER ROLE ${role} NOCREATEDB;CREATE ROLE runtime_group;GRANT runtime_group TO ${role}`);await assert.rejects(f.configure(),/memberships/);
    await f.db.exec(`REVOKE runtime_group FROM ${role};ALTER TABLE future_evidence OWNER TO ${role}`);await assert.rejects(f.configure(),/own database objects/);
    await f.db.exec('ALTER TABLE future_evidence OWNER TO postgres');
    await f.db.exec(`CREATE FUNCTION unsafe_definer() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::void'`);
    await assert.rejects(f.configure(),/security-definer/);
    // Failed setup rolled back the earlier PUBLIC TEMP revoke.
    assert.equal((await f.db.query(`SELECT has_database_privilege($1,current_database(),'TEMPORARY') AS allowed`,[role])).rows[0].allowed,true);
    await f.db.exec('DROP FUNCTION unsafe_definer()');await f.configure();await f.runtime();
    assert.equal((await f.db.query('SELECT name FROM organizations')).rows[0].name,'Synthetic');
  }finally{await f.close();}
});

test('runtime startup inspection rejects privilege drift, future automatic grants and impersonated owner sessions',async()=>{
  const f=await fixture();try{
    await f.configure();
    await assert.rejects(verifyRuntimePermissions(f.pool,{schema,role}),/connect directly/);
    for(const [grant,revoke] of [
      [`GRANT TRUNCATE ON organizations TO ${role}`,`REVOKE TRUNCATE ON organizations FROM ${role}`],
      [`GRANT MAINTAIN ON organizations TO ${role}`,`REVOKE MAINTAIN ON organizations FROM ${role}`],
      [`GRANT INSERT(version) ON schema_migrations TO ${role}`,`REVOKE INSERT(version) ON schema_migrations FROM ${role}`],
      [`GRANT SELECT ON organizations TO ${role} WITH GRANT OPTION`,`REVOKE GRANT OPTION FOR SELECT ON organizations FROM ${role}`],
      [`GRANT CREATE ON SCHEMA ${schema} TO PUBLIC`,`REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC`],
      [`GRANT TEMPORARY ON DATABASE postgres TO PUBLIC`,`REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC`],
      [`GRANT SELECT ON future_evidence TO ${role}`,`REVOKE SELECT ON future_evidence FROM ${role}`],
      [`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${role}`,`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE SELECT ON TABLES FROM ${role}`],
    ]){
      await f.db.exec(grant);await f.runtime();await assert.rejects(verifyRuntimePermissions(f.pool,{schema,role}));await f.owner();await f.db.exec(revoke);
    }
    await f.db.exec(`SET ROLE ${role}`);await assert.rejects(verifyRuntimePermissions(f.pool,{schema,role}),/connect directly/);await f.db.exec('RESET ROLE');
    await f.runtime();assert.equal((await verifyRuntimePermissions(f.pool,{schema})).restricted,true);
  }finally{await f.close();}
});

test('source fence persists after commit, blocks real submission acceptance and worker mutation, and never changes business inventory or activates a target',async()=>{
  const f=await fixture();try{
    await f.configure();await f.db.exec("INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true)");
    await f.db.exec('CREATE ROLE understood_worker_test LOGIN');
    await configureRuntimePermissions(f.pool,{schema,role:'understood_worker_test',dedicatedDatabase:true,writersStopped:true});
    const inventory=()=>withTransaction(f.pool,client=>databaseInventory(client,schema));
    const before=await inventory();
    await assert.rejects(fenceSourceRuntime(f.pool,{schema,roles:[role],writersStopped:false}),/Stop all/);
    await assert.rejects(withTransaction(f.pool,client=>inspectSourceRuntimeFence(client,{schema,roles:[role]})),/not fenced/);
    const result=await fenceSourceRuntime(f.pool,{schema,roles:[role,'understood_worker_test'],writersStopped:true});assert.equal(result.runtimeRoles,2);
    assert.equal(result.runtimeWriteFenceVerified,true);assert.equal(result.sourceCutoffEstablished,false);assert.equal(result.activationAllowed,false);
    assert.deepEqual(await inventory(),before);
    await f.runtime();await assert.rejects(verifyRuntimePermissions(f.pool,{schema,role}),/privileges/);
    await assert.rejects(runRehearsalWorker(f.pool,{}, {schema,runtimePermissionsRequired:true}),/privileges/);
    await assert.rejects(submitAnswer(f.pool,{principal_type:'worker',principal_id:'worker',org_id:'org',site_id:'site'},'assignment','after-fence','Synthetic answer',{schema}),/permission denied/);
    await assert.rejects(f.db.query("INSERT INTO worker_health(id,state,seen_at) VALUES('fenced-worker','idle',clock_timestamp())"),/permission denied/);
    await assert.rejects(f.db.query("UPDATE system_controls SET jobs_paused=false"),/permission denied/);
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM submission_receipts')).rows[0].count,0);
    assert.equal((await withTransaction(f.pool,client=>inspectSourceRuntimeFence(client,{schema,roles:[role]}))).runtimeWriteFenceVerified,true);
    await f.owner();assert.deepEqual(await inventory(),before);
    await f.db.exec(`SET SESSION AUTHORIZATION understood_worker_test`);
    await assert.rejects(f.db.query("UPDATE organizations SET name='Worker bypass'"),/permission denied/);
    await f.owner();assert.deepEqual(await inventory(),before);
    await assert.rejects(fenceSourceRuntime(f.pool,{schema,roles:[role],writersStopped:true}),/privileges/);
  }finally{await f.close();}
});

test('fence admission checks all roles and shutdown gates atomically; later privileged ACL changes invalidate live fence verification',async()=>{
  const f=await fixture();try{
    await f.configure();await f.db.exec("INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true)");
    await assert.rejects(fenceSourceRuntime(f.pool,{schema,roles:[role,'missing'],writersStopped:true}),/unprivileged/);
    await f.runtime();assert.equal((await verifyRuntimePermissions(f.pool,{schema,role})).restricted,true);await f.owner();
    await f.db.exec("UPDATE system_controls SET provider_paused=false");await assert.rejects(fenceSourceRuntime(f.pool,{schema,roles:[role],writersStopped:true}),/Pause jobs/);
    await f.db.exec("UPDATE system_controls SET provider_paused=true");
    await fenceSourceRuntime(f.pool,{schema,roles:[role],writersStopped:true});
    await f.db.exec(`GRANT INSERT(version) ON schema_migrations TO ${role}`);
    await assert.rejects(withTransaction(f.pool,client=>inspectSourceRuntimeFence(client,{schema,roles:[role]})),/column is not fenced/);
    await f.db.exec(`REVOKE INSERT(version) ON schema_migrations FROM ${role};GRANT USAGE ON SEQUENCE future_sequence TO ${role}`);
    await assert.rejects(withTransaction(f.pool,client=>inspectSourceRuntimeFence(client,{schema,roles:[role]})),/sequence is not fenced/);
  }finally{await f.close();}
});
