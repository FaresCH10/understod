import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {saveUsageRequest,usageRequestReceipt,listUsageRequests} from '../server/postgres/usage-requests.mjs';
import {usageRequestInput} from '../server/usage-request-input.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential} from '../server/postgres/auth.mjs';

const owner={principal_type:'staff',principal_id:'owner',org_id:'org',site_id:'site',role:'owner'};
async function fixture(){
  const db=new PGlite(),options={schema:'understood_test_usage_requests'};let failAudit=false;
  const pool={async connect(){return {async query(sql,args){if(failAudit && sql.startsWith('INSERT INTO audit'))throw Error('Injected audit failure');return args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
  await db.exec("INSERT INTO organizations VALUES('org','Org'),('foreign','Foreign');INSERT INTO sites VALUES('site','org','Site','UTC'),('other','org','Other','UTC'),('foreign','foreign','Foreign','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','org','site','Owner','owner'),('supervisor','org','site','Supervisor','supervisor'),('admin','org','site','Admin','administrator'),('auditor','org','site','Auditor','auditor'),('other','org','other','Other owner','owner'),('foreign','foreign','foreign','Foreign owner','owner');");
  return {db,pool,options,setFail:value=>{failAudit=value;}};
}
const input=()=>({requestId:randomUUID(),kind:'quota',message:'Synthetic request for an allowance discussion.',confirmed:true});
test('usage requests require exact confirmed bounded input',()=>{
  const value=input();for(const change of [{confirmed:false},{kind:'purchase'},{message:''},{message:' padded '},{message:'x'.repeat(1001)},{message:'bad\u0000text'},{extra:1},{requestId:'bad'}])assert.throws(()=>usageRequestInput({...value,...change}),/Invalid/);
  assert.equal(usageRequestInput(value).message,value.message);
});
test('usage request receipts are scoped, exact and immutable; owner inbox is paged without applying quotas or payments',async()=>{
  const f=await fixture(),supervisor={...owner,principal_id:'supervisor',role:'supervisor'},value=input();try{
    const saved=await saveUsageRequest(f.pool,supervisor,value,f.options);assert.equal(saved.duplicate,false);assert.equal(saved.changesApplied,false);assert.equal(saved.delivery,'site_owner_inbox');
    assert.equal((await saveUsageRequest(f.pool,supervisor,value,f.options)).duplicate,true);
    assert.deepEqual((await usageRequestReceipt(f.pool,supervisor,value.requestId,f.options)).request,usageRequestInput(value));
    assert.deepEqual(await usageRequestReceipt(f.pool,owner,value.requestId,f.options),{found:false});
    await assert.rejects(saveUsageRequest(f.pool,supervisor,{...value,message:'Changed request'},f.options),/conflict/);
    await assert.rejects(saveUsageRequest(f.pool,owner,value,f.options),/conflict/);
    for(let n=0;n<11;n++)await saveUsageRequest(f.pool,owner,{...input(),kind:'contact',message:`Synthetic owner request ${n}`},f.options);
    const first=await listUsageRequests(f.pool,owner,{},f.options),second=await listUsageRequests(f.pool,owner,{page:2},f.options);
    assert.equal(first.total,12);assert.equal(first.items.length,10);assert.equal(second.items.length,2);assert.equal(first.scope,'site_owner_inbox');
    assert.equal((await listUsageRequests(f.pool,supervisor,{},f.options)).total,1);
    assert.equal((await listUsageRequests(f.pool,{...owner,principal_id:'other',site_id:'other'},{},f.options)).total,0);
    assert.equal((await listUsageRequests(f.pool,{...owner,principal_id:'foreign',site_id:'foreign',org_id:'foreign'},{},f.options)).total,0);
    for(const session of [{...owner,principal_type:'worker'},{...owner,role:'auditor',principal_id:'auditor'},{...owner,org_id:'foreign'}])await assert.rejects(saveUsageRequest(f.pool,session,input(),f.options),/Forbidden/);
    for(const query of [{page:0},{org_id:'foreign'},{page:'1.0'}])await assert.rejects(async()=>listUsageRequests(f.pool,owner,query,f.options),/Invalid/);
    assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM audit WHERE action='usage.change_requested'")).rows[0].n,12);
    for(const table of ['provider_policies','provider_operations','invoices','invoice_payments'])assert.equal((await f.db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n,0);
    await assert.rejects(f.db.exec('UPDATE usage_change_requests SET message=\'Changed\''),/immutable/);await assert.rejects(f.db.exec('DELETE FROM usage_change_requests'),/immutable/);
    await f.db.exec("UPDATE staff SET active=false WHERE id='supervisor'");await assert.rejects(usageRequestReceipt(f.pool,supervisor,value.requestId,f.options),/Forbidden/);
  }finally{await f.db.close();}
});
test('audit failure rolls back the usage request and preserves retry eligibility',async()=>{
  const f=await fixture(),value=input();try{f.setFail(true);await assert.rejects(saveUsageRequest(f.pool,owner,value,f.options),/audit failure/);f.setFail(false);
    assert.deepEqual(await usageRequestReceipt(f.pool,owner,value.requestId,f.options),{found:false});assert.equal((await saveUsageRequest(f.pool,owner,value,f.options)).duplicate,false);
  }finally{await f.db.close();}
});
test('credential usage request HTTP checks origin, page session, receipt and revocation',async()=>{
  const f=await fixture(),origin='http://127.0.0.1:3020',password=`Synthetic-${randomUUID()}!`,server=createPostgresRehearsalServer(f.pool,{...f.options,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin});
  try{
    await provisionStaffCredential(f.pool,{staffId:'owner',orgId:'org',siteId:'site',email:'owner@usage.example.test',password},f.options);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
    const login=await fetch(`${base}/auth/staff/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'owner@usage.example.test',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
    const session=await (await fetch(`${base}/session`,{headers:{cookie}})).json(),value=input();
    const post=(headers,body=value)=>fetch(`${base}/usage/requests`,{method:'POST',headers:{cookie,origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await fetch(`${base}/usage/requests`)).status,401);assert.equal((await post({})).status,409);assert.equal((await post({'x-client-session-context':session.clientContext,origin:'http://evil.example.test'})).status,403);
    const headers={'x-client-session-context':session.clientContext};const saved=await post(headers);assert.equal(saved.status,201);assert.equal(saved.headers.get('cache-control'),'no-store');assert.equal((await post(headers)).status,200);
    assert.equal((await post(headers,{...value,message:'Other'})).status,409);assert.equal((await post(headers,{...input(),extra:true})).status,400);
    const found=await fetch(`${base}/usage/requests/${value.requestId}`,{headers:{cookie,...headers}});assert.equal(found.status,200);assert.equal((await found.json()).found,true);
    assert.equal((await fetch(`${base}/usage/requests?org_id=foreign`,{headers:{cookie}})).status,400);
    await f.db.exec("UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_id='owner'");assert.equal((await post(headers)).status,401);
  }finally{if(server.listening)await new Promise(resolve=>server.close(resolve));await f.db.close();}
});
