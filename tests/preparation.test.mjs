import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../server/db.mjs';
import { seed } from '../server/seed.mjs';
import { createDraft, editDraft, queuePreparation } from '../server/preparation.mjs';
import { publish, submitAnswer } from '../server/domain.mjs';
import { publicationInput } from '../server/briefing-input.mjs';

const maya = { principal_type: 'staff', principal_id: 'maya', org_id: 'cedar', site_id: 'beirut', role: 'owner' };
const worker = { principal_type: 'worker', principal_id: 'worker-30', org_id: 'cedar', site_id: 'beirut' };
const content = { title: 'Shelf colour handover', source: 'Place completed products on the blue shelf and incomplete products on the yellow shelf.' };
function fixture() { const db = openDatabase(':memory:'); seed(db); return db; }
function ready(db) {
  db.prepare("UPDATE briefings SET state='ready',prepared_json=(SELECT snapshot_json FROM publications WHERE id='shelf-v3') WHERE id='shelf'").run();
}

test('publication binds the confirmed version even when revision and prepared content are unchanged',()=>{
  const db=fixture();
  try {
    ready(db);
    const input={requestId:randomUUID(),revision:1,nextVersion:4,workerIds:['worker-30']};
    for(const nextVersion of [0,-1,1.5,'4',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>publicationInput({...input,nextVersion}),/Invalid publication request/);
    const {nextVersion:omitted,...legacy}=input;
    assert.ok(!Object.hasOwn(publicationInput(legacy),'nextVersion'));
    assert.throws(()=>publish(db,maya,'shelf',legacy),/Invalid publication version/);
    for(const nextVersion of [3,5])assert.throws(()=>publish(db,maya,'shelf',{...input,nextVersion}),/Draft version changed/);
    assert.equal(db.prepare('SELECT count(*) n FROM publication_requests').get().n,0);
    const first=publish(db,maya,'shelf',input);assert.equal(first.version,4);
    ready(db);
    assert.throws(()=>publish(db,maya,'shelf',{...input,requestId:randomUUID()}),/Draft version changed/);
    assert.throws(()=>publish(db,maya,'shelf',{...legacy,requestId:randomUUID()}),/Invalid publication version/);
    assert.equal(publish(db,maya,'shelf',input).duplicate,true);
    assert.throws(()=>publish(db,maya,'shelf',legacy),/Publication request conflict/);
    assert.throws(()=>publish(db,maya,'shelf',{...input,nextVersion:5}),/Publication request conflict/);
    assert.equal(db.prepare('SELECT count(*) n FROM assignments').get().n,31);
    const legacyId=randomUUID(),oldInput={requestId:legacyId,revision:1,workerIds:['worker-1']};
    db.prepare('INSERT INTO publication_requests VALUES(?,?,?,?,?,?)').run(legacyId,'cedar','beirut','shelf','shelf-v3',JSON.stringify(publicationInput(oldInput)));
    assert.deepEqual(publish(db,maya,'shelf',oldInput),{id:'shelf-v3',version:3,assigned:30,duplicate:true});
    assert.throws(()=>publish(db,maya,'shelf',{...oldInput,nextVersion:3}),/Publication request conflict/);
    assert.throws(()=>publish(db,{...maya,role:'auditor'},'shelf',oldInput),/Forbidden/);
    assert.throws(()=>publish(db,{...maya,org_id:'harbor'},'shelf',oldInput),/Forbidden/);
    assert.equal(publish(db,maya,'shelf',{...input,requestId:randomUUID(),nextVersion:5}).version,5);
    assert.equal(db.prepare('SELECT count(*) n FROM assignments').get().n,32);
    assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='briefing.published'").get().n,2);
  }finally{db.close();}
});

test('publication deadlines require an explicit zone and a real civil date', () => {
  const input={requestId:randomUUID(),revision:1,workerIds:['worker-30']};
  for (const dueAt of ['2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2026-10-04T12:00:00','2026-10-04T24:00:00Z','2026-10-04T12:60:00Z','2026-10-04T12:00:60Z']) {
    assert.throws(() => publicationInput({...input,dueAt}), /Invalid deadline/);
  }
  assert.equal(publicationInput({...input,dueAt:'2028-02-29T12:00:00+02:00'}).dueAt,'2028-02-29T10:00:00.000Z');
  assert.equal(publicationInput({...input,dueAt:'2026-10-04T12:00:00.123Z'}).dueAt,'2026-10-04T12:00:00.123Z');
});

test('draft creation replays exactly and revision edits invalidate queued preparation without touching publication', () => {
  const db = fixture();
  try {
    const input = { ...content, requestId: randomUUID() };
    const first = createDraft(db, maya, input);
    assert.equal(createDraft(db, maya, input).duplicate, true);
    assert.throws(() => createDraft(db, maya, { ...input, title: 'Different title' }), /conflict/);
    assert.throws(() => createDraft(db, maya, { ...input, state: 'ready' }), /Invalid/);
    const original = db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json;
    const job = queuePreparation(db, maya, first.id, 1);
    assert.equal(queuePreparation(db, maya, first.id, 1).duplicate, true);
    assert.equal(editDraft(db, maya, first.id, { ...content, revision: 1 }).unchanged, true);
    const changed = editDraft(db, maya, first.id, { ...content, title: 'Updated shelf handover', revision: 1 });
    assert.equal(changed.revision, 2);
    assert.throws(() => editDraft(db, maya, first.id, { ...content, revision: 1 }), /revision changed/);
    assert.throws(() => queuePreparation(db, maya, first.id, 1), /revision changed/);
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id).status, 'failed');
    assert.equal(db.prepare('SELECT prepared_json FROM briefings WHERE id=?').get(first.id).prepared_json, null);
    assert.equal(db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json, original);
    assert.throws(() => editDraft(db, { ...maya, role: 'auditor' }, first.id, { ...content, revision: 2 }), /Forbidden/);
    assert.throws(() => queuePreparation(db, { ...maya, site_id: 'harbor-yard' }, first.id, 2), /Forbidden/);
  } finally { db.close(); }
});

