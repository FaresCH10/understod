import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {submitAnswer} from '../server/domain.mjs';
import {requestWorkerDeletion} from '../server/deletions.mjs';
import {requestWorkerDeletion as pgRequest} from '../server/postgres/deletions.mjs';
import {ensureDeletionRedactionSchema,processOneDeletionRedaction} from '../server/deletion-redactions.mjs';
import {processOneDeletionRedaction as pgRedact} from '../server/postgres/deletion-redactions.mjs';
import {requestExport,expireExports} from '../server/exports.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const worker={principal_type:'worker',principal_id:'worker-30',org_id:'cedar',site_id:'beirut'};
const request=()=>({requestId:randomUUID(),expectedCode:'Worker 030',reason:'worker_request',confirmed:true});

test('SQLite deletion removes legacy reactivation labels atomically without rewriting receipt metadata',()=>{
  const db=openDatabase(':memory:');seed(db);ensureDeletionRedactionSchema(db);
  try{
    const id=randomUUID(),now=new Date().toISOString();
    db.prepare('INSERT INTO directory_reactivations VALUES(?,?,?,?,?,?,?,?)').run(id,'cedar','beirut','worker-30',null,'Worker 030','maya',now);
    db.exec("INSERT INTO crews VALUES('crew-fixture','cedar','beirut','Synthetic crew',1)");
    db.prepare('INSERT INTO directory_reactivations VALUES(?,?,?,?,?,?,?,?)').run('crew-receipt','cedar','beirut',null,'crew-fixture','Synthetic crew','maya',now);
    db.prepare('INSERT INTO directory_reactivations VALUES(?,?,?,?,?,?,?,?)').run('other-receipt','cedar','beirut','worker-29',null,'Worker 029','maya',now);
    const before=db.prepare('SELECT * FROM directory_reactivations WHERE request_id=?').get(id);
    assert.throws(()=>db.prepare("UPDATE directory_reactivations SET expected_label='[Deleted]' WHERE request_id=?").run(id),/immutable/);
    requestWorkerDeletion(db,owner,'worker-30',request());
    assert.throws(()=>db.prepare('INSERT INTO directory_reactivations VALUES(?,?,?,?,?,?,?,?)')
      .run(randomUUID(),'cedar','beirut','worker-30',null,'Worker 030','maya',now),/pending/);
    db.exec("CREATE TRIGGER fail_label_audit BEFORE INSERT ON audit WHEN NEW.action='worker.reactivation_labels.redacted' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    assert.throws(()=>processOneDeletionRedaction(db),/Injected/);
    assert.deepEqual(db.prepare('SELECT * FROM directory_reactivations WHERE request_id=?').get(id),before);
    db.exec('DROP TRIGGER fail_label_audit');
    assert.equal(processOneDeletionRedaction(db),true);
    assert.deepEqual({...db.prepare('SELECT * FROM directory_reactivations WHERE request_id=?').get(id)},{...before,expected_label:'[Deleted]'});
    for(const other of ['crew-receipt','other-receipt'])assert.throws(()=>db.prepare("UPDATE directory_reactivations SET expected_label='[Deleted]' WHERE request_id=?").run(other),/immutable/);
    assert.throws(()=>db.prepare("UPDATE directory_reactivations SET expected_label='Worker 030' WHERE request_id=?").run(id),/immutable/);
    assert.throws(()=>db.prepare("UPDATE directory_reactivations SET occurred_at='changed' WHERE request_id=?").run(id),/immutable/);
    assert.throws(()=>db.prepare('DELETE FROM directory_reactivations WHERE request_id=?').run(id),/immutable/);
    processOneDeletionRedaction(db);assert.equal(processOneDeletionRedaction(db),false);
    assert.equal(db.prepare("SELECT count(*) AS count FROM audit WHERE action='worker.reactivation_labels.redacted'").get().count,1);
  }finally{db.close();}
});

test('SQLite redaction waits for snapshots, rolls back on audit failure and preserves immutable receipt metadata',()=>{
  const db=openDatabase(':memory:');seed(db);ensureDeletionRedactionSchema(db);
  try{
    submitAnswer(db,worker,'assignment-30',randomUUID(),'Finished on blue; unfinished on yellow.');
    const before=db.prepare("SELECT * FROM attempts WHERE assignment_id='assignment-30'").get();
    const caseId=randomUUID(),now=new Date().toISOString();
    db.prepare('INSERT INTO clarifications VALUES(?,?,?,?,?,?,?,?,?)').run(caseId,'cedar','assignment-30',null,'Private reason',null,'resolved','Private supervisor note',now);
    db.prepare('INSERT INTO help_requests VALUES(?,?,?,?,?,?)').run(caseId,'cedar','beirut','assignment-30','Private original help',now);
    assert.throws(()=>db.prepare("UPDATE help_requests SET text='[Deleted]' WHERE case_id=?").run(caseId),/immutable/);
    requestExport(db,owner,{requestId:randomUUID(),publicationId:'shelf-v3'});
    requestWorkerDeletion(db,owner,'worker-30',request());
    assert.equal(processOneDeletionRedaction(db),false);
    expireExports(db);
    db.exec("CREATE TRIGGER fail_redaction_audit BEFORE INSERT ON audit WHEN NEW.action='worker.content.redacted' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    assert.throws(()=>processOneDeletionRedaction(db),/Injected/);
    assert.deepEqual(db.prepare('SELECT * FROM attempts WHERE id=?').get(before.id),before);
    assert.equal(db.prepare('SELECT count(*) AS count FROM worker_deletion_redactions').get().count,0);
    db.exec('DROP TRIGGER fail_redaction_audit');
    assert.equal(processOneDeletionRedaction(db),true);
    const after=db.prepare('SELECT * FROM attempts WHERE id=?').get(before.id);
    assert.equal(after.answer_text,'[Deleted]');assert.deepEqual(JSON.parse(after.reasons_json),{reasons:[],evidence:[]});
    for(const key of ['id','org_id','assignment_id','submission_id','received_at','outcome'])assert.equal(after[key],before[key]);
    const help=db.prepare('SELECT * FROM help_requests WHERE case_id=?').get(caseId),clarification=db.prepare('SELECT * FROM clarifications WHERE id=?').get(caseId);
    assert.equal(help.text,'[Deleted]');assert.equal(help.created_at,now);
    assert.equal(clarification.reason,'[Deleted]');assert.equal(clarification.notes,'');assert.equal(clarification.status,'resolved');
    assert.throws(()=>db.prepare("UPDATE attempts SET answer_text='Restored private text' WHERE id=?").run(before.id),/immutable/);
    assert.throws(()=>db.prepare("UPDATE help_requests SET text='Restored private text' WHERE case_id=?").run(caseId),/immutable/);
    assert.throws(()=>db.prepare("UPDATE clarifications SET notes='Restored private note' WHERE id=?").run(caseId),/immutable/);
    assert.throws(()=>db.exec('DELETE FROM worker_deletion_redactions'),/immutable/);
    assert.equal(processOneDeletionRedaction(db),false);
    assert.equal(db.prepare("SELECT count(*) AS count FROM audit WHERE action='worker.content.redacted'").get().count,1);
  }finally{db.close();}
});

test('PostgreSQL redaction permits only scoped content removal and cannot revise historical outcomes',async()=>{
  const db=new PGlite(),client={async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};
  const pool={async connect(){return client;}};
  try{
    await runMigrations(pool);
    await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('briefing','cedar','beirut','Synthetic','Synthetic','ready');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','cedar','beirut','briefing',1,'{}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','cedar','beirut','pub','worker-30','en');
      INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,evidence_json)
        VALUES('attempt','cedar','beirut','assignment','submission','Private answer','matched','["Private reason"]','[{"quote":"Private answer"}]');
      INSERT INTO clarifications(id,org_id,site_id,assignment_id,attempt_id,reason,status,notes)
        VALUES('case','cedar','beirut','assignment','attempt','Private reason','resolved','Private supervisor note');
      INSERT INTO help_requests(case_id,org_id,site_id,assignment_id,text) VALUES('case','cedar','beirut','assignment','Private original help');`);
    const before=(await db.query("SELECT * FROM attempts WHERE id='attempt'")).rows[0];
    await assert.rejects(db.exec("UPDATE attempts SET answer_text='[Deleted]',reasons_json='[]',evidence_json='[]' WHERE id='attempt'"),/immutable/);
    await pgRequest(pool,owner,'worker-30',request());
    await assert.rejects(db.exec(`INSERT INTO directory_reactivations(request_id,org_id,site_id,worker_id,expected_label,requested_by)
      VALUES('resurrected','cedar','beirut','worker-30','Worker 030','maya')`),/pending/);
    await db.exec(`CREATE FUNCTION fail_redaction_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='worker.content.redacted' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;RETURN NEW;END;$$;
      CREATE TRIGGER fail_redaction_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_redaction_audit();`);
    await assert.rejects(pgRedact(pool),/Injected/);
    assert.deepEqual((await db.query("SELECT * FROM attempts WHERE id='attempt'")).rows[0],before);
    await db.exec('DROP TRIGGER fail_redaction_audit ON audit');
    assert.equal(await pgRedact(pool),true);
    const after=(await db.query("SELECT * FROM attempts WHERE id='attempt'")).rows[0];
    assert.equal(after.answer_text,'[Deleted]');assert.deepEqual(after.reasons_json,[]);assert.deepEqual(after.evidence_json,[]);
    for(const key of ['id','org_id','site_id','assignment_id','submission_id','outcome','assessment_status'])assert.equal(after[key],before[key]);
    assert.equal(after.received_at.getTime(),before.received_at.getTime());
    assert.equal((await db.query("SELECT text FROM help_requests WHERE case_id='case'")).rows[0].text,'[Deleted]');
    const c=(await db.query("SELECT * FROM clarifications WHERE id='case'")).rows[0];assert.equal(c.reason,'[Deleted]');assert.equal(c.notes,'');assert.equal(c.status,'resolved');
    await assert.rejects(db.exec("UPDATE attempts SET outcome='clarification' WHERE id='attempt'"),/immutable/);
    await assert.rejects(db.exec("UPDATE attempts SET answer_text='Private restored text' WHERE id='attempt'"),/immutable/);
    await assert.rejects(db.exec("UPDATE help_requests SET text='Private restored text' WHERE case_id='case'"),/immutable/);
    await assert.rejects(db.exec("UPDATE clarifications SET notes='Private restored note' WHERE id='case'"),/immutable/);
    await assert.rejects(db.exec('DELETE FROM worker_deletion_redactions'),/immutable/);
    assert.equal(await pgRedact(pool),false);
  }finally{await db.close();}
});

test('PostgreSQL deletion sanitizes reactivation labels with atomic audit and immutable identity',async()=>{
  const db=new PGlite(),client={async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};
  const pool={async connect(){return client;}};
  try{
    await runMigrations(pool);
    await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');
      INSERT INTO directory_reactivations(request_id,org_id,site_id,worker_id,expected_label,requested_by)
        VALUES('legacy','cedar','beirut','worker-30','Worker 030','maya');`);
    const before=(await db.query("SELECT * FROM directory_reactivations WHERE request_id='legacy'")).rows[0];
    await assert.rejects(db.exec("UPDATE directory_reactivations SET expected_label='[Deleted]'"),/immutable/);
    await pgRequest(pool,owner,'worker-30',request());
    await db.exec(`CREATE FUNCTION fail_label_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='worker.reactivation_labels.redacted' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;RETURN NEW;END;$$;
      CREATE TRIGGER fail_label_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_label_audit();`);
    await assert.rejects(pgRedact(pool),/Injected/);
    assert.deepEqual((await db.query("SELECT * FROM directory_reactivations WHERE request_id='legacy'")).rows[0],before);
    await db.exec('DROP TRIGGER fail_label_audit ON audit');
    assert.equal(await pgRedact(pool),true);
    assert.deepEqual((await db.query("SELECT * FROM directory_reactivations WHERE request_id='legacy'")).rows[0],{...before,expected_label:'[Deleted]'});
    await assert.rejects(db.exec("UPDATE directory_reactivations SET expected_label='Worker 030'"),/immutable/);
    await assert.rejects(db.exec("UPDATE directory_reactivations SET requested_by='someone'"),/immutable/);
    await assert.rejects(db.exec('DELETE FROM directory_reactivations'),/immutable/);
    await pgRedact(pool);assert.equal(await pgRedact(pool),false);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM audit WHERE action='worker.reactivation_labels.redacted'")).rows[0].count,1);
  }finally{await db.close();}
});
