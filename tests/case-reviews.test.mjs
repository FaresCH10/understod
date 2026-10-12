import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {processOneAssessment} from '../server/postgres/assessment-worker.mjs';
import {saveCaseReview,caseReviewReceipt,listCaseReviews} from '../server/postgres/case-reviews.mjs';
import {getClarification,listClarifications,resolveClarification,requestHelp} from '../server/postgres/clarifications.mjs';
import {processOneCaseEscalation,routeNewCase} from '../server/postgres/case-routing.mjs';
import {listCaseMessages} from '../server/postgres/case-messages.mjs';
import {requestWorkerDeletion} from '../server/postgres/deletions.mjs';
import {processOneDeletionRedaction} from '../server/postgres/deletion-redactions.mjs';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const worker={principal_type:'worker',principal_id:'worker-14',org_id:'cedar',site_id:'beirut'};
const disagree=()=>({requestId:randomUUID(),kind:'disagree',reason:'Synthetic supervisor disagreement with the original assessment.'});
async function fixture() {
  const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
  await runMigrations(pool);
  await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
    INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner'),('other','cedar','beirut','Other','supervisor'),('audit','cedar','beirut','Audit','auditor');
    INSERT INTO site_settings(site_id,org_id,revision,primary_contact_id,deputy_contact_id) VALUES('beirut','cedar',0,'maya','other');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-14','cedar','beirut','Worker 014','en');
    INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('shelf','cedar','beirut','Synthetic','Synthetic','draft');
    INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('shelf-v3','cedar','beirut','shelf',3,
      '{"title":"Synthetic","question":"Where?","facts":["Blue shelf"],"rubric":{"askedFacts":["Blue shelf"]},"languages":{"en":{"text":"Blue shelf","question":"Where?"}}}','published');
    INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language,due_at) VALUES('assignment-14','cedar','beirut','shelf-v3','worker-14','en',clock_timestamp()+interval '1 hour');`);
  const original=await submitAnswer(pool,worker,'assignment-14',randomUUID(),'Synthetic incomplete answer');
  await processOneAssessment(pool,{assess:async()=>({outcome:'clarification',reasons:['missing_asked_fact'],evidence:[]})});
  const caseId=(await db.query('SELECT id FROM clarifications')).rows[0].id;
  const deadline=async()=>({requestId:randomUUID(),kind:'deadline',dueAt:new Date(Date.now()+2*86400000).toISOString(),expectedDueAt:(await getClarification(pool,owner,caseId)).case_due_at});
  return {db,pool,caseId,original,deadline,save:body=>saveCaseReview(pool,owner,caseId,body),close:()=>db.close()};
}

test('case deadline ledger supports exact recovery, rejects stale edits and never changes assignment or original evidence',async()=>{
  const f=await fixture();try {
    const before=(await f.db.query('SELECT * FROM attempts')).rows,assignment=(await f.db.query('SELECT * FROM assignments')).rows,routing=(await f.db.query('SELECT * FROM case_routing')).rows;
    const input=await f.deadline(),receipt=await f.save(input);assert.equal(receipt.dueAt,input.dueAt);assert.deepEqual(await f.save(input),receipt);
    assert.deepEqual(await caseReviewReceipt(f.pool,owner,f.caseId,input.requestId),receipt);
    assert.equal((await getClarification(f.pool,owner,f.caseId)).case_due_at,input.dueAt);
    await assert.rejects(f.save({...input,requestId:randomUUID(),dueAt:new Date(Date.now()+3*86400000).toISOString()}),/deadline changed/);
    await assert.rejects(f.save({...input,dueAt:new Date(Date.now()+4*86400000).toISOString()}),/request conflict/);
    await assert.rejects(f.save({...await f.deadline(),dueAt:input.dueAt}),/unchanged/);
    assert.deepEqual((await f.db.query('SELECT * FROM attempts')).rows,before);assert.deepEqual((await f.db.query('SELECT * FROM assignments')).rows,assignment);assert.deepEqual((await f.db.query('SELECT * FROM case_routing')).rows,routing);
    assert.equal((await listCaseReviews(f.pool,owner,f.caseId)).length,1);
    await assert.rejects(f.db.exec("UPDATE case_reviews SET due_at=due_at+interval '1 hour'"),/immutable/);await assert.rejects(f.db.exec('DELETE FROM case_reviews'),/immutable/);
  }finally{await f.close();}
});

test('extended case deadline controls overdue filters and prevents escalation at the previous deadline',async()=>{
  const f=await fixture();try {
    const id=randomUUID();await f.db.query("INSERT INTO clarifications(id,org_id,site_id,assignment_id,reason,status,created_at) VALUES($1,'cedar','beirut','assignment-14','Synthetic overdue','open',clock_timestamp()-interval '25 hours')",[id]);
    const client=await f.pool.connect();await routeNewCase(client,'cedar','beirut',id);client.release();
    const old=await getClarification(f.pool,owner,id);assert.ok(Date.parse(old.case_due_at)<Date.now());
    assert.equal((await listClarifications(f.pool,owner,{overdue:'true'})).rows.some(row=>row.id===id),true);
    const dueAt=new Date(Date.now()+3600000).toISOString();await saveCaseReview(f.pool,owner,id,{requestId:randomUUID(),kind:'deadline',dueAt,expectedDueAt:old.case_due_at});
    assert.equal((await listClarifications(f.pool,owner,{overdue:'true'})).rows.some(row=>row.id===id),false);
    assert.equal((await listClarifications(f.pool,owner,{overdue:'false'})).rows.some(row=>row.id===id),true);
    assert.equal(await processOneCaseEscalation(f.pool),false);assert.equal((await getClarification(f.pool,owner,id)).owner_staff_id,'maya');
    assert.ok(Date.parse((await f.db.query('SELECT due_at FROM case_routing WHERE case_id=$1',[id])).rows[0].due_at)<Date.now());
  }finally{await f.close();}
});

test('disagreement is staff-private, append-only and attached to the unchanged original assessment',async()=>{
  const f=await fixture();try {
    const before=(await f.db.query('SELECT * FROM attempts')).rows,input=disagree(),receipt=await f.save(input);assert.equal(receipt.attemptId,f.original.id);
    assert.deepEqual(await f.save({...input,reason:` ${input.reason} `}),receipt);
    assert.deepEqual((await f.db.query('SELECT * FROM attempts')).rows,before);assert.equal((await getClarification(f.pool,owner,f.caseId)).outcome,'clarification');
    assert.equal(JSON.stringify(await listCaseMessages(f.pool,worker,f.caseId)).includes(input.reason),false);
    await resolveClarification(f.pool,owner,f.caseId,{notes:'Synthetic human resolution'});assert.equal((await f.save(disagree())).kind,'disagree');
    await assert.rejects(f.save(await f.deadline()),/unavailable/);
    await assert.rejects(f.db.exec("UPDATE case_reviews SET reason='Different reason'"),/immutable/);
    await assert.rejects(f.db.exec("UPDATE case_reviews SET reason='[Deleted]'"),/immutable/);
    const helpId=randomUUID();await requestHelp(f.pool,worker,'assignment-14',{requestId:helpId,text:'Synthetic help request'});
    await assert.rejects(saveCaseReview(f.pool,owner,helpId,disagree()),/Original assessment unavailable/);
  }finally{await f.close();}
});

test('case review role, site, exact author, active-worker and canonical input fences hold',async()=>{
  const f=await fixture();try {
    const input=disagree();await f.save(input);
    for(const principal of [worker,{...owner,principal_id:'audit',role:'auditor'},{...owner,site_id:'foreign'},{...owner,role:'supervisor'}])await assert.rejects(saveCaseReview(f.pool,principal,f.caseId,disagree()),/Forbidden|unavailable/);
    assert.equal((await listCaseReviews(f.pool,{...owner,principal_id:'audit',role:'auditor'},f.caseId)).length,1);
    await assert.rejects(caseReviewReceipt(f.pool,{...owner,principal_id:'other',role:'supervisor'},f.caseId,input.requestId),/unavailable/);
    for(const body of [{...disagree(),extra:1},{...disagree(),reason:'bad'},{...disagree(),reason:'x'.repeat(1001)},{...await f.deadline(),dueAt:'2026-10-14'},{...await f.deadline(),expectedDueAt:undefined},{...await f.deadline(),dueAt:new Date(Date.now()-1000).toISOString()},{...await f.deadline(),dueAt:new Date(Date.now()+31*86400000).toISOString()}])await assert.rejects(f.save(body),/Invalid/);
    await f.db.exec("UPDATE workers SET active=false WHERE id='worker-14'");await assert.rejects(f.save(disagree()),/unavailable/);
  }finally{await f.close();}
});

test('case review and effective deadline roll back if audit cannot be recorded',async()=>{
  const f=await fixture();try {
    const input=await f.deadline();await f.db.exec("CREATE FUNCTION deny_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='clarification.deadline_changed' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER deny_review_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION deny_review_audit()");
    await assert.rejects(f.save(input),/audit failure/);assert.equal((await listCaseReviews(f.pool,owner,f.caseId)).length,0);assert.equal((await getClarification(f.pool,owner,f.caseId)).case_due_at,input.expectedDueAt);
  }finally{await f.close();}
});

test('worker deletion fences new reviews and redacts private disagreement while retaining receipt metadata',async()=>{
  const f=await fixture();try {
    const input=disagree();await f.save(input);
    await requestWorkerDeletion(f.pool,owner,'worker-14',{requestId:randomUUID(),expectedCode:'Worker 014',reason:'worker_request',confirmed:true});
    await assert.rejects(f.save(disagree()),/unavailable/);assert.equal(await processOneDeletionRedaction(f.pool),true);
    await assert.rejects(f.db.exec('UPDATE case_reviews SET reason=NULL'),/immutable/);
    const receipt=await caseReviewReceipt(f.pool,owner,f.caseId,input.requestId);assert.equal(receipt.reason,'[Deleted]');assert.equal(receipt.attemptId,f.original.id);
    assert.equal((await f.db.query('SELECT count(*)::int n FROM submission_receipts')).rows[0].n,1);
  }finally{await f.close();}
});
