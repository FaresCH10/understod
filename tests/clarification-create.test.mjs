import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {ensureRecordingSchema} from '../server/recordings.mjs';
import {ensureCaseMessageSchema} from '../server/case-messages.mjs';
import * as sqliteCases from '../server/clarifications.mjs';
import * as sqlite from '../server/clarification-create.mjs';
import * as postgresCases from '../server/postgres/clarifications.mjs';
import * as postgres from '../server/postgres/clarification-create.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {clarificationCreationInput,clarificationSubjectFilters} from '../server/clarification-create-input.mjs';
import {clarificationDetailView} from '../server/clarification-view.mjs';
import {checkedClarificationDetail} from '../src/clarification-contract.ts';

const owner={principal_type:'staff',principal_id:'owner',org_id:'org',site_id:'site',role:'owner'};
const input=(extra={})=>({requestId:randomUUID(),assignmentId:'assignment',publicationId:'publication',version:3,attemptId:null,reason:'Synthetic private supervisor follow-up',...extra});
async function fixture(engine){
  const pg=engine==='PostgreSQL',db=pg?new PGlite():openDatabase(':memory:');
  const pool=pg?{async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release(){}};}}:null;
  if(pg)await runMigrations(pool);else{ensureRecordingSchema(db);sqliteCases.ensureClarificationSchema(db);ensureCaseMessageSchema(db);}
  const exec=sql=>db.exec(sql),rows=async sql=>pg?(await db.query(sql)).rows:db.prepare(sql).all();
  const api=pg?postgres:sqlite,cases=pg?postgresCases:sqliteCases,target=pg?pool:db;
  await exec(`INSERT INTO organizations VALUES('org','Synthetic'),('foreign','Other synthetic');
    INSERT INTO sites VALUES('site','org','Synthetic','UTC'),('foreign-site','foreign','Other','UTC');
    INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','org','site','Synthetic owner','owner'),('supervisor','org','site','Synthetic supervisor','supervisor'),
      ('auditor','org','site','Audit','auditor'),('administrator','org','site','Admin','administrator'),('foreign-owner','foreign','foreign-site','Other','owner');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','org','site','Worker 014','en'),('foreign-worker','foreign','foreign-site','Other','en');
    INSERT INTO briefings(id,org_id,site_id,title,source,state,created_at,updated_at) VALUES('brief','org','site','Synthetic','Synthetic source','ready','2026-10-01T09:00:00.000Z','2026-10-01T09:00:00.000Z'),('foreign-brief','foreign','foreign-site','Other','Other source','ready','2026-10-01T09:00:00.000Z','2026-10-01T09:00:00.000Z');
    INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state,published_at) VALUES('publication','org','site','brief',3,'{"title":"Synthetic frozen title","question":"Where?","facts":["Blue shelf"],"rubric":{"askedFacts":["Blue shelf"]},"languages":{"en":{"text":"Synthetic source","question":"Where?"}}}','published','2026-10-01T09:00:00.000Z'),('foreign-publication','foreign','foreign-site','foreign-brief',1,'{"languages":{"en":{"text":"Other synthetic source","question":"Where?"}}}','published','2026-10-01T09:00:00.000Z');
    INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language,created_at) VALUES('assignment','org','site','publication','worker','en','2026-10-01T09:00:00.000Z'),('foreign-assignment','foreign','foreign-site','foreign-publication','foreign-worker','en','2026-10-01T09:00:00.000Z');`);
  const call=(name,session,...args)=>api[name](target,session,...args),caseCall=(name,session,...args)=>cases[name](target,session,...args);
  const attempt=(id='original',time='2026-10-01T10:00:00.000Z')=>exec(`INSERT INTO attempts(id,org_id,${pg?'site_id,':''}assignment_id,submission_id,answer_text,outcome,reasons_json,received_at${pg?',assessment_status':''})
    VALUES('${id}','org',${pg?"'site',":''}'assignment','${id}-submission','Synthetic preserved answer','matched','[]','${time}'${pg?",'complete'":''})`);
  const counts=async()=>Object.fromEntries(await Promise.all(['clarifications','clarification_creations','help_requests','case_messages','attempts','submission_receipts','case_routing','audit'].map(async table=>[table,(await rows(`SELECT count(*) AS n FROM ${table}`))[0].n])));
  return {pg,db,pool,exec,rows,call,caseCall,attempt,counts,close:()=>db.close()};
}

