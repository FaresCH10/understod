import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {fixtureState,retryState} from './restore-state-fixture.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {withTransaction} from '../server/postgres/db.mjs';
import {databaseInventory,privateObjectInventory,quarantineRestoredDatabase} from '../server/postgres/backup.mjs';
import {exportPrivacyLedger,planPrivacyReconciliation,replayPrivacyRestrictions,privacyLedgerFingerprint} from '../server/postgres/privacy-ledger.mjs';
import {provisionStaffCredential,authenticateStaff,issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {provisionOperator,authenticateOperator} from '../server/postgres/operators.mjs';
import {changeStaff} from '../server/postgres/staff.mjs';
import {disableWorker,reenableWorker} from '../server/postgres/people.mjs';
import {saveSiteAccess,saveSiteLifecycle,createSite} from '../server/postgres/sites.mjs';
import {linkAccountMembership} from '../server/postgres/accounts.mjs';
import {saveOperatorControl} from '../server/postgres/operations.mjs';
import {tokenHash} from '../server/auth-crypto.mjs';
import {backupKey,createPrivateDirectory,writeBackupCompletion,decryptBackupBytes} from '../server/backup-files.mjs';
import {createPrivacyLedgerExport,replayPrivacyRestoreRestrictions} from '../scripts/postgres-privacy.mjs';
import {saveActivityRetention,processOneActivityPurge} from '../server/postgres/activity-retention.mjs';

const schema='restore_access',hash=value=>createHash('sha256').update(value).digest('hex'),sourceIdentitySha256=hash('127.0.0.1:5432/source');
const password='Synthetic-only-account-password-74!';
const inventory=pool=>withTransaction(pool,async client=>({database:await databaseInventory(client,schema),objects:await privateObjectInventory(client)}));
function poolFor(db){let failure='';return {async connect(){return {async query(sql,args){
  if(failure && sql.includes(failure))throw Error('Injected access failure');
  if(sql==='SELECT pg_export_snapshot() AS id')return {rows:[{id:'00000001-00000001-1'}]};
  return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};
},release(){}};},fail(value){failure=value;}};}
const principal=login=>({...login.principal,token_hash:tokenHash(login.session.token),access_mode:'credential'});
async function fixture({crossOrigin=false,later=true}={}){
  const root=await mkdtemp(join(tmpdir(),'understood-restore-access-')),source=new PGlite(),pool=poolFor(source);let target;
  try{
    await source.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);await runMigrations(pool,{schema});
    await source.exec(`INSERT INTO organizations VALUES('org','SECRET_ORG');INSERT INTO sites VALUES('site','org','SECRET_SITE','UTC');
      INSERT INTO sites VALUES('archive','org','SECRET_EMPTY_SITE','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role,active) VALUES('owner','org','site','SECRET_OWNER','owner',true),
        ('archive-owner','org','archive','SECRET_LINKED_NAME','owner',true),('reviewer','org','site','SECRET_REVIEWER','supervisor',true),
        ('prior-revoked','org','site','SECRET_PRIOR','supervisor',false);
      INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('worker','org','site','SECRET_WORKER','en',true),
        ('prior-disabled','org','site','SECRET_DISABLED','en',false);
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','SECRET_TITLE','SECRET_SOURCE','ready');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','org','site','brief',1,'{"facts":["blue","yellow"]}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','org','site','pub','worker','en');
      INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,assessment_status,reasons_json) VALUES('answer','org','site','assignment','typed','SECRET_ANSWER','matched','complete','[]');
      INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true);`);
    await provisionStaffCredential(pool,{staffId:'owner',orgId:'org',siteId:'site',email:'owner@example.test',password},{schema});
    await withTransaction(pool,client=>linkAccountMembership(client,'owner','archive-owner'));
    const owner=principal(await authenticateStaff(pool,'owner@example.test',password,'synthetic-source',{schema}));
    const grant=await issueWorkerGrant(pool,owner,'worker',240,{schema});await redeemWorkerGrant(pool,grant.token,{schema});
    const operatorId=randomUUID();await provisionOperator(pool,{id:operatorId,email:'operator@example.test',password,name:'SECRET_OPERATOR'},{schema});
    const operator=(await authenticateOperator(pool,{email:'operator@example.test',password},'synthetic-operator',{schema})).session;
    const baseline={format:'understood-postgres-private-backup-v1',id:randomUUID(),createdAt:new Date().toISOString(),schema,toolVersion:16,sourceIdentitySha256,
      ...await inventory(pool),archive:{name:'database.enc',bytes:100,sha256:'a'.repeat(64)},files:[]};
    target=new PGlite({loadDataDir:await source.dumpDataDir('none')});const targetPool=poolFor(target);await target.exec(`SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);
    if(later){
      await source.exec("INSERT INTO staff(id,org_id,site_id,name,role) VALUES('later-owner','org','site','SECRET_LATER_OWNER','owner')");
      await provisionStaffCredential(pool,{staffId:'later-owner',orgId:'org',siteId:'site',email:'later@example.test',password},{schema});
      const laterOwner=principal(await authenticateStaff(pool,'later@example.test',password,'synthetic-later',{schema}));
      await changeStaff(pool,laterOwner,'reviewer','role',{requestId:randomUUID(),revision:1,role:'auditor',confirmed:true},{schema});
      await changeStaff(pool,laterOwner,'reviewer','revoke',{requestId:randomUUID(),revision:2,confirmed:true},{schema});
      await changeStaff(pool,owner,'prior-revoked','restore',{requestId:randomUUID(),revision:1,confirmed:true},{schema});
      await disableWorker(pool,owner,'worker',{schema});
      await reenableWorker(pool,owner,'prior-disabled',{requestId:randomUUID(),expectedCode:'SECRET_DISABLED',confirmed:true},{schema});
      if(crossOrigin){
        const added=await createSite(pool,owner,{requestId:randomUUID(),name:'SECRET_LATER_SITE',timezone:'UTC',generationLanguages:['en'],confirmed:true},{schema});
        // Authored trusted principal for the normal linked-site backend operation, not HTTP proof.
        await saveSiteAccess(pool,{...owner,principal_id:added.ownerId,site_id:added.id,token_hash:undefined},
          {requestId:randomUUID(),siteId:'site',revision:0,state:'paused',reason:'security',confirmed:true},{schema});
      }else await saveSiteAccess(pool,owner,{requestId:randomUUID(),siteId:'site',revision:0,state:'paused',reason:'security',confirmed:true},{schema});
      await saveSiteLifecycle(pool,owner,{requestId:randomUUID(),siteId:'archive',revision:0,state:'archived',reason:'operational',confirmed:true},{schema});
      await provisionStaffCredential(pool,{staffId:'owner',orgId:'org',siteId:'site',email:'owner@example.test',password:password+'changed'},{schema});
      await saveOperatorControl(pool,operator,{requestId:randomUUID(),kind:'tenant',orgId:'org',revision:0,state:'suspended',reason:'security_review',confirmed:true},{schema});
    }
    const ledger=await exportPrivacyLedger(pool,baseline,{schema,sourceIdentitySha256,writersStopped:true});
    await quarantineRestoredDatabase(targetPool,{schema,backupId:baseline.id});
    return {root,source,pool,target,targetPool,baseline,ledger,operatorId,grant,options:{isolatedTarget:true,writersStopped:true},
      async close(){await target.close();await source.close();await rm(root,{recursive:true,force:true});}};
  }catch(error){if(target)await target.close();await source.close();await rm(root,{recursive:true,force:true});throw error;}
}

test('source worker restriction proof remains replayable after its activity identifiers expire',async()=>{
  const f=await fixture({later:false});try{
    const owner=principal(await authenticateStaff(f.pool,'owner@example.test',password,'synthetic-retention',{schema}));
    await saveActivityRetention(f.pool,owner,{requestId:randomUUID(),revision:0,days:7,confirmed:true},{schema});
    await f.source.exec(`UPDATE workers SET active=false WHERE id='worker';
      INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at)
        VALUES('expired-worker-restriction','org','site','staff','owner','worker.disabled','worker',clock_timestamp()-interval '10 days')`);
    const original=(await f.source.query("SELECT * FROM operational_audit_receipts WHERE id='expired-worker-restriction'")).rows[0];
    assert.equal(await processOneActivityPurge(f.pool,{schema}),true);
    assert.deepEqual((await f.source.query("SELECT actor_id,object_id FROM audit WHERE id='expired-worker-restriction'")).rows,[{actor_id:'',object_id:''}]);
    const ledger=await exportPrivacyLedger(f.pool,f.baseline,{schema,sourceIdentitySha256,writersStopped:true});
    const evidence=ledger.tables.access_audit.find(row=>row.id==='expired-worker-restriction');
    assert.equal(evidence.actor_id,original.actor_id);assert.equal(evidence.object_id,original.object_id);
    assert.equal(Date.parse(evidence.occurred_at),original.occurred_at.getTime());
    const result=await replayPrivacyRestrictions(f.targetPool,f.baseline,ledger,f.options);
    assert.equal(result.disabledWorkers,1);assert.equal(result.activationAllowed,false);
    assert.equal((await f.target.query("SELECT active FROM workers WHERE id='worker'")).rows[0].active,false);
    const proof=(await f.target.query("SELECT source_receipts_json FROM restore_access_restrictions WHERE kind='worker' AND reference_id='worker'")).rows[0];
    assert.deepEqual(proof.source_receipts_json,[evidence]);
    const before=await inventory(f.targetPool);assert.equal((await replayPrivacyRestrictions(f.targetPool,f.baseline,ledger,f.options)).duplicate,true);assert.deepEqual(await inventory(f.targetPool),before);
  }finally{await f.close();}
});

test('aged exact restore replay markers remain receipt-only after activity expiry, without releasing quarantine',async()=>{
  const f=await fixture({later:false});try{
    const marker=`${f.baseline.id}:${f.ledger.id}:${privacyLedgerFingerprint(f.ledger)}`;
    // A synthetic aged prior no-change reconciliation exercises the retained receipt lookup.
    for(const site of ['site','archive']){
      await f.target.query("INSERT INTO activity_retention_policies VALUES($1,'org',1,7,clock_timestamp())",[site]);
      await f.target.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at)
        VALUES($1,'org',$2,'system','restore-operator','backup.restore.privacy.restrictions',$3,clock_timestamp()-interval '10 days')`,[`aged-replay-${site}`,site,marker]);
    }
    assert.equal(await processOneActivityPurge(f.targetPool,{schema}),true);assert.equal(await processOneActivityPurge(f.targetPool,{schema}),true);
    assert.equal((await f.target.query("SELECT count(*)::int AS n FROM audit WHERE id LIKE 'aged-replay-%' AND actor_id='' AND object_id=''")).rows[0].n,2);
    const before=await inventory(f.targetPool),result=await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);
    assert.equal(result.duplicate,true);assert.equal(result.activationAllowed,false);assert.deepEqual(await inventory(f.targetPool),before);
    assert.ok(result.conflicts.some(row=>row.table==='activity_retention_policies' && row.reason==='source_policy_unavailable'));
    const changed=structuredClone(f.ledger);changed.tables.staff_credentials[0].credential_sha256='f'.repeat(64);
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,changed,f.options),/ledger receipt conflict/);
    assert.deepEqual(await inventory(f.targetPool),before);
  }finally{await f.close();}
});

