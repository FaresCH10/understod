import test from 'node:test';
import {createSessionContextFetch} from './helpers/session-http.mjs';
const fetch=createSessionContextFetch();
import assert from 'node:assert/strict';
import {applicationCleanupEvidence} from '../server/deletion-scope.mjs';
import {readDeletionReceipt,verifyDeletionAcceptance,readPrivacyWorkerPage} from '../src/deletion-state.ts';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {createAppServer} from '../server/index.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {provisionStaffCredential} from '../server/auth.mjs';
import {provisionStaffCredential as pgProvision} from '../server/postgres/auth.mjs';
import {processOneDeletionRedaction} from '../server/deletion-redactions.mjs';
import {processOneDeletionRedaction as pgRedact} from '../server/postgres/deletion-redactions.mjs';
import {processOneDeletionPseudonym} from '../server/deletion-pseudonyms.mjs';
import {processOneDeletionPseudonym as pgPseudonym} from '../server/postgres/deletion-pseudonyms.mjs';
import {processOneDeletionCompletion} from '../server/deletion-completions.mjs';
import {processOneDeletionCompletion as pgComplete} from '../server/postgres/deletion-completions.mjs';

for(const backend of ['SQLite','PostgreSQL'])test(`${backend} deletion HTTP requires scoped authority and confirmation, reads progress and never repeats cleanup`,async()=>{
  const pg=backend==='PostgreSQL',db=pg?new PGlite():openDatabase(':memory:');
  const options={schema:'understood_test_deletion_http'},password='Synthetic-only-password-123';
  const pool={async connect(){return {async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  const config={tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:'http://127.0.0.1:3020'};
  let server;
  try{
    if(pg){
      await db.exec(`CREATE SCHEMA ${options.schema}`);await runMigrations(pool,options);
      await db.exec(`SET search_path TO ${options.schema},pg_catalog;
        INSERT INTO organizations VALUES('cedar','Synthetic'),('harbor','Foreign synthetic');
        INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC'),('harbor-yard','harbor','Foreign synthetic','UTC');
        INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner'),('viewer','cedar','beirut','Synthetic viewer','supervisor'),('administrator','cedar','beirut','Synthetic administrator','administrator'),('harbor-owner','harbor','harbor-yard','Foreign synthetic','owner');
        INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');`);
      server=createPostgresRehearsalServer(pool,{...config,...options});
    }else{
      seed(db);
      server=createAppServer(db,config);
      db.prepare("INSERT INTO staff VALUES('viewer','cedar','beirut','Synthetic viewer','supervisor',1)").run();
      db.prepare("INSERT INTO staff VALUES('administrator','cedar','beirut','Synthetic administrator','administrator',1)").run();
    }
    for(let index=1;index<=125;index++){
      const id=`privacy-${String(index).padStart(3,'0')}`,code=`Privacy ${String(index).padStart(3,'0')}`;
      if(pg)await db.query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES($1,'cedar','beirut',$2,'en')",[id,code]);
      else db.prepare("INSERT INTO workers(id,org_id,site_id,code,language) VALUES(?,'cedar','beirut',?,'en')").run(id,code);
    }
    for(const [id,orgId,siteId] of [['maya','cedar','beirut'],['viewer','cedar','beirut'],['administrator','cedar','beirut'],['harbor-owner','harbor','harbor-yard']]){
      if(pg)await pgProvision(pool,{staffId:id,orgId,siteId,email:`${id}@example.test`,password},options);
      else provisionStaffCredential(db,id,`${id}@example.test`,password);
    }
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const call=(path,cookie,body,origin=config.publicOrigin)=>fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    const login=async id=>(await call('/auth/staff/login',null,{email:`${id}@example.test`,password})).headers.get('set-cookie').split(';')[0];
    const owner=await login('maya'),viewer=await login('viewer'),foreign=await login('harbor-owner');
    const admin=await login('administrator');
    const listPath='/privacy/workers';
    assert.equal((await call(listPath,null)).status,401);
    assert.equal((await call(listPath,viewer)).status,403);
    const firstResponse=await call(listPath+'?pageSize=100',admin);
    assert.equal(firstResponse.status,200);assert.match(firstResponse.headers.get('cache-control'),/no-store/);
    const firstPage=await firstResponse.json(),secondPage=await (await call(listPath+'?pageSize=100&page=2',admin)).json();
    assert.deepEqual(readPrivacyWorkerPage(firstPage),firstPage);assert.deepEqual(readPrivacyWorkerPage(secondPage),secondPage);
    assert.ok(firstPage.total>100);assert.equal(firstPage.items.length,100);
    assert.equal(new Set([...firstPage.items,...secondPage.items].map(row=>row.id)).size,firstPage.total);
    assert.equal((await (await call(listPath+'?search=%25',admin)).json()).total,0);
    assert.equal((await (await call(listPath+'?search=worker-30',admin)).json()).total,1);
    assert.equal((await (await call(listPath,foreign)).json()).items.some(row=>row.id==='worker-30'),false);
    for(const query of ['org_id=harbor','status=invalid','page=5001','pageSize=101','pageSize=false','search='+('a'.repeat(81))])assert.equal((await call(`${listPath}?${query}`,admin)).status,400);
    const path='/people/workers/worker-30/deletion',input={requestId:randomUUID(),expectedCode:'Worker 030',reason:'worker_request',confirmed:true};
    assert.equal((await call(path,null)).status,401);
    assert.equal((await call(path,viewer)).status,403);
    assert.equal((await call(path,foreign)).status,404);
    assert.equal((await call(path,viewer,input)).status,403);
    assert.equal((await call(path,foreign,input)).status,404);
    assert.equal((await call(path,owner,input,'https://untrusted.invalid')).status,403);
    assert.equal(await (await call(path,owner)).json(),null);
    assert.equal((await call(path+'?org_id=harbor',owner,input)).status,400);
    for(const changed of [{confirmed:false},{requestId:'bad'},{org_id:'harbor'}])assert.equal((await call(path,owner,{...input,...changed})).status,400);
    assert.equal((await call(path,owner,{...input,expectedCode:'Changed label'})).status,409);
    const handler=server.listeners('request')[0];server.removeAllListeners('request');
    let lostAcknowledgement=true;
    server.on('request',(req,res)=>{
      if(lostAcknowledgement && req.method==='POST' && req.url===`/api${path}`){
        const end=res.end.bind(res);
        res.end=(...args)=>{if(res.statusCode===200){lostAcknowledgement=false;res.destroy();return res;}return end(...args);};
      }
      return handler(req,res);
    });
    await assert.rejects(()=>call(path,owner,input),/fetch failed/);
    const recovered=await call(path,owner);
    assert.equal(recovered.status,200);assert.match(recovered.headers.get('cache-control'),/no-store/);
    const accepted=await recovered.json();assert.equal(accepted.id,input.requestId);assert.equal(accepted.status,'queued');
    assert.deepEqual(accepted.cleanupEvidence,applicationCleanupEvidence());assert.deepEqual(readDeletionReceipt(accepted,'worker-30'),accepted);
    assert.equal((await (await call(path,owner,input)).json()).duplicate,true);
    assert.equal((await call(path,owner,{...input,reason:'customer_policy'})).status,409);
    assert.equal((await call('/people/workers/worker-30/reenable',owner,{requestId:randomUUID(),expectedCode:'Worker 030',confirmed:true})).status,409);
    const queued=await call(path,owner);assert.equal(queued.status,200);assert.equal((await queued.json()).status,'queued');
    assert.equal((await (await call(listPath+'?status=queued',admin)).json()).total,1);
    assert.equal((await (await call(listPath+'?status=none',admin)).json()).total,firstPage.total-1);
    const connection=pg?pool:db;
    assert.equal(await (pg?pgRedact:processOneDeletionRedaction)(connection,options),true);
    assert.equal(await (pg?pgPseudonym:processOneDeletionPseudonym)(connection,options),true);
    assert.equal(await (pg?pgComplete:processOneDeletionCompletion)(connection,{},options),true);
    const receipt=await (await call(path,owner)).json();
    assert.equal(receipt.status,'complete');assert.ok(receipt.completedAt);
    assert.deepEqual(receipt.cleanupEvidence,applicationCleanupEvidence());assert.deepEqual(readDeletionReceipt(receipt,'worker-30'),receipt);
    const duplicate=await (await call(path,owner,input)).json();verifyDeletionAcceptance(duplicate,input.requestId);assert.deepEqual(duplicate.cleanupEvidence,applicationCleanupEvidence());
    assert.doesNotMatch(JSON.stringify(receipt),/Worker 030|fingerprint|token_hash/);
    assert.equal((await (await call(path,owner,input)).json()).status,'complete');
    assert.equal(await (pg?pgComplete:processOneDeletionCompletion)(connection,{},options),false);
    const completed=await (await call(listPath+'?status=complete',admin)).json();
    assert.equal(completed.total,1);assert.match(completed.items[0].code,/^Deleted /);
    assert.deepEqual(readPrivacyWorkerPage(completed),completed);assert.deepEqual(completed.items[0].cleanupEvidence,applicationCleanupEvidence());
    assert.doesNotMatch(JSON.stringify(completed),/Worker 030|fingerprint|token_hash|answer_text/);
    const adminInput={requestId:randomUUID(),expectedCode:'Privacy 001',reason:'customer_policy',confirmed:true};
    assert.equal((await call('/people/workers/privacy-001/deletion',admin,adminInput)).status,200);
    assert.equal((await (await call('/people/workers/privacy-001/deletion',admin)).json()).status,'queued');
  }finally{
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await db.close();
  }
});
