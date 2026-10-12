import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {getCaseRetention,saveCaseRetention,caseRetentionReceipt,processOneCaseContentPurge} from '../server/postgres/case-retention.mjs';
import {resolveClarification,getClarification} from '../server/postgres/clarifications.mjs';
import {saveCaseReview,listCaseReviews} from '../server/postgres/case-reviews.mjs';
import {processOneCaseFollowup,processOneCaseFollowupPurge,getCaseFollowupAudio} from '../server/postgres/case-followups.mjs';
import {processOneCaseVoicePurge,getCaseVoiceAudio} from '../server/postgres/case-voice.mjs';
import {sendCaseMessage} from '../server/postgres/case-messages.mjs';
import {requestWorkerDeletion} from '../server/postgres/deletions.mjs';
import {processOneDeletionRedaction} from '../server/postgres/deletion-redactions.mjs';

const owner={principal_type:'staff',principal_id:'owner',org_id:'test',site_id:'site',role:'owner'};
const policy=()=>({requestId:randomUUID(),revision:0,days:30,confirmed:true});
async function fixture() {
  const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
  await runMigrations(pool);
  await db.exec(`INSERT INTO organizations VALUES('test','Synthetic'),('other','Other synthetic');
    INSERT INTO sites VALUES('site','test','Synthetic site','UTC'),('other-site','other','Other site','UTC');
    INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','test','site','Owner','owner'),('sup','test','site','Supervisor','supervisor');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','test','site','Synthetic worker','en'),('foreign-worker','other','other-site','Foreign worker','en');
    INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('b','test','site','Synthetic title','Synthetic source','ready'),('foreign-b','other','other-site','Foreign title','Foreign source','ready');
    INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('p','test','site','b',1,'{}','published'),('foreign-p','other','other-site','foreign-b',1,'{}','published');
    INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('a','test','site','p','worker','en'),('foreign-a','other','other-site','foreign-p','foreign-worker','en');
    INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,assessment_status) VALUES('attempt','test','site','a','original','Synthetic original answer','clarification','[]','complete');`);
  const ids={old:randomUUID(),open:randomUUID(),fresh:randomUUID(),recent:randomUUID(),foreign:randomUUID()};
  // Authored historical SQL fixtures isolate expiry guards, not real past workflow.
  await db.exec('ALTER TABLE clarifications DISABLE TRIGGER case_resolution_clock');
  for(const [kind,id] of Object.entries(ids)) {
    const foreign=kind==='foreign';
    await db.query(`INSERT INTO clarifications(id,org_id,site_id,assignment_id,attempt_id,reason,notes,status,created_at,resolved_at)
      VALUES($1,$2,$3,$4,$5,'Synthetic reason','Synthetic resolution',$6,clock_timestamp()-interval '50 days',
        CASE WHEN $6='resolved' THEN clock_timestamp()-$7*interval '1 day' ELSE NULL END)`,
      [id,foreign?'other':'test',foreign?'other-site':'site',foreign?'foreign-a':'a',kind==='old'?'attempt':null,kind==='open'?'open':'resolved',kind==='fresh'?1:40]);
  }
  await db.exec('ALTER TABLE clarifications ENABLE TRIGGER case_resolution_clock');
  const message=async(caseId,{age=40,id=randomUUID()}={})=>{
    await db.query(`INSERT INTO case_messages(id,org_id,site_id,case_id,assignment_id,actor_type,actor_id,language,text,request_hash,created_at)
      VALUES($1,'test','site',$2,'a','worker','worker','en','Synthetic message',$3,clock_timestamp()-$4*interval '1 day')`,[id,caseId,'b'.repeat(64),age]);return id;
  };
  await message(ids.recent,{age:1});
  return {db,pool,ids,message,close:()=>db.close()};
}

test('case policy is separate, confirmed, revisioned and actor/scope exact; resolution starts an honest new clock',async()=>{
  const f=await fixture();try {
    assert.equal((await getCaseRetention(f.pool,owner)).days,null);
    assert.equal(await processOneCaseContentPurge(f.pool),false);
    const input=policy();
    await assert.rejects(saveCaseRetention(f.pool,{...owner,principal_id:'sup',role:'supervisor'},input),/Forbidden/);
    await assert.rejects(saveCaseRetention(f.pool,{...owner,site_id:'other-site'},input),/Forbidden/);
    await assert.rejects(async()=>saveCaseRetention(f.pool,owner,{...input,confirmed:false}),/Invalid/);
    assert.deepEqual(await saveCaseRetention(f.pool,owner,input),{revision:1,duplicate:false});
    assert.deepEqual(await saveCaseRetention(f.pool,owner,input),{revision:1,duplicate:true});
    assert.equal((await caseRetentionReceipt(f.pool,owner,input.requestId)).request.days,30);
    await assert.rejects(saveCaseRetention(f.pool,owner,{...input,days:7}),/conflict/);
    await assert.rejects(saveCaseRetention(f.pool,owner,{...input,requestId:randomUUID()}),/revision changed/);
    const now=Date.now();await resolveClarification(f.pool,owner,f.ids.open,{notes:'Synthetic new resolution'});
    assert.ok(new Date((await f.db.query('SELECT resolved_at FROM clarifications WHERE id=$1',[f.ids.open])).rows[0].resolved_at).getTime()>=now);
    await assert.rejects(f.db.query("UPDATE clarifications SET resolved_at=clock_timestamp()-interval '40 days' WHERE id=$1",[f.ids.open]),/clock is immutable/);
    await saveCaseRetention(f.pool,owner,{requestId:randomUUID(),revision:1,days:null,confirmed:true});
    assert.equal(await processOneCaseContentPurge(f.pool),false);
    await assert.rejects(f.db.exec('DELETE FROM case_retention_requests'),/immutable/);
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM text_retention_policies')).rows[0].n,0);
  }finally{await f.close();}
});