test('quarantine disables restored credential accounts and operators; changed source secrets are hashed metadata, never copied or usable',async()=>{
  const f=await fixture();try{
    const encoded=JSON.stringify(f.ledger);assert.ok(!encoded.includes('SECRET_'));assert.ok(!encoded.includes(password));assert.ok(!encoded.includes('@example.test'));
    assert.ok(!encoded.includes('password_hash'));assert.ok(!encoded.includes('password_salt'));assert.ok(!encoded.includes('token_hash'));
    assert.equal((await f.target.query('SELECT active FROM staff_accounts')).rows[0].active,false);
    assert.equal((await f.target.query('SELECT active FROM platform_operators')).rows[0].active,false);
    assert.equal((await f.target.query('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL')).rows[0].n,0);
    assert.equal((await f.target.query('SELECT count(*)::int AS n FROM operator_sessions WHERE revoked_at IS NULL')).rows[0].n,0);
    await assert.rejects(authenticateOperator(f.targetPool,{email:'operator@example.test',password},'synthetic-target',{schema}),/Invalid credentials/);
    await assert.rejects(authenticateStaff(f.targetPool,'owner@example.test',password,'synthetic-target',{schema}),/Invalid credentials/);
    await assert.rejects(redeemWorkerGrant(f.targetPool,f.grant.token,{schema}),/paused|credentials/);
    const report=await planPrivacyReconciliation(f.targetPool,f.baseline,f.ledger,f.options);
    assert.equal(report.restrictions.staffRoles,1);assert.equal(report.restrictions.changedCredentials,1);
    const before=(await f.target.query('SELECT password_hash,password_salt,email FROM staff_credentials')).rows;
    await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);
    assert.deepEqual((await f.target.query('SELECT password_hash,password_salt,email FROM staff_credentials')).rows,before);
  }finally{await f.close();}
});

