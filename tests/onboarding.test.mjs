import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureBriefingSchema} from '../server/preparation.mjs';
import {ensureSettingsSchema} from '../server/settings.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import * as sqlite from '../server/onboarding.mjs';
import * as postgres from '../server/postgres/onboarding.mjs';
import {checkedSetupModel,checkedSetupResult,checkedSetupReceipt} from '../src/onboarding-recovery.ts';

for(const backend of ['sqlite','postgres'])test(`${backend}: onboarding resumes scoped progress without an approval gate or invented readiness`,async()=>{
  let db,api;
  const actor={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
  if(backend==='sqlite'){db=openDatabase(':memory:');seed(db);ensureBriefingSchema(db);ensureSettingsSchema(db);sqlite.ensureOnboardingSchema(db);api={get:s=>sqlite.getOnboarding(db,s),save:(s,value)=>sqlite.saveOnboarding(db,s,value),receipt:(s,id)=>sqlite.onboardingReceipt(db,s,id)};}
  else {db=new PGlite();const pool={async connect(){return {query:async(sql,values)=>values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};await runMigrations(pool);
    await db.exec("INSERT INTO organizations VALUES('cedar','Cedar Works');INSERT INTO sites VALUES('beirut','cedar','Beirut','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner');INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('shelf','cedar','beirut','Shelf','Source','draft');");
    api={get:s=>postgres.getOnboarding(pool,s),save:(s,value)=>postgres.saveOnboarding(pool,s,value),receipt:(s,id)=>postgres.onboardingReceipt(pool,s,id)};}
  try {
    const initial=checkedSetupModel(await api.get(actor),JSON.stringify(['cedar','beirut','maya']));assert.equal(initial.revision,0);assert.equal(initial.technical.liveReady,false);assert.equal(initial.technical.realDataAllowed,false);assert.equal(initial.checks.provider,false);
    const body={requestId:randomUUID(),revision:0,step:'briefing',firstBriefingId:'shelf',confirmed:true};
    assert.deepEqual(await api.save(actor,body),{revision:1,duplicate:false});assert.equal((await api.save(actor,body)).duplicate,true);
    await assert.rejects(async()=>api.save(actor,{...body,step:'provider'}),/conflict/);
    await assert.rejects(async()=>api.save(actor,{...body,requestId:randomUUID()}),/revision/);
    const resumed=await api.get(actor);assert.equal(resumed.step,'briefing');assert.equal(resumed.firstBriefingId,'shelf');assert.equal(resumed.savedTechnical.liveReady,false);assert.equal(resumed.checks.provider,false);
    assert.equal((await api.receipt(actor,body.requestId)).revision,1);
    const expected={requestId:body.requestId,expiresAt:new Date(Date.now()+3600_000).toISOString(),body:{revision:body.revision,step:body.step,firstBriefingId:body.firstBriefingId,confirmed:true}};
    assert.equal(checkedSetupResult(await api.save(actor,body),expected),1);assert.equal(checkedSetupReceipt(await api.receipt(actor,body.requestId),expected),1);
    checkedSetupModel(resumed,JSON.stringify(['cedar','beirut','maya']));
    await assert.rejects(async()=>api.save({...actor,role:'supervisor'},{...body,requestId:randomUUID(),revision:1}),/Forbidden/);
    await assert.rejects(async()=>api.save(actor,{...body,requestId:randomUUID(),revision:1,firstBriefingId:'foreign-briefing'}),/Invalid onboarding briefing/);
    await assert.rejects(async()=>api.save(actor,{...body,requestId:randomUUID(),revision:1,approved:true}),/Invalid onboarding request/);
    assert.deepEqual(await api.save(actor,{...body,requestId:randomUUID(),revision:1,step:'provider'}),{revision:2,duplicate:false});
    assert.equal((await api.get(actor)).technical.liveReady,false);
  }finally{await db.close();}
});
