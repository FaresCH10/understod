import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {bootstrapWorkspace} from '../server/postgres/workspace-bootstrap.mjs';
import {authenticateStaff,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {getSettings} from '../server/postgres/settings.mjs';
import {getOnboarding} from '../server/postgres/onboarding.mjs';

const config={tier:'staging',aiMode:'synthetic',schema:'understood_stage_bootstrap',accessMode:'credential',integrationMode:'synthetic',dataClass:'synthetic'};
const input=()=>({requestId:randomUUID(),confirmed:true,synthetic:true,organizationName:'Synthetic workshop',siteName:'Synthetic site',timezone:'Asia/Beirut',
  generationLanguages:['ur','en','ar'],supportEmail:'support@example.test',owner:{name:'Synthetic owner',email:'owner@example.test',password:'Synthetic-password-only'}});

test('workspace bootstrap validates confirmation, scope and complete settings before database access',async()=>{
  const pool={connect(){assert.fail('Invalid bootstrap must not access database');}};
  for(const patch of [{confirmed:false},{synthetic:false},{siteName:''},{timezone:'invalid/timezone'},{generationLanguages:['ar']},
    {extra:'unknown'},{owner:{name:'Owner',email:'invalid',password:'short'}}])await assert.rejects(bootstrapWorkspace(pool,{...input(),...patch},config));
  for(const patch of [{schema:'public'},{tier:'production'},{tier:'local'},{aiMode:'live'},{accessMode:'demo'},{integrationMode:'live'},{dataClass:'real'}])await assert.rejects(bootstrapWorkspace(pool,input(),{...config,...patch}),/Synthetic/);
});

test('fresh workspace creates a usable isolated owner atomically, recovers exact retries and cannot take over existing accounts',async()=>{
  const db=new PGlite(),pool={async connect(){return {query:async(sql,values)=>values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
  try {
    await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog`);await runMigrations(pool,config);
    const value=input(),created=await bootstrapWorkspace(pool,value,config);assert.equal(created.duplicate,false);
    assert.deepEqual(await bootstrapWorkspace(pool,value,config),{...created,duplicate:true});
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM organizations')).rows[0].n,1);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM audit')).rows[0].n,1);
    const login=await authenticateStaff(pool,value.owner.email,value.owner.password,'synthetic-client',config);
    assert.equal(login.principal.role,'owner');assert.equal(login.principal.org_id,created.orgId);assert.equal(login.principal.site_id,created.siteId);
    const settings=await getSettings(pool,login.principal,config);assert.deepEqual(settings.site.generationLanguages,['en','ar','ur']);assert.equal(settings.site.primaryContact.id,created.ownerId);assert.equal(settings.organization.supportEmail,value.supportEmail);
    assert.equal((await getOnboarding(pool,login.principal,config)).revision,0);
    await assert.rejects(bootstrapWorkspace(pool,{...value,siteName:'Changed site'},config),/request conflict/);
    await assert.rejects(bootstrapWorkspace(pool,{...value,owner:{...value.owner,password:'Different-synthetic-password'}},config),/request conflict/);
    await assert.rejects(bootstrapWorkspace(pool,{...value,requestId:randomUUID()},config),/already registered/);
    const other=await bootstrapWorkspace(pool,{...input(),owner:{...value.owner,email:'other@example.test'}},config);assert.notEqual(other.orgId,created.orgId);
    await assert.rejects(getSettings(pool,{...login.principal,org_id:other.orgId,site_id:other.siteId},config),/Forbidden/);
    await assert.rejects(db.query('UPDATE workspace_bootstraps SET request_hash=$1 WHERE request_id=$2',['a'.repeat(64),value.requestId]),/immutable/);
    await assert.rejects(db.query('DELETE FROM workspace_bootstraps WHERE request_id=$1',[value.requestId]),/immutable/);
    await provisionStaffCredential(pool,{staffId:created.ownerId,orgId:created.orgId,siteId:created.siteId,email:value.owner.email,password:'Rotated-synthetic-password'},config);
    await assert.rejects(bootstrapWorkspace(pool,value,config),/request conflict/);
    await assert.rejects(authenticateStaff(pool,value.owner.email,value.owner.password,'synthetic-client',config),/Invalid credentials/);
    assert.equal((await authenticateStaff(pool,value.owner.email,'Rotated-synthetic-password','synthetic-client',config)).principal.id,created.ownerId);

    const before=(await db.query('SELECT COUNT(*)::int AS n FROM organizations')).rows[0].n;
    await db.exec("CREATE FUNCTION reject_bootstrap_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='workspace.created' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER reject_bootstrap_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_audit()");
    const failed={...input(),owner:{...value.owner,email:'rollback@example.test'}};
    await assert.rejects(bootstrapWorkspace(pool,failed,config),/Synthetic audit failure/);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM organizations')).rows[0].n,before);
    assert.equal((await db.query('SELECT 1 FROM staff_credentials WHERE email=$1',[failed.owner.email])).rows.length,0);
    assert.equal((await db.query('SELECT 1 FROM workspace_bootstraps WHERE request_id=$1',[failed.requestId])).rows.length,0);
    await db.exec('DROP TRIGGER reject_bootstrap_audit ON audit');
    assert.equal((await bootstrapWorkspace(pool,failed,config)).duplicate,false);
    const receipt=(await db.query('SELECT row_to_json(w) AS receipt FROM workspace_bootstraps w WHERE request_id=$1',[value.requestId])).rows[0].receipt;
    assert.doesNotMatch(JSON.stringify(receipt),/password|owner@example|Synthetic owner/);
  }finally{await db.close();}
});