test('restriction replay preserves original staff/site receipts and source tenant suspension separately, without activating anything or changing business evidence',async()=>{
  const f=await fixture();try{
    const sourceBefore=await inventory(f.pool),evidence=(await f.target.query('SELECT * FROM attempts')).rows,publications=(await f.target.query('SELECT * FROM publications')).rows;
    const maintenance=(await f.target.query('SELECT * FROM tenant_controls')).rows;
    const result=await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);
    assert.equal(result.duplicate,false);assert.equal(result.changedStaff,1);assert.equal(result.disabledWorkers,1);assert.equal(result.importedActors,1);assert.equal(result.importedRequests,5);
    assert.equal(result.activationAllowed,false);assert.equal(result.authoritativeReconciliationComplete,false);assert.equal(result.productionReady,false);
    assert.deepEqual((await f.target.query("SELECT role,active FROM staff WHERE id='reviewer'")).rows,[{role:'auditor',active:false}]);
    assert.equal((await f.target.query("SELECT revision FROM staff_access_revisions WHERE staff_id='reviewer'")).rows[0].revision,3);
    assert.equal((await f.target.query("SELECT active FROM staff WHERE id='prior-revoked'")).rows[0].active,false,'source reactivation is not replayed as fresh access');
    assert.equal((await f.target.query("SELECT active FROM workers WHERE id='prior-disabled'")).rows[0].active,false);
    assert.equal((await f.target.query("SELECT active FROM workers WHERE id='worker'")).rows[0].active,false);
    assert.equal((await f.target.query("SELECT state FROM site_access_controls WHERE site_id='site'")).rows[0].state,'paused');
    assert.equal((await f.target.query("SELECT state FROM site_lifecycle WHERE site_id='archive'")).rows[0].state,'archived');
    assert.deepEqual((await f.target.query('SELECT * FROM tenant_controls')).rows,maintenance);
    const tenant=(await f.target.query("SELECT source_state_json,source_receipts_json FROM restore_access_restrictions WHERE kind='tenant'")).rows[0];
    assert.equal(tenant.source_state_json.reason,'security_review');assert.equal(tenant.source_receipts_json[0].operator_id,f.operatorId);
    assert.equal(tenant.source_receipts_json[0].request_json.confirmed,true);assert.equal((await f.target.query('SELECT * FROM operator_requests')).rows.length,0);
    assert.equal((await f.target.query("SELECT active FROM staff WHERE id='later-owner'")).rows[0].active,false);
    assert.equal((await f.target.query("SELECT count(*)::int AS n FROM staff_credentials WHERE staff_id='later-owner'")).rows[0].n,0);
    assert.equal((await f.target.query("SELECT count(*)::int AS n FROM staff_account_memberships WHERE staff_id='later-owner'")).rows[0].n,0);
    const original=f.ledger.tables.staff_access_requests.find(row=>row.staff_id==='reviewer' && row.action==='revoke');
    assert.deepEqual((await f.target.query('SELECT to_jsonb(t) AS row FROM staff_access_requests t WHERE request_id=$1',[original.request_id])).rows[0].row,original);
    assert.deepEqual((await f.target.query('SELECT * FROM attempts')).rows,evidence);assert.deepEqual((await f.target.query('SELECT * FROM publications')).rows,publications);
    const before=await inventory(f.targetPool);assert.equal((await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options)).duplicate,true);assert.deepEqual(await inventory(f.targetPool),before);
    assert.deepEqual(await inventory(f.pool),sourceBefore);
  }finally{await f.close();}
});

