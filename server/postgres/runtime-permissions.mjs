import {schemaName} from './migrate.mjs';
import {withTransaction} from './db.mjs';
import {withBackupSnapshot} from './backup.mjs';

const tables=`organizations sites staff workers crews crew_memberships briefings publications assignments attempts clarifications jobs
worker_grants sessions staff_credentials auth_attempts audit recordings submission_receipts report_exports worker_imports sqlite_import_runs
assessment_jobs publication_requests help_requests publication_withdrawals directory_reactivations briefing_copies briefing_archives
invoices invoice_payments invoice_voids organization_settings site_settings settings_requests draft_reviews briefing_review_requests
templates template_versions template_requests glossary_terms glossary_versions glossary_requests staff_access_revisions staff_access_requests
staff_recovery_mail staff_recovery_tokens staff_accounts staff_account_memberships staff_invitations staff_invitation_tokens staff_invitation_mail
staff_invitation_requests staff_invitation_acceptances generated_bundles generated_audio briefing_regeneration_requests preparation_stage_events
retention_policies retention_requests recording_purges worker_deletion_requests worker_deletion_redactions worker_deletion_pseudonyms
worker_deletion_completions notification_reads publication_schedules recording_notices recording_notice_requests assignment_reminders draft_creations
source_audio_requests source_audio_purges source_audio_retries briefing_language_requests pilot_inquiries site_onboarding onboarding_requests
platform_operators operator_sessions tenant_controls system_controls operator_requests operator_audit worker_health provider_policies provider_operations
provider_requests provider_verifications storage_probes workspace_bootstraps site_creations site_access_controls site_access_requests site_lifecycle
site_lifecycle_requests case_routing case_messages case_followups case_followup_audio case_repeats case_reviews case_voice preparation_authorities
generated_bundle_operations text_retention_policies text_retention_requests text_retention_purges restore_privacy_retirements case_retention_policies
case_retention_requests case_content_purges generated_retention_policies generated_retention_requests generated_audio_retirements generated_audio_removals
restore_access_restrictions publication_report_audience usage_change_requests activity_retention_policies activity_retention_requests activity_identity_purges
briefing_retention_policies briefing_retention_requests briefing_content_purges restore_briefing_redactions restore_activity_redactions
operational_audit_receipts briefing_content_origins schema_migrations`.split(/\s+/);
const known=new Set(tables),maintenance=new Set(['schema_migrations','sqlite_import_runs','workspace_bootstraps',...tables.filter(name=>name.startsWith('restore_'))]);
const quote=value=>'"'+value.replaceAll('"','""')+'"';
export const runtimeRoleName=value=>{
  if(typeof value!=='string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(value) || value.startsWith('pg_'))throw Error('Invalid dedicated runtime role');
  return value;
};

async function roleAdmission(client,role){
  const row=(await client.query(`SELECT oid,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolcanlogin
    FROM pg_roles WHERE rolname=$1`,[role])).rows[0];
  if(!row || !row.rolcanlogin || row.rolsuper || row.rolcreaterole || row.rolcreatedb || row.rolreplication || row.rolbypassrls)
    throw Error('Use an existing unprivileged dedicated login role');
  // Reject even NOINHERIT memberships: SET ROLE could still reach another authority.
  if((await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1',[row.oid])).rows.length)
    throw Error('Runtime role must not have role memberships');
  if((await client.query(`SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1 AND deptype='o' LIMIT 1`,[row.oid])).rows.length)
    throw Error('Runtime role must not own database objects');
  return row;
}

async function catalog(client,schema){
  const rows=(await client.query(`SELECT c.oid,c.relname AS name,c.relkind,n.nspname AS schema,
    quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS identifier
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname COLLATE "C"`,[schema])).rows;
  const present=new Set(rows.filter(row=>['r','p'].includes(row.relkind)).map(row=>row.name));
  if(tables.some(name=>!present.has(name)))throw Error('Runtime permission policy requires the current complete application schema');
  return rows;
}

async function inspect(client,{schema,role}){
  await roleAdmission(client,role);
  if(!(await client.query(`SELECT has_database_privilege($1,current_database(),'CONNECT') AS connect,
    has_database_privilege($1,current_database(),'CREATE') AS create,
    has_database_privilege($1,current_database(),'TEMPORARY') AS temporary,
    has_database_privilege($1,current_database(),'CONNECT WITH GRANT OPTION') AS delegate`,[role])).rows.every(row=>row.connect===true && row.create===false && row.temporary===false && row.delegate===false))
    throw Error('Runtime database privileges are unsafe');
  if((await client.query(`SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'
    AND has_schema_privilege($1,oid,'CREATE') LIMIT 1`,[role])).rows.length)
    throw Error('Runtime must not create objects in any application schema');
  if(!(await client.query("SELECT has_schema_privilege($1,$2,'USAGE') AS allowed",[role,schema])).rows[0]?.allowed)
    throw Error('Runtime schema usage unavailable');
  const objects=await catalog(client,schema);
  const invalidTable=(await client.query(`WITH permissions AS (
    SELECT c.oid,p.privilege,CASE WHEN p.privilege='SELECT' THEN c.relname=ANY($3::text[])
      WHEN p.privilege IN ('INSERT','UPDATE','DELETE') THEN c.relname=ANY($3::text[]) AND NOT c.relname=ANY($4::text[]) AND c.relkind IN ('r','p')
      ELSE false END AS expected
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p(privilege)
    WHERE n.nspname=$2 AND c.relkind IN ('r','p','v','m','f'))
    SELECT 1 FROM permissions WHERE has_table_privilege($1,oid,privilege) IS DISTINCT FROM expected
      OR has_table_privilege($1,oid,privilege||' WITH GRANT OPTION')
      OR CASE WHEN privilege IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        has_any_column_privilege($1,oid,privilege) IS DISTINCT FROM expected
        OR has_any_column_privilege($1,oid,privilege||' WITH GRANT OPTION') ELSE false END LIMIT 1`,[role,schema,tables,[...maintenance]])).rows.length;
  if(invalidTable)throw Error('Runtime table or column privileges do not match policy');
  for(const row of objects){
    if(row.relkind==='S'){
      const state=(await client.query(`SELECT has_sequence_privilege($1,$2::oid,'USAGE') AS usage,
        has_sequence_privilege($1,$2::oid,'SELECT') AS read,has_sequence_privilege($1,$2::oid,'UPDATE') AS write,
        (has_sequence_privilege($1,$2::oid,'USAGE WITH GRANT OPTION') OR has_sequence_privilege($1,$2::oid,'SELECT WITH GRANT OPTION')) AS delegate`,[role,row.oid])).rows[0];
      const applicationSequence=(await client.query(`SELECT 1 FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
        JOIN pg_namespace n ON n.oid=t.relnamespace WHERE d.classid='pg_class'::regclass AND d.objid=$1
        AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') AND n.nspname=$2 AND t.relname=ANY($3::text[])`,[row.oid,schema,tables.filter(name=>!maintenance.has(name))])).rows.length>0;
      if(state.write || state.delegate || state.usage!==applicationSequence || state.read!==applicationSequence)
        throw Error('Runtime sequence privileges do not match policy');
      continue;
    }
  }
  // An executable definer function is an independent route around ordinary ACLs.
  if((await client.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prosecdef
    AND has_function_privilege($1,p.oid,'EXECUTE') LIMIT 1`,[role])).rows.length)
    throw Error('Executable security-definer routines require separate review');
  if((await client.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$2
    AND (NOT has_function_privilege($1,p.oid,'EXECUTE') OR has_function_privilege($1,p.oid,'EXECUTE WITH GRANT OPTION')) LIMIT 1`,[role,schema])).rows.length)
    throw Error('Runtime function privileges do not match policy');
  if((await client.query(`SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1))
      AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname=$2))
      AND (d.defaclobjtype IN ('r','S','f') OR a.is_grantable) LIMIT 1`,[role,schema])).rows.length)
    throw Error('Automatic future runtime grants require separate review');
  return {role,schema,writableTables:tables.length-maintenance.size,readOnlyTables:maintenance.size,restricted:true,productionReady:false};
}

export async function inspectSourceRuntimeFence(client,{schema,roles}){
  schemaName(schema);
  if(!Array.isArray(roles) || !roles.length || roles.length>16 || new Set(roles).size!==roles.length)throw Error('List every distinct source API/worker runtime role');
  for(const role of roles){
    runtimeRoleName(role);await roleAdmission(client,role);
    const database=(await client.query(`SELECT has_database_privilege($1,current_database(),'CREATE') AS create,
      has_database_privilege($1,current_database(),'TEMPORARY') AS temporary`,[role])).rows[0];
    if(database.create || database.temporary || (await client.query(`SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
      AND nspname<>'information_schema' AND has_schema_privilege($1,oid,'CREATE') LIMIT 1`,[role])).rows.length)
      throw Error('Source runtime has object-creation authority');
    if((await client.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname<>'information_schema' AND p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE') LIMIT 1`,[role])).rows.length)
      throw Error('Source runtime has independent definer authority');
    await catalog(client,schema);
    if((await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind='S'
      AND (has_sequence_privilege($1,c.oid,'USAGE') OR has_sequence_privilege($1,c.oid,'UPDATE')) LIMIT 1`,[role,schema])).rows.length)
      throw Error('Source runtime sequence is not fenced');
    if((await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p(privilege)
      WHERE n.nspname=$2 AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege($1,c.oid,p.privilege)
        OR CASE WHEN p.privilege IN ('INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege($1,c.oid,p.privilege) ELSE false END) LIMIT 1`,[role,schema])).rows.length)
      throw Error('Source runtime table or column is not fenced');
    if((await client.query(`SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1)) AND (d.defaclnamespace=0 OR
        d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname=$2)) AND d.defaclobjtype IN ('r','S','f') LIMIT 1`,[role,schema])).rows.length)
      throw Error('Source runtime has automatic future authority');
  }
  return {runtimeRoles:roles.length,runtimeWriteFenceVerified:true,maintenanceWritersMustRemainStopped:true,
    sourceCutoffEstablished:false,activationAllowed:false,productionReady:false};
}

// ACL revocation commits permanently; stopping a process or holding a snapshot alone does not.
export async function fenceSourceRuntime(pool,{schema='public',roles,writersStopped=false}={}){
  schemaName(schema);
  if(!Array.isArray(roles) || !roles.length || roles.length>16 || new Set(roles).size!==roles.length)throw Error('List every distinct source API/worker runtime role');
  roles.forEach(runtimeRoleName);
  return withBackupSnapshot(pool,{schema,writersStopped},async(_snapshot,client)=>{
    const identity=(await client.query('SELECT current_user AS current,session_user AS session')).rows[0];
    if(identity.current!==identity.session || roles.includes(identity.current))throw Error('Fence requires a separate directly connected maintenance owner');
    for(const role of roles)await inspect(client,{schema,role});
    for(const role of roles){
      const target=quote(role),namespace=quote(schema);
      await client.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON ALL TABLES IN SCHEMA ${namespace} FROM ${target}`);
      await client.query(`REVOKE USAGE,UPDATE ON ALL SEQUENCES IN SCHEMA ${namespace} FROM ${target}`);
    }
    return inspectSourceRuntimeFence(client,{schema,roles});
  });
}

export async function verifyRuntimePermissions(pool,{schema='public',role}={}){
  schemaName(schema);if(role!==undefined)runtimeRoleName(role);
  return withTransaction(pool,async client=>{
    await client.query('SET TRANSACTION READ ONLY');
    const identity=(await client.query('SELECT current_user AS current,session_user AS session')).rows[0];
    if(role===undefined)role=runtimeRoleName(identity.session);
    if(identity.current!==identity.session || identity.session!==role)throw Error('Runtime must connect directly as its dedicated role');
    return inspect(client,{schema,role});
  });
}

export async function configureRuntimePermissions(pool,{schema='public',role,dedicatedDatabase=false,writersStopped=false}={}){
  schemaName(schema);runtimeRoleName(role);
  if(dedicatedDatabase!==true || writersStopped!==true)throw Error('Confirm a dedicated database and stopped writers before permission setup');
  return withTransaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`understood:migrations:${schema}`]);
    await roleAdmission(client,role);
    const identity=(await client.query('SELECT current_user AS current,session_user AS session,current_database() AS database')).rows[0];
    if(identity.current===role || identity.current!==identity.session)throw Error('Use a separate directly connected maintenance owner');
    const objects=await catalog(client,schema),target=quote(role),namespace=quote(schema),database=quote(identity.database);
    await client.query(`REVOKE CREATE,TEMPORARY ON DATABASE ${database} FROM PUBLIC,${target}`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${target}`);
    await client.query(`REVOKE ALL ON SCHEMA ${namespace} FROM ${target}`);
    await client.query(`REVOKE CREATE ON SCHEMA ${namespace} FROM PUBLIC`);
    await client.query(`GRANT USAGE ON SCHEMA ${namespace} TO ${target}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${namespace} FROM PUBLIC,${target}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${namespace} FROM PUBLIC,${target}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${namespace} FROM ${target}`);
    for(const row of objects){
      if(row.relkind==='S'){
        const owned=(await client.query(`SELECT t.relname AS name FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
          JOIN pg_namespace n ON n.oid=t.relnamespace WHERE d.classid='pg_class'::regclass AND d.objid=$1
          AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') AND n.nspname=$2`,[row.oid,schema])).rows;
        if(owned.some(value=>known.has(value.name) && !maintenance.has(value.name)))await client.query(`GRANT USAGE,SELECT ON SEQUENCE ${row.identifier} TO ${target}`);
      }else if(known.has(row.name))await client.query(`GRANT ${maintenance.has(row.name)?'SELECT':'SELECT,INSERT,UPDATE,DELETE'} ON TABLE ${row.identifier} TO ${target}`);
    }
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${namespace} TO ${target}`);
    // Never automatically grant a newly migrated or unrelated future table.
    for(const kind of ['TABLES','SEQUENCES']){
      await client.query(`ALTER DEFAULT PRIVILEGES REVOKE ALL ON ${kind} FROM PUBLIC,${target}`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${namespace} REVOKE ALL ON ${kind} FROM PUBLIC,${target}`);
    }
    await client.query(`ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM PUBLIC,${target}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${namespace} REVOKE ALL ON FUNCTIONS FROM PUBLIC,${target}`);
    return inspect(client,{schema,role});
  });
}
