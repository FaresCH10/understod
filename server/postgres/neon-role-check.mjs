import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withTransaction} from './db.mjs';
import {runtimeTablePolicy,verifyRuntimePermissions} from './runtime-permissions.mjs';

const quote=value=>'"'+value.replaceAll('"','""')+'"';
export function neonTestRoles(runId){
  if(typeof runId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId))throw Error('Invalid synthetic role identity');
  const suffix=runId.replaceAll('-','');return ['understood_test_rt_'+suffix,'understood_test_denied_'+suffix];
}
// Hash only catalog state, never credentials; exclude this run's owned schema and roles.
async function outsideState(client,schema,roles){
  const queries=[
    ["SELECT oid,datacl::text FROM pg_database ORDER BY oid",[]],
    ["SELECT oid,nspacl::text FROM pg_namespace WHERE nspname<>$1 ORDER BY oid",[schema]],
    ["SELECT c.oid,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname<>$1 ORDER BY c.oid",[schema]],
    ["SELECT p.oid,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname<>$1 ORDER BY p.oid",[schema]],
    ["SELECT d.* FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IS DISTINCT FROM $1 ORDER BY d.oid",[schema]],
    ["SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles WHERE NOT rolname=ANY($1::text[]) ORDER BY oid",[roles]],
    ["SELECT m.* FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE NOT r.rolname=ANY($1::text[]) ORDER BY m.roleid,m.member,m.grantor",[roles]],
  ];
  const rows=[];for(const [sql,args] of queries)rows.push((await client.query(sql,args)).rows);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function ownSchema(client,schema,marker){
  const row=(await client.query("SELECT obj_description(oid,'pg_namespace') AS marker,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",[schema])).rows[0];
  const identity=(await client.query('SELECT current_user AS current,session_user AS session')).rows[0];
  assert.equal(identity.current,identity.session);assert.equal(row?.marker,marker);assert.equal(row?.owner,identity.current);
  return identity.current;
}
async function roleState(client,roles,markers){
  const rows=(await client.query("SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolcanlogin,rolconfig,rolvaliduntil,rolconnlimit,shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[roles])).rows;
  for(const row of rows){
    assert.equal(row.marker,markers[row.rolname]);
    for(const key of ['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','rolcanlogin'])assert.equal(row[key],false);
    assert.equal(row.rolconfig,null);assert.equal(row.rolvaliduntil,null);assert.equal(row.rolconnlimit,-1);
    assert.equal((await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1',[row.oid])).rows.length,0);
    assert.equal((await client.query("SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1 AND deptype='o' LIMIT 1",[row.oid])).rows.length,0);
  }
  return rows;
}
async function ownMemberships(client,roles,owner){
  const rows=(await client.query('SELECT m.*,pg_get_userbyid(m.member) AS member_name FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname=ANY($1::text[]) ORDER BY m.roleid,m.member,m.grantor',[roles])).rows;
  assert.ok(rows.every(row=>row.member_name===owner));return rows;
}
async function assumed(pool,role,fn){
  return withTransaction(pool,async client=>{await client.query(`SET LOCAL ROLE ${quote(role)}`);return fn(client);});
}
export async function checkNeonScopedRoles(pool,{schema,runId,checkpoint=async()=>{}}){
  const roles=neonTestRoles(runId),[runtime,denied]=roles,namespace=quote(schema),marker='Understood synthetic Neon rehearsal '+runId;
  assert.equal(schema,'understood_neon_test_'+runId.replaceAll('-',''));
  const markers=Object.fromEntries(roles.map(role=>[role,'Understood synthetic NOLOGIN '+runId]));
  const result={kind:'temporary-scoped-nologin',state:'checking',roles,checks:[],cleanup:'not-created',directLoginVerified:false,databaseWidePrivilegesVerified:false,productionVerdict:false};
  let baseline,owner,oids,memberships;
  const save=async phase=>{result.phase=phase;await checkpoint({...result,checks:[...result.checks]});};
  try{
    await save('role-preflight');
    await withTransaction(pool,async client=>{
      owner=await ownSchema(client,schema,marker);baseline=await outsideState(client,schema,roles);
      assert.equal((await client.query('SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])',[roles])).rows.length,0);
    });
    await save('role-creation');
    await withTransaction(pool,async client=>{
      await ownSchema(client,schema,marker);
      for(const role of roles){
        await client.query(`CREATE ROLE ${quote(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
        await client.query(`COMMENT ON ROLE ${quote(role)} IS '${markers[role]}'`);
        await client.query(`GRANT ${quote(role)} TO ${quote(owner)}`);
      }
      await client.query(`GRANT USAGE ON SCHEMA ${namespace} TO ${quote(runtime)}`);
      const policy=runtimeTablePolicy();
      for(const writable of [true,false])await client.query(`GRANT ${writable?'SELECT,INSERT,UPDATE,DELETE':'SELECT'} ON ${policy.filter(row=>row.writable===writable).map(row=>namespace+'.'+quote(row.table)).join(',')} TO ${quote(runtime)}`);
      const sequences=(await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 AND c.relkind='S' AND EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
        WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass
        AND d.deptype IN ('a','i') AND t.relnamespace=n.oid AND t.relname=ANY($2::text[]))`,[schema,policy.filter(row=>row.writable).map(row=>row.table)])).rows;
      for(const row of sequences)await client.query(`GRANT USAGE,SELECT ON SEQUENCE ${namespace}.${quote(row.relname)} TO ${quote(runtime)}`);
      assert.equal((await client.query('SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prosecdef',[schema])).rows.length,0);
      await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${namespace} TO ${quote(runtime)}`);
      oids=(await roleState(client,roles,markers)).map(row=>({name:row.rolname,oid:row.oid}));
      memberships=await ownMemberships(client,roles,owner);
      assert.equal(await outsideState(client,schema,roles),baseline);
    });
    result.cleanup='pending';await save('role-permission-checks');
    await withTransaction(pool,async client=>{
      const policy=runtimeTablePolicy(),permissions=(await client.query(`SELECT has_table_privilege($1,t.identifier,p.privilege) AS allowed,
        has_table_privilege($1,t.identifier,p.privilege||' WITH GRANT OPTION') AS delegated,
        (p.privilege='SELECT' OR t.writable AND p.privilege=ANY(ARRAY['INSERT','UPDATE','DELETE'])) AS expected
        FROM unnest($2::text[],$3::boolean[]) AS t(identifier,writable)
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p(privilege)`,
      [runtime,policy.map(row=>schema+'.'+row.table),policy.map(row=>row.writable)])).rows;
      assert.equal(permissions.length,policy.length*8);for(const row of permissions){assert.equal(row.allowed,row.expected);assert.equal(row.delegated,false);}
      const sequences=(await client.query(`SELECT c.oid,c.relname,EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
        WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
        AND t.relnamespace=n.oid AND t.relname=ANY($2::text[])) AS application FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 AND c.relkind='S'`,[schema,runtimeTablePolicy().filter(row=>row.writable).map(row=>row.table)])).rows;
      for(const row of sequences)for(const privilege of ['USAGE','SELECT','UPDATE']){
        const grants=(await client.query('SELECT has_sequence_privilege($1,$2::oid,$3) AS allowed,has_sequence_privilege($1,$2::oid,$4) AS delegated',[runtime,row.oid,privilege,privilege+' WITH GRANT OPTION'])).rows[0];
        assert.equal(grants.allowed,row.application && privilege!=='UPDATE');assert.equal(grants.delegated,false);
      }
    });result.checks.push('complete-runtime-table-policy-without-delegation');
    await assumed(pool,runtime,async client=>{
      await client.query("SELECT set_config('search_path',quote_ident($1)||',pg_catalog',true)",[schema]);
      assert.equal((await client.query(`SELECT count(*)::integer AS n FROM ${namespace}.workers`)).rows[0].n,2);
      await client.query(`INSERT INTO ${namespace}.workers(id,org_id,site_id,code,language) VALUES('role-fixture','a','a','role-test','en')`);
      assert.equal((await client.query(`UPDATE ${namespace}.workers SET language='ar' WHERE id='role-fixture'`)).rowCount,1);
      assert.equal((await client.query(`DELETE FROM ${namespace}.workers WHERE id='role-fixture'`)).rowCount,1);
      await client.query(`SELECT id FROM ${namespace}.assessment_jobs FOR UPDATE SKIP LOCKED`);
    });result.checks.push('assumed-runtime-read-crud-and-worker-row-lock');
    result.denials={};
    const reject=async(name,role,sql,code='42501')=>{
      await assert.rejects(assumed(pool,role,async client=>{await client.query("SELECT set_config('search_path',quote_ident($1)||',pg_catalog',true)",[schema]);return client.query(sql);}),error=>{if(error.code!==code)return false;result.denials[name]=code;return true;});
    };
    await reject('schemaCreate',runtime,`CREATE TABLE ${namespace}.forbidden(id integer)`);
    await reject('tableDrop',runtime,`DROP TABLE ${namespace}.workers`);
    await reject('truncate',runtime,`TRUNCATE ${namespace}.audit`);
    for(const {table,writable} of runtimeTablePolicy())if(!writable)await reject('maintenance:'+table,runtime,`DELETE FROM ${namespace}.${quote(table)} WHERE false`);
    await reject('noSchemaAccess',denied,`SELECT * FROM ${namespace}.workers`);
    await reject('frozenPublication',runtime,`UPDATE ${namespace}.publications SET snapshot_json='{}'`,'23514');
    await reject('immutableAudit',runtime,`UPDATE ${namespace}.audit SET action='forged'`,'23514');
    await reject('sequenceRewrite',runtime,`SELECT setval('${schema}.submission_receipts_sequence_seq',100)`);
    await withTransaction(pool,client=>client.query(`CREATE TABLE ${namespace}.future_role_evidence(id integer)`));
    await reject('futureTable',runtime,`SELECT * FROM ${namespace}.future_role_evidence`);
    result.checks.push('schema-ddl-truncate-maintenance-and-ungranted-role-denied','runtime-cannot-rewrite-frozen-publication-or-audit');
    // SET ROLE is test instrumentation, not a production connection. The direct-login gate must reject it.
    await assumed(pool,runtime,async client=>{
      const wrapped={async connect(){return {query:async(sql,args)=>sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'?{rows:[]}:client.query(sql,args),release(){}};}};
      await assert.rejects(verifyRuntimePermissions(wrapped,{schema,role:runtime}),/Runtime must connect directly/);
    });result.checks.push('production-direct-login-gate-still-rejects-assumed-role');
    result.state='passed';
  }catch(error){result.state='failed';result.failedPhase=result.phase;result.error='Scoped role rehearsal did not pass.';if(/^[0-9A-Z]{5}$/.test(error?.code||''))result.sqlState=error.code;}
  finally{
    try{
      await save('role-cleanup');
      await withTransaction(pool,async client=>{
        const rows=await roleState(client,roles,markers);
        if(!rows.length){result.cleanup='absent';return;}
        assert.equal(rows.length,2);await ownSchema(client,schema,marker);
        if(oids)assert.deepEqual(rows.map(row=>({name:row.rolname,oid:row.oid})),oids);
        const currentMemberships=await ownMemberships(client,roles,owner);if(memberships)assert.deepEqual(currentMemberships,memberships);
        assert.equal(await outsideState(client,schema,roles),baseline);
        for(const role of roles){
          const target=quote(role);
          await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${namespace} FROM ${target}`);
          await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${namespace} FROM ${target}`);
          await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${namespace} FROM ${target}`);
          await client.query(`REVOKE ALL ON SCHEMA ${namespace} FROM ${target}`);
          await client.query(`REVOKE ${target} FROM ${quote(owner)}`);
          await client.query(`DROP ROLE ${target}`);
        }
        assert.equal((await client.query('SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])',[roles])).rows.length,0);
        assert.equal(await outsideState(client,schema,roles),baseline);result.cleanup='verified-removed';result.outsideAclAndRolesUnchanged=true;
      });
    }catch{result.cleanup='refused-or-unverified';}
    if(!['absent','verified-removed'].includes(result.cleanup))result.state='failed';
    await save('role-finished');
  }
  return result;
}