test('absent post-backup origin site retains original cross-site actor/receipt in provenance without inventing the site or credential identity',async()=>{
  const f=await fixture({crossOrigin:true});try{
    const original=f.ledger.tables.site_access_requests.find(row=>row.site_id==='site');
    const result=await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);assert.equal(result.activationAllowed,false);
    assert.equal((await f.target.query('SELECT count(*)::int AS n FROM sites')).rows[0].n,2);
    assert.equal((await f.target.query('SELECT * FROM site_access_requests WHERE request_id=$1',[original.request_id])).rows.length,0);
    const proof=(await f.target.query("SELECT source_receipts_json FROM restore_access_restrictions WHERE kind='site-access' AND reference_id='site'")).rows[0];
    assert.deepEqual(proof.source_receipts_json,[original]);assert.equal((await f.target.query('SELECT * FROM staff WHERE id=$1',[original.actor_id])).rows.length,0);
    assert.equal((await f.target.query("SELECT state FROM site_access_controls WHERE site_id='site'")).rows[0].state,'paused');
  }finally{await f.close();}
});

test('audit failure rolls back every imported receipt, placeholder, role/revision, worker/site fence and provenance record; missing authority and altered receipts reject',async()=>{
  const f=await fixture();try{
    const before=await inventory(f.targetPool);f.targetPool.fail('INSERT INTO audit');
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options),/Injected/);f.targetPool.fail('');assert.deepEqual(await inventory(f.targetPool),before);
    const noWorker=structuredClone(f.ledger);noWorker.tables.access_audit=noWorker.tables.access_audit.filter(row=>row.action!=='worker.disabled');
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,noWorker,f.options),/worker restriction decision/);assert.deepEqual(await inventory(f.targetPool),before);
    const noStaff=structuredClone(f.ledger);noStaff.tables.staff_access_requests=noStaff.tables.staff_access_requests.filter(row=>row.action!=='revoke');
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,noStaff,f.options),/staff restriction decision/);assert.deepEqual(await inventory(f.targetPool),before);
    const future=structuredClone(f.ledger);future.tables.site_access_controls[0].updated_at='2100-01-01T00:00:00Z';
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,future,f.options),/state time/);assert.deepEqual(await inventory(f.targetPool),before);
    await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);
    const accepted=await inventory(f.targetPool),altered=structuredClone(f.ledger);altered.tables.platform_operators[0].credential_sha256='f'.repeat(64);
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,altered,f.options),/ledger receipt conflict/);assert.deepEqual(await inventory(f.targetPool),accepted);
  }finally{await f.close();}
});