test('expired resolved case content is redacted atomically; open/recent/foreign history and outcomes survive; voices retry physical removal',async()=>{
  const f=await fixture();try {
    const caseId=f.ids.old,messageId=await f.message(caseId),followupId=randomUUID(),voiceId=randomUUID(),voiceRequest=randomUUID();
    await f.db.query("INSERT INTO help_requests VALUES($1,'test','site','a','Synthetic private help',clock_timestamp()-interval '40 days')",[caseId]);
    await f.db.query(`INSERT INTO case_reviews(id,org_id,site_id,case_id,assignment_id,actor_id,actor_role,kind,request_hash,reason,attempt_id,created_at)
      VALUES($1,'test','site',$2,'a','owner','owner','disagree',$3,'Synthetic disagreement','attempt',clock_timestamp()-interval '40 days')`,[randomUUID(),caseId,'c'.repeat(64)]);
    await f.db.query(`INSERT INTO case_followups(id,org_id,site_id,case_id,assignment_id,publication_id,actor_id,actor_role,language,source_text,request_hash,glossary_json,status,lease_token,lease_until,created_at)
      VALUES($1,'test','site',$2,'a','p','owner','owner','en','Synthetic follow-up',$3,'{"private":"term"}','processing','old-claim',clock_timestamp()+interval '3 minutes',clock_timestamp()-interval '40 days')`,[followupId,caseId,'d'.repeat(64)]);
    await f.db.query(`INSERT INTO case_followup_audio(id,request_id,org_id,site_id,job_lease,language,text_hash,sha256,bytes,duration_seconds,state)
      VALUES('followup-audio',$1,'test','site','old-claim','en',$2,$2,32044,1,'storing')`,[followupId,'e'.repeat(64)]);
    await f.db.exec("UPDATE case_followup_audio SET state='attached';UPDATE case_followups SET status='delivered',lease_token=NULL,lease_until=NULL,delivered_at=clock_timestamp()-interval '40 days',manifest_json='{\"private\":\"Synthetic translation\"}'");
    await f.db.query(`INSERT INTO case_voice(id,request_id,org_id,site_id,assignment_id,worker_id,kind,requested_case_id,language,sha256,bytes,duration_seconds,status,lease_token,lease_until,created_at)
      VALUES($1,$2,'test','site','a','worker','reply',$3,'en',$4,32044,1,'storing','voice-claim',clock_timestamp()+interval '3 minutes',clock_timestamp()-interval '40 days')`,[voiceId,voiceRequest,caseId,'b'.repeat(64)]);
    await f.message(caseId,{id:voiceRequest});
    await f.db.query("UPDATE case_voice SET status='received',case_id=requested_case_id,received_at=clock_timestamp()-interval '40 days',lease_token=NULL,lease_until=NULL WHERE id=$1",[voiceId]);
    const attempts=(await f.db.query('SELECT * FROM attempts')).rows;
    await assert.rejects(f.db.query("UPDATE case_messages SET text='[Expired]' WHERE id=$1",[messageId]),/immutable/);
    await saveCaseRetention(f.pool,owner,policy());
    await assert.rejects(f.db.query("INSERT INTO case_content_purges(case_id,org_id,site_id,assignment_id,policy_revision,days) VALUES($1,'test','site','a',1,30)",[f.ids.recent]),/scope or policy/);
    assert.equal(await processOneCaseContentPurge(f.pool),true);assert.equal(await processOneCaseContentPurge(f.pool),false);
    assert.deepEqual((await f.db.query('SELECT reason,notes,status FROM clarifications WHERE id=$1',[caseId])).rows[0],{reason:'[Expired]',notes:'',status:'resolved'});
    assert.equal((await f.db.query('SELECT text FROM help_requests')).rows[0].text,'[Expired]');
    assert.equal((await f.db.query('SELECT reason FROM case_reviews')).rows[0].reason,'[Expired]');
    const followup=(await f.db.query('SELECT source_text,glossary_json,manifest_json,status,delivered_at FROM case_followups')).rows[0];
    assert.equal(followup.source_text,'[Expired]');assert.deepEqual(followup.glossary_json,{});assert.equal(followup.manifest_json,null);assert.equal(followup.status,'failed');assert.ok(followup.delivered_at);
    assert.deepEqual((await f.db.query('SELECT * FROM attempts')).rows,attempts);
    for(const kind of ['open','fresh','recent','foreign'])assert.equal((await f.db.query('SELECT reason FROM clarifications WHERE id=$1',[f.ids[kind]])).rows[0].reason,'Synthetic reason');
    await assert.rejects(f.db.query("UPDATE case_messages SET text='Restored' WHERE id=$1",[messageId]),/immutable/);
    await assert.rejects(f.db.query("UPDATE clarifications SET status='open' WHERE id=$1",[caseId]),/immutable/);
    await assert.rejects(sendCaseMessage(f.pool,owner,caseId,{requestId:randomUUID(),text:'New message'}),/closed/);
    await assert.rejects(f.db.exec("UPDATE case_followups SET status='queued'"),/immutable/);
    assert.equal(await processOneCaseFollowup(f.pool,{provenance:{dataClass:'synthetic'}},{save(){},read(){},remove(){},exists(){}},{dataClass:'synthetic'}),false);
    const objects=new Map([['followup-audio',Buffer.from('synthetic')],[voiceId,Buffer.from('synthetic')]]);
    let fail=true;const storage={read(){assert.fail('Expired audio must be fenced before reading');},async remove(row){if(fail)throw Error('Synthetic storage outage');objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
    await assert.rejects(getCaseFollowupAudio(f.pool,owner,caseId,followupId,storage),/unavailable/);
    await assert.rejects(getCaseVoiceAudio(f.pool,owner,caseId,voiceRequest,storage),/unavailable/);
    assert.equal(await processOneCaseFollowupPurge(f.pool,storage),true);assert.equal(await processOneCaseVoicePurge(f.pool,storage),true);assert.equal(objects.size,2);
    assert.equal((await f.db.query("SELECT state FROM case_followup_audio")).rows[0].state,'cleaning');
    fail=false;await f.db.exec("UPDATE case_followup_audio SET cleanup_until=clock_timestamp()-interval '1 minute';UPDATE case_voice SET cleanup_until=clock_timestamp()-interval '1 minute'");
    assert.equal(await processOneCaseFollowupPurge(f.pool,storage),true);assert.equal(await processOneCaseVoicePurge(f.pool,storage),true);assert.equal(objects.size,0);
    assert.equal((await getCaseRetention(f.pool,owner)).completed.case,1);
    assert.equal((await getClarification(f.pool,owner,caseId)).contentExpired,true);
    assert.equal((await listCaseReviews(f.pool,owner,caseId))[0].reason,'[Expired]');
    await assert.rejects(saveCaseReview(f.pool,owner,caseId,{requestId:randomUUID(),kind:'disagree',reason:'Synthetic new disagreement'}),/Case review unavailable/);
    await saveCaseRetention(f.pool,owner,{requestId:randomUUID(),revision:1,days:null,confirmed:true});
    await assert.rejects(f.db.query("UPDATE clarifications SET notes='Restored' WHERE id=$1",[caseId]),/immutable/);
    await assert.rejects(f.db.exec('DELETE FROM case_content_purges'),/immutable/);
    await requestWorkerDeletion(f.pool,owner,'worker',{requestId:randomUUID(),expectedCode:'Synthetic worker',reason:'worker_request',confirmed:true});
    assert.equal(await processOneDeletionRedaction(f.pool),true);
    assert.equal((await f.db.query('SELECT reason FROM clarifications WHERE id=$1',[caseId])).rows[0].reason,'[Deleted]');
  }finally{await f.close();}
});

test('case-content audit failure rolls back all redaction and purge receipts before a truthful retry',async()=>{
  const f=await fixture();try {
    await f.message(f.ids.old);await saveCaseRetention(f.pool,owner,policy());
    await f.db.exec("CREATE FUNCTION reject_case_retention_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='retention.case_content.purged' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER reject_case_retention_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION reject_case_retention_audit()");
    await assert.rejects(processOneCaseContentPurge(f.pool),/Synthetic audit failure/);
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM case_content_purges')).rows[0].n,0);
    assert.equal((await f.db.query('SELECT reason FROM clarifications WHERE id=$1',[f.ids.old])).rows[0].reason,'Synthetic reason');
    await f.db.exec('DROP TRIGGER reject_case_retention_audit ON audit');
    assert.equal(await processOneCaseContentPurge(f.pool),true);
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM audit WHERE action='retention.case_content.purged'")).rows[0].n,1);
  }finally{await f.close();}
});
