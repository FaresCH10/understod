import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {getActivityRetention,saveActivityRetention,activityRetentionReceipt,processOneActivityPurge} from '../server/postgres/activity-retention.mjs';
import {listAuditEvents,getAuditEvent,exportAuditEvents} from '../server/postgres/audit.mjs';
import {rehearsalTasks} from '../server/postgres/runtime.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential} from '../server/postgres/auth.mjs';
import {requireQuarantine} from '../server/postgres/restore-retention.mjs';

const owner={principal_type:'staff',principal_id:'owner',org_id:'org',site_id:'site',role:'owner'};
async function fixture(){
  const db=new PGlite(),options={schema:'understood_test_activity_retention'};let failAudit=false;
  const pool={async connect(){return {async query(sql,args){if(failAudit && sql.startsWith('INSERT INTO audit'))throw Error('Injected audit failure');return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
  await db.exec("INSERT INTO organizations VALUES('org','Synthetic'),('foreign','Foreign');INSERT INTO sites VALUES('site','org','Site','UTC'),('other','org','Other','UTC'),('foreign','foreign','Foreign','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','org','site','Private Owner Name','owner'),('admin','org','site','Admin','administrator'),('supervisor','org','site','Supervisor','supervisor'),('auditor','org','site','Auditor','auditor');INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','org','site','PRIVATE_WORKER_CODE','en');");
  const event=async(id,{age=40,actorType='worker',actorId='worker',object='PRIVATE_ITEM',org='org',site='site'}={})=>db.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at) VALUES($1,$2,$3,$4,$5,'answer.received',$6,clock_timestamp()-$7*interval '1 day')`,[id,org,site,actorType,actorId,object,age]);
  return {db,pool,options,event,fail:value=>{failAudit=value;}};
}
const change=(revision=0,days=30)=>({requestId:randomUUID(),revision,days,confirmed:true});
test('mandatory operational provenance survives display identity expiry, keeps quarantine exact and rejects forged receipts',async()=>{
  const f=await fixture(),backupId=randomUUID();try{
    await saveActivityRetention(f.pool,owner,change(0,7),f.options);
    await f.db.exec("INSERT INTO system_controls(id,revision,jobs_paused,provider_paused) VALUES('global',1,true,true);INSERT INTO tenant_controls(org_id,revision,state,reason) VALUES('org',1,'suspended','maintenance'),('foreign',1,'suspended','maintenance')");
    for(const [site,org] of [['site','org'],['other','org'],['foreign','foreign']])await f.db.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at)
      VALUES($1,$2,$3,'system','restore-operator','backup.restore.quarantined',$4,clock_timestamp()-interval '10 days')`,[`quarantine-${site}`,org,site,backupId]);
    await requireQuarantine(f.db,backupId);
    assert.equal((await f.db.query('SELECT restore_privacy_quarantined($1::uuid) AS quarantined',[backupId])).rows[0].quarantined,true);
    assert.equal(await processOneActivityPurge(f.pool,f.options),true);
    assert.deepEqual((await f.db.query("SELECT actor_id,object_id FROM audit WHERE id='quarantine-site'")).rows,[{actor_id:'',object_id:''}]);
    assert.deepEqual((await f.db.query("SELECT actor_id,object_id FROM operational_audit_receipts WHERE id='quarantine-site'")).rows,[{actor_id:'restore-operator',object_id:backupId}]);
    await requireQuarantine(f.db,backupId);
    assert.equal((await f.db.query('SELECT restore_privacy_quarantined($1::uuid) AS quarantined',[backupId])).rows[0].quarantined,true);
    await assert.rejects(requireQuarantine(f.db,randomUUID()),/not quarantined/);
    for(const sql of ["UPDATE operational_audit_receipts SET object_id='forged'",'DELETE FROM operational_audit_receipts'])await assert.rejects(f.db.exec(sql),/immutable/);
    await assert.rejects(f.db.query(`INSERT INTO operational_audit_receipts SELECT id,org_id,site_id,actor_type,actor_id,action,$1,occurred_at
      FROM audit WHERE id='quarantine-other'`,[randomUUID()]),/Original operational/);
    await f.db.exec("UPDATE tenant_controls SET state='active' WHERE org_id='org'");
    await assert.rejects(requireQuarantine(f.db,backupId),/not quarantined/);
    assert.equal((await f.db.query('SELECT restore_privacy_quarantined($1::uuid) AS quarantined',[backupId])).rows[0].quarantined,false);
  }finally{await f.db.close();}
});
test('activity policy is default disabled, role/site protected and exact confirmed revision/receipt recoverable',async()=>{
  const f=await fixture(),input=change();try{
    assert.equal((await getActivityRetention(f.pool,owner,f.options)).days,null);await f.event('old');assert.equal(await processOneActivityPurge(f.pool,f.options),false);
    assert.equal((await getActivityRetention(f.pool,{...owner,principal_id:'supervisor',role:'supervisor'},f.options)).canWrite,false);
    for(const session of [{...owner,principal_type:'worker'},{...owner,site_id:'other'},{...owner,org_id:'foreign'},{...owner,principal_id:'supervisor',role:'supervisor'}])await assert.rejects(saveActivityRetention(f.pool,session,input,f.options),/Forbidden/);
    assert.deepEqual(await saveActivityRetention(f.pool,owner,input,f.options),{revision:1,duplicate:false});assert.deepEqual(await saveActivityRetention(f.pool,owner,input,f.options),{revision:1,duplicate:true});
    const receipt=await activityRetentionReceipt(f.pool,owner,input.requestId,f.options);assert.equal(receipt.revision,1);assert.deepEqual(receipt.request,{revision:0,days:30,confirmed:true});
    assert.equal(await activityRetentionReceipt(f.pool,{...owner,principal_id:'admin',role:'administrator'},input.requestId,f.options),null);
    await assert.rejects(saveActivityRetention(f.pool,owner,{...input,days:7},f.options),/conflict/);await assert.rejects(saveActivityRetention(f.pool,owner,change(),f.options),/revision changed/);
    await assert.rejects(f.db.exec('DELETE FROM activity_retention_requests'),/immutable/);
    await f.db.exec("UPDATE staff SET active=false WHERE id='owner'");await assert.rejects(getActivityRetention(f.pool,owner,f.options),/Forbidden/);
  }finally{await f.db.close();}
});
test('scheduled identity expiry physically clears identifiers while preserving event evidence, fresh/foreign rows and read-only guards',async()=>{
  const f=await fixture();try{
    await f.event('old-worker');await f.event('old-owner',{actorType:'staff',actorId:'owner'});await f.event('fresh',{age:1});await f.event('foreign',{org:'foreign',site:'foreign'});await f.event('other',{site:'other'});
    const before=(await f.db.query("SELECT id,org_id,site_id,actor_type,action,occurred_at FROM audit WHERE id LIKE 'old-%' ORDER BY id")).rows;
    await assert.rejects(f.db.exec("UPDATE audit SET actor_id='',object_id='' WHERE id='old-worker'"),/read-only/);
    await saveActivityRetention(f.pool,owner,change(),f.options);
    assert.equal(await processOneActivityPurge(f.pool,f.options),true);assert.equal(await rehearsalTasks(f.pool,null,f.options).activityRetention(),true);assert.equal(await processOneActivityPurge(f.pool,f.options),false);
    assert.deepEqual((await f.db.query("SELECT id,org_id,site_id,actor_type,action,occurred_at FROM audit WHERE id LIKE 'old-%' ORDER BY id")).rows,before);
    assert.deepEqual((await f.db.query("SELECT actor_id,object_id FROM audit WHERE id LIKE 'old-%'")).rows,[{actor_id:'',object_id:''},{actor_id:'',object_id:''}]);
    for(const id of ['fresh','foreign','other'])assert.equal((await f.db.query('SELECT object_id FROM audit WHERE id=$1',[id])).rows[0].object_id,'PRIVATE_ITEM');
    const rows=(await listAuditEvents(f.pool,owner,{action:'answer.received'},f.options)).rows.filter(row=>row.id.startsWith('old-'));
    assert.equal(rows.length,2);assert.ok(rows.every(row=>row.actor==='Expired actor' && row.actorId==='' && row.objectId==='' && row.identityExpired===true));assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_|Private Owner/);
    const detail=await getAuditEvent(f.pool,owner,'old-owner',f.options);assert.equal(detail.identityExpired,true);assert.equal(detail.actorId,'');
    assert.equal((await listAuditEvents(f.pool,owner,{search:'Private Owner'},f.options)).rows.some(row=>row.id==='old-owner'),false);
    const csv=await exportAuditEvents(f.pool,owner,{date:before[0].occurred_at.toISOString().slice(0,10)},f.options);assert.doesNotMatch(csv,/PRIVATE_|Private Owner/);
    for(const sql of ["UPDATE audit SET actor_id='worker' WHERE id='old-worker'","UPDATE audit SET object_id='restored' WHERE id='old-worker'","UPDATE audit SET action='changed' WHERE id='old-worker'","UPDATE audit SET occurred_at=clock_timestamp() WHERE id='old-worker'","DELETE FROM audit WHERE id='old-worker'",'DELETE FROM activity_identity_purges'])await assert.rejects(f.db.exec(sql),/read-only|immutable/);
    await saveActivityRetention(f.pool,owner,change(1,null),f.options);await f.event('new-old');assert.equal(await processOneActivityPurge(f.pool,f.options),false);assert.equal((await getActivityRetention(f.pool,owner,f.options)).completed.activity,2);
  }finally{await f.db.close();}
});
test('purge completion cannot be forged without elapsed scoped policy and physical identifier redaction',async()=>{
  const f=await fixture();try{
    await f.event('old');await f.event('fresh',{age:1});await saveActivityRetention(f.pool,owner,change(),f.options);
    for(const values of [['fresh','org','site',1,30],['old','foreign','foreign',1,30],['old','org','site',2,30],['old','org','site',1,7]])await assert.rejects(f.db.query('INSERT INTO activity_identity_purges(event_id,org_id,site_id,policy_revision,days) VALUES($1,$2,$3,$4,$5)',values),/scope or policy/);
    await assert.rejects(f.db.exec("INSERT INTO activity_identity_purges(event_id,org_id,site_id,policy_revision,days) VALUES('old','org','site',1,30)"),/redaction incomplete/);
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM activity_identity_purges')).rows[0].n,0);assert.equal((await f.db.query("SELECT object_id FROM audit WHERE id='old'")).rows[0].object_id,'PRIVATE_ITEM');
    f.fail(true);await assert.rejects(processOneActivityPurge(f.pool,f.options),/audit failure/);f.fail(false);
    assert.equal((await getActivityRetention(f.pool,owner,f.options)).completed.activity,0);assert.equal((await f.db.query("SELECT actor_id FROM audit WHERE id='old'")).rows[0].actor_id,'worker');
    assert.equal(await processOneActivityPurge(f.pool,f.options),true);
  }finally{await f.db.close();}
});
test('credential activity policy HTTP rejects scope overrides and unconfirmed writes, returns exact immutable receipts',async()=>{
  const f=await fixture(),origin='http://127.0.0.1:3020',password=`Synthetic-${randomUUID()}!`,server=createPostgresRehearsalServer(f.pool,{...f.options,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin});
  try{
    await provisionStaffCredential(f.pool,{staffId:'owner',orgId:'org',siteId:'site',email:'owner@activity.example.test',password},f.options);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
    const login=await fetch(`${base}/auth/staff/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'owner@activity.example.test',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],headers={cookie,origin,'content-type':'application/json'},input=change();
    assert.equal((await fetch(`${base}/retention/activity`)).status,401);assert.equal((await fetch(`${base}/retention/activity?site=foreign`,{headers})).status,400);
    assert.equal((await fetch(`${base}/retention/activity`,{method:'POST',headers,body:JSON.stringify({...input,confirmed:false})})).status,400);
    const post=()=>fetch(`${base}/retention/activity`,{method:'POST',headers,body:JSON.stringify(input)});assert.deepEqual(await (await post()).json(),{revision:1,duplicate:false});assert.deepEqual(await (await post()).json(),{revision:1,duplicate:true});
    const receipt=await fetch(`${base}/retention/activity/requests/${input.requestId}`,{headers});assert.equal(receipt.headers.get('cache-control'),'no-store');assert.equal((await receipt.json()).request.days,30);
    await f.db.exec("UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_id='owner'");assert.equal((await post()).status,401);
  }finally{if(server.listening)await new Promise(resolve=>server.close(resolve));await f.db.close();}
});