test('SQL proofs are immutable, exact target-state and backup scoped; active account/operator breaks both read-only and write quarantine',async()=>{
  const f=await fixture();try{
    await replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options);
    await assert.rejects(f.target.exec("UPDATE restore_access_restrictions SET source_state_json='{}'"),/immutable/);
    await assert.rejects(f.target.exec('DELETE FROM restore_access_restrictions'),/immutable/);
    const proof=(await f.target.query("SELECT * FROM restore_access_restrictions WHERE kind='worker' AND reference_id='worker'")).rows[0];
    const insert=target=>f.target.query(`INSERT INTO restore_access_restrictions(backup_id,ledger_id,ledger_fingerprint,kind,reference_id,org_id,site_id,
      source_state_json,source_receipts_json,target_state_json,source_captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [proof.backup_id,randomUUID(),proof.ledger_fingerprint,proof.kind,proof.reference_id,proof.org_id,proof.site_id,JSON.stringify(proof.source_state_json),'[]',JSON.stringify(target),proof.source_captured_at]);
    await assert.rejects(insert({...proof.target_state_json,active:true}),/restrictive target/);
    await f.target.exec("UPDATE staff_accounts SET active=true WHERE id='owner'");
    await assert.rejects(planPrivacyReconciliation(f.targetPool,f.baseline,f.ledger,f.options),/quarantine/);
    await assert.rejects(insert(proof.target_state_json),/quarantine/);
    await f.target.exec("UPDATE staff_accounts SET active=false WHERE id='owner';UPDATE platform_operators SET active=true");
    await assert.rejects(replayPrivacyRestrictions(f.targetPool,f.baseline,f.ledger,f.options),/quarantine/);
  }finally{await f.close();}
});

test('encrypted restriction command requires stopped confirmed distinct target, refuses overwrite and authenticates exact retry acknowledgement without secrets',async()=>{
  const f=await fixture(),key=backupKey('c4'.repeat(32));try{
    const backupDirectory=await createPrivateDirectory(join(f.root,'backup'));await writeBackupCompletion(backupDirectory,f.baseline,key);
    const ledgerDirectory=join(f.root,'ledger'),exported=await createPrivacyLedgerExport({pool:f.pool,connection:{connectionString:'postgresql://operator:private@127.0.0.1/source'},
      backupDirectory,directory:ledgerDirectory,key,writersStopped:true});
    const args={...await fixtureState(f,key),pool:f.targetPool,connection:{connectionString:'postgresql://operator:private@127.0.0.1/restored'},backupDirectory,ledgerDirectory,directory:join(f.root,'result'),key,...f.options,confirmed:true};
    await assert.rejects(replayPrivacyRestoreRestrictions({...args,confirmed:false}),/confirmed/);
    await assert.rejects(replayPrivacyRestoreRestrictions({...args,connection:{connectionString:'postgresql://operator:private@127.0.0.1/source'}}),/source database/);
    const result=await replayPrivacyRestoreRestrictions(args),purpose=`understood:restore:${f.baseline.id}:privacy-restrictions:${exported.ledgerId}`;
    assert.deepEqual(JSON.parse((await decryptBackupBytes(join(args.directory,'privacy-restrictions.enc'),key,purpose)).toString('utf8')),result);
    assert.equal(result.productionReady,false);assert.equal(result.activationAllowed,false);
    await assert.rejects(decryptBackupBytes(join(args.directory,'privacy-restrictions.enc'),key,`${purpose}:wrong`),/authentication/);
    await assert.rejects(replayPrivacyRestoreRestrictions(args),/EEXIST/);
    const before=await inventory(f.targetPool);assert.equal((await replayPrivacyRestoreRestrictions({...args,...retryState(args.directory),directory:join(f.root,'retry')})).duplicate,true);
    assert.deepEqual(await inventory(f.targetPool),before);
  }finally{key.fill(0);await f.close();}
});