test('publication uses only selected active recipients and exact replay survives later edits and expiry', () => {
  const db = fixture();
  try {
    ready(db);
    const input = { requestId: randomUUID(), revision: 1, nextVersion: 4, workerIds: ['worker-30', 'worker-1'], dueAt: new Date(Date.now() + 60000).toISOString() };
    const first = publish(db, maya, 'shelf', input);
    assert.equal(first.assigned, 2);
    assert.deepEqual(db.prepare('SELECT worker_id,due_at FROM assignments WHERE publication_id=? ORDER BY worker_id').all(first.id).map((row) => ({ ...row })),
      [{ worker_id: 'worker-1', due_at: input.dueAt }, { worker_id: 'worker-30', due_at: input.dueAt }]);
    editDraft(db, maya, 'shelf', { ...content, title: 'Next draft title', revision: 1 });
    db.prepare("UPDATE publications SET state='withdrawn' WHERE id=?").run(first.id);
    assert.equal(publish(db, maya, 'shelf', { ...input, workerIds: [...input.workerIds].reverse() }).duplicate, true);
    assert.throws(() => publish(db, maya, 'shelf', { ...input, workerIds: ['worker-30'] }), /request conflict/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM publications WHERE briefing_id='shelf'").get().n, 2);
    assert.throws(() => db.prepare("UPDATE publications SET snapshot_json='{}' WHERE id=?").run(first.id), /immutable/);
    assert.throws(() => db.prepare('DELETE FROM publication_requests WHERE publication_id=?').run(first.id), /immutable/);
  } finally { db.close(); }
});

test('publication validation and audit failure leave prior publication and assignments unchanged', () => {
  const db = fixture();
  try {
    ready(db);
    const input = { requestId: randomUUID(), revision: 1, nextVersion: 4, workerIds: ['worker-30'] };
    for (const patch of [{ workerIds: [] }, { workerIds: ['worker-30', 'worker-30'] }, { org_id: 'harbor' }, { dueAt: 'invalid' }]) {
      assert.throws(() => publish(db, maya, 'shelf', { ...input, ...patch }), /Invalid/);
    }
    assert.throws(() => publish(db, maya, 'shelf', { ...input, revision: 2 }), /revision changed/);
    assert.throws(() => publish(db, maya, 'shelf', { ...input, dueAt: '2000-01-01T00:00:00Z' }), /future/);
    assert.throws(() => publish(db, maya, 'shelf', { ...input, workerIds: ['harbor-worker'] }), /Recipient unavailable/);
    db.prepare("UPDATE workers SET active=0 WHERE id='worker-30'").run();
    assert.throws(() => publish(db, maya, 'shelf', input), /Recipient unavailable/);
    db.prepare("UPDATE workers SET active=1 WHERE id='worker-30'").run();
    const snapshot = JSON.parse(db.prepare("SELECT prepared_json FROM briefings WHERE id='shelf'").get().prepared_json);
    delete snapshot.languages.ur;
    db.prepare("UPDATE briefings SET prepared_json=? WHERE id='shelf'").run(JSON.stringify(snapshot));
    assert.throws(() => publish(db, maya, 'shelf', input), /language is unavailable/);
    ready(db);
    db.exec("CREATE TRIGGER reject_publication_audit BEFORE INSERT ON audit WHEN NEW.action='briefing.published' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END");
    assert.throws(() => publish(db, maya, 'shelf', input), /Injected audit failure/);
    assert.equal(db.prepare("SELECT state FROM publications WHERE id='shelf-v3'").get().state, 'published');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n, 30);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM publication_requests').get().n, 0);
    assert.equal(db.prepare("SELECT next_version,state FROM briefings WHERE id='shelf'").get().next_version, 4);
  } finally { db.close(); }
});

test('expired assignments reject new typed answers but retain exact accepted retries', () => {
  const db = fixture();
  try {
    const answer = 'Finished blue; unfinished yellow.';
    const first = submitAnswer(db, worker, 'assignment-30', 'deadline-accepted', answer);
    db.prepare("UPDATE assignments SET due_at='2000-01-01T00:00:00Z' WHERE id='assignment-30'").run();
    assert.equal(submitAnswer(db, worker, 'assignment-30', 'deadline-accepted', answer).id, first.id);
    assert.throws(() => submitAnswer(db, worker, 'assignment-30', 'deadline-new-answer', answer), /deadline passed/);
  } finally { db.close(); }
});
