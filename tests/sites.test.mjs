import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureSettingsSchema} from '../server/settings.mjs';
import {provisionStaffCredential} from '../server/auth.mjs';
import {provisionStaffCredential as pgCredential} from '../server/postgres/auth.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import * as sqlite from '../server/sites.mjs';
import * as postgres from '../server/postgres/sites.mjs';
import {listAccountSites} from '../server/accounts.mjs';
import {listAccountSites as pgAccounts} from '../server/postgres/accounts.mjs';
import {createSiteInput,siteHttpError} from '../server/site-input.mjs';
import {createAppServer} from '../server/index.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import * as localAuth from '../server/auth.mjs';
import * as pgAuth from '../server/postgres/auth.mjs';
import {requireWorkerSiteAccess} from '../server/site-access.mjs';
import {requirePrincipal,domainTransaction} from '../server/postgres/domain.mjs';
import {siteAccessInput} from '../server/site-input.mjs';
import {siteLifecycleInput,archivedWriteAllowed} from '../server/site-lifecycle-input.mjs';
import {requireWorkerSiteAccess as pgWorkerSiteAccess} from '../server/postgres/site-access.mjs';
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner',access_mode:'credential'};
const input=()=>({requestId:randomUUID(),name:'Synthetic new site',timezone:'Asia/Beirut',generationLanguages:['en','ar'],confirmed:true});
async function fixture(pg) {
  let db,pool;const options={schema:'understood_test_sites'};
  if(pg){db=new PGlite();pool={async connect(){return {query:async(sql,values)=>values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
    await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
    await db.exec("INSERT INTO organizations VALUES('cedar','Cedar'),('other','Other');INSERT INTO sites VALUES('beirut','cedar','Beirut','UTC'),('foreign','other','Foreign','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic owner','owner'),('foreign-owner','other','foreign','Other owner','owner'),('supervisor','cedar','beirut','Supervisor','supervisor')");
    await pgCredential(pool,{staffId:'maya',orgId:'cedar',siteId:'beirut',email:'owner@example.test',password:'Synthetic-site-password'},options);
  }else{db=openDatabase(':memory:');seed(db);ensureSettingsSchema(db);provisionStaffCredential(db,'maya','owner@example.test','Synthetic-site-password');db.exec("INSERT INTO staff VALUES('supervisor','cedar','beirut','Supervisor','supervisor',1)");}
  return {db,pool,options,list:(s,v)=>pg?postgres.listSites(pool,s,v,options):sqlite.listSites(db,s,v),create:(s,v)=>pg?postgres.createSite(pool,s,v,options):sqlite.createSite(db,s,v),receipt:(s,id)=>pg?postgres.siteCreationReceipt(pool,s,id,options):sqlite.siteCreationReceipt(db,s,id),accounts:s=>pg?pgAccounts(pool,s,{},options):listAccountSites(db,s),
    query:async(sql,args=[])=>pg?db.query(sql,args):{rows:db.prepare(sql).all(...args)},close:()=>db.close()};
}
test('site creation rejects caller scopes, missing confirmation, invalid timezone and language selection',()=>{
  for(const patch of [{orgId:'foreign'},{siteId:'foreign'},{confirmed:false},{timezone:'bad/timezone'},{name:'x'},{generationLanguages:['ar']},{generationLanguages:['en','en']},{requestId:'invalid'}])assert.throws(()=>createSiteInput({...input(),...patch}),/Invalid/);
  assert.deepEqual(createSiteInput({...input(),generationLanguages:['ar','en']}),{name:'Synthetic new site',timezone:'Asia/Beirut',generationLanguages:['en','ar'],confirmed:true});
  assert.equal(siteHttpError(new Error('Secret database error')).status,503);assert.doesNotMatch(siteHttpError(new Error('Secret database error')).error,/Secret/);
});
for(const pg of [false,true])test(`${pg?'postgres':'sqlite'}: site creation is scoped, linked, exactly replayable and rolls back atomically`,async()=>{
  const f=await fixture(pg),q=(sql,args)=>f.query(sql,args),p=pg?'$1':'?';
  try{
    const initial=await f.list(owner,{pageSize:1});assert.equal(initial.canCreate,true);assert.equal(initial.items.length,1);assert.ok(initial.items.every(row=>row.name!=='Foreign'));
    const body=input(),first=await f.create(owner,body);assert.equal(first.duplicate,false);assert.deepEqual(await f.create(owner,body),{...first,duplicate:true});
    assert.equal((await f.receipt(owner,body.requestId)).id,first.id);assert.deepEqual(await f.receipt(owner,randomUUID()),{found:false});
    assert.equal((await f.accounts(owner)).items.some(row=>row.staffId===first.ownerId && row.siteId===first.id && row.role==='owner'),true);
    assert.equal((await q(`SELECT COUNT(*) AS n FROM staff_credentials WHERE staff_id=${p}`,[first.ownerId])).rows[0].n,pg?0:0);
    assert.equal((await q(`SELECT primary_contact_id FROM site_settings WHERE site_id=${p}`,[first.id])).rows[0].primary_contact_id,first.ownerId);
    await assert.rejects(async()=>f.create(owner,{...body,timezone:'UTC'}),/request conflict/);
    await assert.rejects(async()=>f.create(owner,{...body,requestId:randomUUID(),name:body.name.toUpperCase()}),/already exists/);
    for(const actor of [{...owner,principal_type:'worker'},{...owner,site_id:'foreign'},{...owner,principal_id:'supervisor',role:'supervisor'}]){await assert.rejects(async()=>f.list(actor),/Forbidden/);await assert.rejects(async()=>f.create(actor,input()),/Forbidden/);}
    await assert.rejects(async()=>f.create({...owner,access_mode:'demo'},input()),/Forbidden/);
    assert.equal((await f.list({...owner,access_mode:'demo'})).canCreate,false);
    const otherOwner={...owner,principal_id:first.ownerId,site_id:first.id};assert.deepEqual(await f.receipt(otherOwner,body.requestId),{found:false});await assert.rejects(async()=>f.create(otherOwner,body),/request conflict/);
    const raw=pg?'UPDATE site_creations SET request_json=request_json':'UPDATE site_creations SET request_json=request_json';await assert.rejects(q(raw),/immutable/);
    const before=(await q('SELECT COUNT(*) AS n FROM sites')).rows[0].n;
    if(pg)await f.db.exec("CREATE FUNCTION fail_site_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='site.created' THEN RAISE EXCEPTION 'Audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_site_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_site_audit()");
    else f.db.exec("CREATE TRIGGER fail_site_audit BEFORE INSERT ON audit WHEN NEW.action='site.created' BEGIN SELECT RAISE(ABORT,'Audit failure'); END");
    const failed={...input(),name:'Rolled back site'};await assert.rejects(async()=>f.create(owner,failed),/Audit failure/);assert.equal((await q('SELECT COUNT(*) AS n FROM sites')).rows[0].n,before);assert.deepEqual(await f.receipt(owner,failed.requestId),{found:false});
    if(pg)await f.db.exec('DROP TRIGGER fail_site_audit ON audit');else f.db.exec('DROP TRIGGER fail_site_audit');assert.equal((await f.create(owner,failed)).duplicate,false);
    for(let n=0;n<11;n++)await f.create(owner,{...input(),name:`Paged site ${n}`});assert.equal((await f.list(owner,{search:'Paged',pageSize:5,page:3})).items.length,1);
    const prefix=pg?'$1':'?';await q(`UPDATE staff_accounts SET active=${pg?'false':'0'} WHERE credential_staff_id=${prefix}`,['maya']);await assert.rejects(async()=>f.create(owner,{...input(),name:'Inactive account'}),/Forbidden/);
  }finally{await f.close();}
});
for(const pg of [false,true])test(`${pg?'postgres':'sqlite'}: site HTTP requires exact context, origin and credential owner and exposes recoverable receipts`,async()=>{
  const f=await fixture(pg);let server;
  try{
    server=pg?createPostgresRehearsalServer(f.pool,{...f.options,storage:{},tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:'http://127.0.0.1:3020'}):createAppServer(f.db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3020'});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,request=(path,options={})=>fetch(base+path,options);
    const login=await request('/api/auth/staff/login',{method:'POST',headers:{origin:'http://127.0.0.1:3020','content-type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'Synthetic-site-password'})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0],session=await (await request('/api/session',{headers:{cookie}})).json(),body=input(),options={method:'POST',headers:{cookie,origin:'http://127.0.0.1:3020','content-type':'application/json'},body:JSON.stringify(body)};
    assert.equal((await request('/api/settings/sites',options)).status,409);
    const headers={...options.headers,'x-client-session-context':session.clientContext};assert.equal((await request('/api/settings/sites',{...options,headers:{...headers,origin:'http://forged.test'}})).status,403);
    const created=await request('/api/settings/sites',{...options,headers});assert.equal(created.status,200);const first=await created.json();assert.equal(first.duplicate,false);
    const receipt=await (await request(`/api/settings/sites/receipts/${body.requestId}`,{headers})).json();assert.equal(receipt.id,first.id);
    assert.equal((await (await request('/api/settings/sites',{...options,headers})).json()).duplicate,true);
    assert.equal((await request('/api/settings/sites?orgId=other',{headers})).status,400);
    assert.equal((await request('/api/settings/sites',{...options,headers,body:'{}'})).status,400);
    assert.equal((await request('/api/settings/sites')).status,401);
    const access={requestId:randomUUID(),siteId:'beirut',revision:0,state:'paused',reason:'pilot_review',confirmed:true};
    assert.equal((await request('/api/settings/sites/access',{...options,body:JSON.stringify(access)})).status,409);
    const changed=await request('/api/settings/sites/access',{...options,headers,body:JSON.stringify(access)});assert.equal(changed.status,200);assert.equal((await changed.json()).revision,1);
    const accessReceipt=await (await request(`/api/settings/sites/access/receipts/${access.requestId}`,{headers})).json();assert.equal(accessReceipt.found,true);assert.equal(accessReceipt.request.siteId,'beirut');
    assert.equal((await request('/api/session',{headers})).status,200);
    const lifecycle={requestId:randomUUID(),siteId:first.id,revision:0,state:'archived',reason:'operational',confirmed:true};
    assert.equal((await request('/api/settings/sites/lifecycle',{...options,body:JSON.stringify(lifecycle)})).status,409);
    assert.equal((await request('/api/settings/sites/lifecycle',{...options,headers,body:JSON.stringify(lifecycle)})).status,200);
    const archived=await (await request(`/api/settings/sites/lifecycle/receipts/${lifecycle.requestId}`,{headers})).json();assert.equal(archived.revision,1);
    const inspected=await (await request(`/api/settings/sites/${first.id}/lifecycle`,{headers})).json();assert.equal(inspected.state,'archived');assert.deepEqual(inspected.dependencies,[]);
    const switched=await request('/api/account/site',{...options,headers,body:JSON.stringify({staffId:first.ownerId})});assert.equal(switched.status,200);
    const targetCookie=switched.headers.get('set-cookie').split(';')[0],targetSession=await (await request('/api/session',{headers:{cookie:targetCookie}})).json();assert.equal(targetSession.siteState,'archived');
    const targetHeaders={...headers,cookie:targetCookie,'x-client-session-context':targetSession.clientContext};
    assert.equal((await request('/api/briefings',{...options,headers:targetHeaders,body:'{}'})).status,403);
    assert.equal((await request('/api/settings',{headers:targetHeaders})).status,200);
    assert.equal((await request('/api/settings/sites/lifecycle',{...options,headers:targetHeaders,body:JSON.stringify({...lifecycle,requestId:randomUUID(),revision:1,state:'active'})})).status,200);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

test('site lifecycle accepts only confirmed bounded transitions and keeps privacy paths open',()=>{
  const body={requestId:randomUUID(),siteId:'beirut',revision:0,state:'archived',reason:'operational',confirmed:true};
  assert.equal(siteLifecycleInput(body).state,'archived');
  for(const patch of [{orgId:'foreign'},{confirmed:false},{state:'paused'},{revision:'0'},{reason:'arbitrary text'},{siteId:''}])assert.throws(()=>siteLifecycleInput({...body,...patch}),/Invalid/);
  assert.equal(archivedWriteAllowed('/api/retention','POST'),true);assert.equal(archivedWriteAllowed('/api/people/workers/worker-14/deletion','POST'),true);
  assert.equal(archivedWriteAllowed('/api/account/site','POST'),true);assert.equal(archivedWriteAllowed('/api/briefings','POST'),false);
});

test('PostgreSQL worker admission reads access policy after the site lock resolves',async()=>{
  const calls=[],client={async query(sql){calls.push(sql);if(sql.includes('FROM sites'))return {rows:[{id:'beirut'}]};if(sql.includes('FROM site_lifecycle'))return {rows:[]};return {rows:[{state:'paused'}]};}};
  await assert.rejects(pgWorkerSiteAccess(client,'cedar','beirut'),/Worker access paused/);
  assert.ok(calls[0].includes('FOR SHARE'));assert.ok(calls.at(-1).includes('FROM site_access_controls'));assert.ok(!calls[0].includes('site_access_controls'));
});

for(const pg of [false,true])test(`${pg?'postgres':'sqlite'}: site archive validates dependencies, freezes admission, preserves history and restores without worker access`,async()=>{
  const f=await fixture(pg),repo=pg?postgres:sqlite;
  const call=(name,...args)=>pg?repo[name](f.pool,...args,f.options):repo[name](f.db,...args);
  const p=n=>pg?`$${n}`:'?',now=new Date().toISOString();
  try{
    const created=await f.create(owner,input()),target={...owner,site_id:created.id,principal_id:created.ownerId};
    await f.query(`INSERT INTO briefings(id,org_id,site_id,title,source,state,created_at,updated_at) VALUES('archive-draft','cedar',${p(1)},'Retained draft','Synthetic retained source','draft',${p(2)},${p(3)})`,[created.id,now,now]);
    await f.query(`INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at,created_at) VALUES('archive-job','cedar',${p(1)},'archive-draft',1,'prepare','queued',${p(2)},${p(3)})`,[created.id,now,now]);
    const body={requestId:randomUUID(),siteId:created.id,revision:0,state:'archived',reason:'operational',confirmed:true};
    assert.equal((await call('inspectSiteLifecycle',owner,created.id)).dependencies[0].key,'jobs');
    await assert.rejects(async()=>call('saveSiteLifecycle',owner,body),/active dependencies/);
    assert.deepEqual(await call('siteLifecycleReceipt',owner,body.requestId),{found:false});
    await f.query("UPDATE jobs SET status='failed' WHERE id='archive-job'");
    await f.query(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES('archive-worker','cedar',${p(1)},'Archive worker','en')`,[created.id]);
    const grant=pg?await pgAuth.issueWorkerGrant(f.pool,target,'archive-worker',60,f.options):localAuth.issueWorkerGrant(f.db,target,'archive-worker',60);
    const before=JSON.stringify((await f.query("SELECT source FROM briefings WHERE id='archive-draft'")).rows);
    const archived=await call('saveSiteLifecycle',owner,body);assert.equal(archived.revision,1);assert.deepEqual(await call('saveSiteLifecycle',owner,body),{...archived,duplicate:true});
    assert.equal((await call('siteLifecycleReceipt',owner,body.requestId)).found,true);
    assert.equal((await f.list(owner)).items.find(s=>s.id===created.id).lifecycle,'archived');
    assert.equal((await f.query("SELECT revoked_at FROM worker_grants WHERE worker_id='archive-worker'")).rows[0].revoked_at!==null,true);
    await assert.rejects(async()=>pg?pgAuth.redeemWorkerGrant(f.pool,grant.token,f.options):localAuth.redeemWorkerGrant(f.db,grant.token),/Invalid credentials/);
    await assert.rejects(async()=>call('saveSiteAccess',owner,{...body,requestId:randomUUID(),revision:1,state:'active'}),/Site archived/);
    await assert.rejects(f.query("UPDATE briefings SET title='Changed' WHERE id='archive-draft'"),/Site archived/);
    await assert.rejects(f.query("UPDATE jobs SET status='queued' WHERE id='archive-job'"),/Site archived/);
    await assert.rejects(f.query(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES('forbidden-worker','cedar',${p(1)},'Forbidden worker','en')`,[created.id]),/Site archived/);
    // Privacy deactivation and pseudonymization are not blocked by operational archive.
    await f.query(`UPDATE workers SET active=${pg?'false':'0'} WHERE id='archive-worker'`);await f.query("UPDATE workers SET code='Deleted synthetic worker' WHERE id='archive-worker'");
    assert.equal(JSON.stringify((await f.query("SELECT source FROM briefings WHERE id='archive-draft'")).rows),before);
    assert.equal((await call('inspectSiteLifecycle',target,created.id)).state,'archived');
    await assert.rejects(async()=>call('saveSiteLifecycle',owner,{...body,reason:'security'}),/request conflict/);
    await assert.rejects(async()=>call('saveSiteLifecycle',owner,{...body,requestId:randomUUID(),siteId:'foreign'}),/Forbidden/);
    await assert.rejects(f.query('UPDATE site_lifecycle_requests SET request_json=request_json'),/immutable/);
    const restored=await call('saveSiteLifecycle',owner,{...body,requestId:randomUUID(),revision:1,state:'active'});assert.equal(restored.revision,2);
    const row=(await f.list(owner)).items.find(s=>s.id===created.id);assert.equal(row.lifecycle,'active');assert.equal(row.workerAccess,'paused');
    await call('saveSiteLifecycle',owner,body);assert.equal((await call('inspectSiteLifecycle',owner,created.id)).state,'active');
    await assert.rejects(async()=>call('saveSiteLifecycle',owner,{...body,requestId:randomUUID()}),/revision changed/);
    if(pg)await f.db.exec("CREATE FUNCTION fail_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='site.archived' THEN RAISE EXCEPTION 'Audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_lifecycle_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_lifecycle_audit()");
    else f.db.exec("CREATE TRIGGER fail_lifecycle_audit BEFORE INSERT ON audit WHEN NEW.action='site.archived' BEGIN SELECT RAISE(ABORT,'Audit failure'); END");
    const failed={...body,requestId:randomUUID(),revision:2};await assert.rejects(async()=>call('saveSiteLifecycle',owner,failed),/Audit failure/);
    assert.equal((await call('inspectSiteLifecycle',owner,created.id)).state,'active');assert.deepEqual(await call('siteLifecycleReceipt',owner,failed.requestId),{found:false});
  }finally{await f.close();}
});

test('site worker access input requires exact confirmation, revision, scoped target and safe reason',()=>{
  const input={requestId:randomUUID(),siteId:'beirut',revision:0,state:'paused',reason:'security',confirmed:true};
  assert.equal(siteAccessInput(input).state,'paused');
  for(const patch of [{confirmed:false},{revision:-1},{state:'archived'},{reason:'private text'},{orgId:'other'},{siteId:''}])assert.throws(()=>siteAccessInput({...input,...patch}),/Invalid/);
});
for(const pg of [false,true])test(`${pg?'postgres':'sqlite'}: site worker access revokes only worker admission, preserves history and resumes without reviving old links`,async()=>{
  const f=await fixture(pg),repo=pg?postgres:sqlite;
  const call=(name,...args)=>pg?repo[name](f.pool,...args,f.options):repo[name](f.db,...args);
  const issue=()=>pg?pgAuth.issueWorkerGrant(f.pool,owner,'access-worker',60,f.options):localAuth.issueWorkerGrant(f.db,owner,'access-worker',60);
  const redeem=token=>pg?pgAuth.redeemWorkerGrant(f.pool,token,f.options):localAuth.redeemWorkerGrant(f.db,token);
  try{
    await f.query(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES('access-worker','cedar','beirut','Synthetic access worker','en')`);
    const first=await issue(),workerSession=await redeem(first.token),unused=await issue();
    const active=await redeem(unused.token),staffSession=pg?await pgAuth.inSchema(f.pool,f.options.schema,client=>pgAuth.insertSession(client,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff')):localAuth.createSession(f.db,{id:'maya',org_id:'cedar',site_id:'beirut'},'staff','credential');
    const workerReq={headers:{cookie:`understood_session=${active.token}`}},staffReq={headers:{cookie:`understood_session=${staffSession.token}`}};
    const auth=req=>pg?pgAuth.requireSession(f.pool,req,f.options):localAuth.requireSession(f.db,req,{accessMode:'credential'});
    assert.equal((await auth(workerReq)).principal_type,'worker');
    const snapshot=JSON.stringify((await f.query('SELECT * FROM publications ORDER BY id')).rows);
    const body={requestId:randomUUID(),siteId:'beirut',revision:0,state:'paused',reason:'pilot_review',confirmed:true};
    const result=await call('saveSiteAccess',owner,body);assert.equal(result.revision,1);assert.deepEqual(await call('saveSiteAccess',owner,body),{...result,duplicate:true});
    assert.equal((await call('siteAccessReceipt',owner,body.requestId)).found,true);assert.equal((await f.list(owner)).items.find(r=>r.id==='beirut').workerAccess,'paused');
    assert.equal((await auth(staffReq)).principal_type,'staff');await assert.rejects(async()=>auth(workerReq),/Sign in required/);
    await assert.rejects(async()=>issue(),/Worker access paused/);await assert.rejects(async()=>redeem(first.token),/Invalid credentials/);
    const worker={principal_type:'worker',principal_id:'access-worker',org_id:'cedar',site_id:'beirut',access_mode:'demo'};
    await assert.rejects(async()=>pg?domainTransaction(f.pool,f.options.schema,c=>requirePrincipal(c,worker,'worker')):requireWorkerSiteAccess(f.db,'cedar','beirut'),/Worker access paused/);
    assert.equal(JSON.stringify((await f.query('SELECT * FROM publications ORDER BY id')).rows),snapshot);
    await assert.rejects(async()=>call('saveSiteAccess',{...owner,principal_id:'supervisor',role:'supervisor'},body),/Forbidden/);
    await assert.rejects(async()=>call('saveSiteAccess',owner,{...body,requestId:randomUUID(),siteId:'foreign'}),/Forbidden/);
    await assert.rejects(async()=>call('saveSiteAccess',owner,{...body,reason:'security'}),/request conflict/);
    const resume={...body,requestId:randomUUID(),revision:1,state:'active'};assert.equal((await call('saveSiteAccess',owner,resume)).revision,2);
    await assert.rejects(async()=>auth(workerReq),/Sign in required/);await assert.rejects(async()=>redeem(unused.token),/Invalid credentials/);
    const fresh=await issue();assert.ok((await redeem(fresh.token)).token);assert.ok(workerSession.token);
    await call('saveSiteAccess',owner,body);assert.equal((await f.list(owner)).items.find(r=>r.id==='beirut').workerAccess,'active');
    await assert.rejects(async()=>call('saveSiteAccess',owner,{...resume,requestId:randomUUID(),revision:0}),/revision changed/);
    await assert.rejects(f.query('UPDATE site_access_requests SET request_json=request_json'),/immutable/);
    if(pg)await f.db.exec("CREATE FUNCTION fail_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'site.worker_access_%' THEN RAISE EXCEPTION 'Audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_access_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_access_audit()");
    else f.db.exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON audit WHEN NEW.action LIKE 'site.worker_access_%' BEGIN SELECT RAISE(ABORT,'Audit failure'); END");
    const failed={...body,requestId:randomUUID(),revision:2};await assert.rejects(async()=>call('saveSiteAccess',owner,failed),/Audit failure/);
    assert.equal((await f.list(owner)).items.find(r=>r.id==='beirut').workerAccess,'active');assert.deepEqual(await call('siteAccessReceipt',owner,failed.requestId),{found:false});
    assert.equal((await auth(staffReq)).principal_type,'staff');
  }finally{await f.close();}
});