test('staff creation canonical intent excludes private copies from receipts and rejects malformed selectors before database access',()=>{
  const value=input({reason:'  Synthetic private reason  '});assert.equal(clarificationCreationInput(value).content.reason,'Synthetic private reason');
  for(const bad of [{...value,extra:true},{...value,attemptId:undefined},{...value,version:0},{...value,assignmentId:'../other'},{...value,reason:'bad'},{...value,reason:'x'.repeat(501)}])assert.throws(()=>clarificationCreationInput(bad),/Invalid/);
  assert.deepEqual(clarificationSubjectFilters({page:'2',pageSize:'10',search:'  Synthetic  '}),{page:2,pageSize:10,search:'Synthetic'});
  for(const bad of [{page:'01'},{page:0},{pageSize:20},{search:'x'.repeat(81)},{org_id:'foreign'}])assert.throws(()=>clarificationSubjectFilters(bad),/Invalid/);
});
for(const engine of ['SQLite','PostgreSQL']){
  test(`${engine} assignment selection is scoped and truly paged, with independent follow-up available before assessment`,async()=>{
    const f=await fixture(engine);try{
      for(let index=1;index<=11;index++)await f.exec(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES('page-worker-${index}','org','site','Worker ${String(index).padStart(3,'0')}','en');
        INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language,created_at) VALUES('page-assignment-${index}','org','site','publication','page-worker-${index}','en','2026-10-01T09:00:00.000Z');`);
      const first=await f.call('listClarificationSubjects',owner,{page:1}),second=await f.call('listClarificationSubjects',owner,{page:2});
      assert.equal(first.total,12);assert.equal(first.items.length,10);assert.equal(second.items.length,2);
      assert.equal(new Set([...first.items,...second.items].map(row=>row.assignmentId)).size,12);
      assert.equal((await f.call('listClarificationSubjects',owner,{page:3})).items.length,0);
      for(const role of ['auditor','administrator'])await assert.rejects(async()=>f.call('listClarificationSubjects',{...owner,principal_id:role,role}),/Forbidden/);
      if(f.pg){
        await f.exec("INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,assessment_status,reasons_json) VALUES('pending','org','site','assignment','pending-submission','Synthetic pending answer',NULL,'pending','[]')");
        assert.equal((await f.call('getClarificationSubject',owner,'assignment')).latestAttempt.complete,false);
        await assert.rejects(f.call('createStaffClarification',owner,input({attemptId:'pending'})),/selected answer unavailable/);
      }
      assert.equal((await f.call('createStaffClarification',owner,input())).attemptId,null);
    }finally{await f.close();}
  });
  test(`${engine} staff creates an independent case with truthful private provenance, exact replay and no answer/help/message fabrication`,async()=>{
    const f=await fixture(engine);try{
      const before=await f.counts(),body=input(),receipt=await f.call('createStaffClarification',owner,body);
      assert.equal(receipt.caseId,body.requestId);assert.equal(receipt.attemptId,null);assert.equal(receipt.requestHash,clarificationCreationInput(body).hash);
      assert.equal(JSON.stringify(receipt).includes(body.reason),false);
      assert.deepEqual(await f.call('createStaffClarification',owner,{...body,reason:` ${body.reason} `}),receipt);
      assert.deepEqual(await f.call('staffClarificationCreationReceipt',owner,body.requestId),receipt);
      const after=await f.counts();for(const table of ['help_requests','case_messages','attempts','submission_receipts'])assert.equal(after[table],before[table]);
      assert.equal(after.clarifications,before.clarifications+1);assert.equal(after.clarification_creations,1);assert.equal(after.case_routing,before.case_routing+1);
      const detail=await f.caseCall('getClarification',owner,receipt.caseId);
      assert.equal(detail.helpRequest,null);assert.equal(detail.staffCreation.actorId,'owner');assert.equal(detail.reason,`Staff follow-up: ${body.reason}`);
      assert.equal(checkedClarificationDetail(clarificationDetailView(detail,'a'.repeat(64)),receipt.caseId,'a'.repeat(64)).staffCreation.actorName,'Synthetic owner');
      const workerCase=(await f.caseCall('workerHelpCases',{principal_type:'worker',principal_id:'worker',org_id:'org',site_id:'site'},'assignment'))[0];
      assert.equal(workerCase.helpText,null);assert.equal(JSON.stringify(workerCase).includes(body.reason),false);
      await assert.rejects(async()=>f.call('createStaffClarification',owner,{...body,reason:'Different private reason'}),/creation conflict/);
      await f.caseCall('resolveClarification',owner,receipt.caseId,{notes:'Synthetic human follow-up recorded'});
      await f.exec("UPDATE publications SET state='withdrawn' WHERE id='publication'");
      assert.deepEqual(await f.call('createStaffClarification',owner,body),receipt);
      assert.deepEqual(await f.call('staffClarificationCreationReceipt',owner,body.requestId),receipt);
      await assert.rejects(async()=>f.exec('UPDATE clarification_creations SET publication_version=4'),/immutable/);
      await assert.rejects(async()=>f.exec('DELETE FROM clarification_creations'),/immutable/);
    }finally{await f.close();}
  });
  test(`${engine} original completed answer linkage is exact, rejects already-linked and changed answers, and does not rewrite original outcomes`,async()=>{
    const f=await fixture(engine);try{
      await f.attempt();const before=JSON.stringify(await f.rows('SELECT * FROM attempts'));
      const selected=await f.call('getClarificationSubject',owner,'assignment');assert.equal(selected.latestAttempt.id,'original');assert.equal(selected.latestAttempt.existingCaseId,null);
      const receipt=await f.call('createStaffClarification',owner,input({attemptId:'original'}));
      assert.equal((await f.caseCall('getClarification',owner,receipt.caseId)).outcome,'matched');
      assert.equal(JSON.stringify(await f.rows('SELECT * FROM attempts')),before);
      await assert.rejects(async()=>f.call('createStaffClarification',owner,input({attemptId:'original'})),/already has a case/);
      assert.equal((await f.call('getClarificationSubject',owner,'assignment')).latestAttempt.existingCaseId,receipt.caseId);
      await f.attempt('newer','2026-10-02T10:00:00.000Z');
      await assert.rejects(async()=>f.call('createStaffClarification',owner,input({attemptId:'original'})),/selected answer changed/);
      const independent=await f.call('createStaffClarification',owner,input());assert.equal(independent.attemptId,null);
      assert.equal((await f.rows('SELECT count(*) AS n FROM attempts'))[0].n,2);
      assert.equal((await f.rows('SELECT count(*) AS n FROM clarifications'))[0].n,2);
    }finally{await f.close();}
  });
  test(`${engine} staff creation selectors and receipts reject foreign scopes, readonly roles, changed authority and unavailable targets`,async()=>{
    const f=await fixture(engine);try{
      assert.equal((await f.call('listClarificationSubjects',owner,{search:'frozen'})).total,1);
      assert.equal((await f.call('listClarificationSubjects',owner,{search:'%'})).total,0);
      await assert.rejects(async()=>f.call('getClarificationSubject',owner,'foreign-assignment'),/unavailable/);
      for(const role of ['auditor','administrator'])await assert.rejects(async()=>f.call('createStaffClarification',{...owner,principal_id:role,role},input()),/Forbidden/);
      const body=input(),receipt=await f.call('createStaffClarification',owner,body),sup={...owner,principal_id:'supervisor',role:'supervisor'};
      await assert.rejects(async()=>f.call('createStaffClarification',sup,body),/conflict/);
      await assert.rejects(async()=>f.call('staffClarificationCreationReceipt',sup,receipt.requestId),/unavailable/);
      await assert.rejects(async()=>f.call('createStaffClarification',owner,input({assignmentId:'foreign-assignment',publicationId:'foreign-publication',version:1})),/unavailable/);
      await assert.rejects(async()=>f.call('createStaffClarification',owner,input({version:4})),/unavailable/);
      await f.exec(`UPDATE workers SET active=${f.pg?'false':'0'} WHERE id='worker'`);
      await assert.rejects(async()=>f.call('getClarificationSubject',owner,'assignment'),/unavailable/);
      await assert.rejects(async()=>f.call('createStaffClarification',owner,input()),/unavailable/);
      assert.deepEqual(await f.call('staffClarificationCreationReceipt',owner,body.requestId),receipt);
      await f.exec("UPDATE staff SET role='supervisor' WHERE id='owner'");
      await assert.rejects(async()=>f.call('createStaffClarification',{...owner,role:'supervisor'},body),/conflict/);
      await assert.rejects(async()=>f.call('staffClarificationCreationReceipt',{...owner,role:'supervisor'},body.requestId),/unavailable/);
    }finally{await f.close();}
  });
  test(`${engine} creation audit failure rolls back case, routing and receipt together before exact retry`,async()=>{
    const f=await fixture(engine);try{
      const before=await f.counts(),body=input();
      await f.exec(f.pg?`CREATE FUNCTION fail_create_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='clarification.created' THEN RAISE EXCEPTION 'Injected creation audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_create_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_create_audit();`:
        "CREATE TRIGGER fail_create_audit BEFORE INSERT ON audit WHEN NEW.action='clarification.created' BEGIN SELECT RAISE(ABORT,'Injected creation audit failure');END;");
      await assert.rejects(async()=>f.call('createStaffClarification',owner,body),/Injected creation audit failure/);assert.deepEqual(await f.counts(),before);
      await f.exec(f.pg?'DROP TRIGGER fail_create_audit ON audit;DROP FUNCTION fail_create_audit()':'DROP TRIGGER fail_create_audit');
      assert.equal((await f.call('createStaffClarification',owner,body)).caseId,body.requestId);
    }finally{await f.close();}
  });
}
