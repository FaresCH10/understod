import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {requestWorkerDeletion,getWorkerDeletion} from '../server/deletions.mjs';
import {requestWorkerDeletion as pgDelete,getWorkerDeletion as pgGet} from '../server/postgres/deletions.mjs';
import {ensureDeletionRedactionSchema,processOneDeletionRedaction} from '../server/deletion-redactions.mjs';
import {processOneDeletionRedaction as pgRedact} from '../server/postgres/deletion-redactions.mjs';
import {processOneDeletionPseudonym} from '../server/deletion-pseudonyms.mjs';
import {processOneDeletionPseudonym as pgPseudonym} from '../server/postgres/deletion-pseudonyms.mjs';
import {processOneDeletionCompletion} from '../server/deletion-completions.mjs';
import {processOneDeletionCompletion as pgComplete} from '../server/postgres/deletion-completions.mjs';
import {deletionSnapshotsClear} from '../server/deletion-verification.mjs';
import {applicationCleanupEvidence} from '../server/deletion-scope.mjs';
import {processOneAudioPurge} from '../server/retention.mjs';
import {processOneAudioPurge as pgPurge} from '../server/postgres/retention.mjs';
import * as localExports from '../server/exports.mjs';
import * as pgExports from '../server/postgres/exports.mjs';
import * as localImports from '../server/worker-import.mjs';
import * as pgImports from '../server/postgres/worker-import.mjs';
import {createWorker} from '../server/people.mjs';
import {createWorker as pgCreate} from '../server/postgres/people.mjs';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
test('deletion snapshot verification refuses retained labels and unavailable evidence',()=>{
  const hash=createHash('sha256').update('Worker 030').digest('hex');
  assert.equal(deletionSnapshotsClear([{filename:'Worker 030.csv',filename_hash:null,rows_json:null}],[],hash),false);
  assert.equal(deletionSnapshotsClear([{filename:'crew.csv',rows_json:JSON.stringify([{workerId:'Worker 030'}])}],[],hash),false);
  assert.equal(deletionSnapshotsClear([],[{snapshot_json:JSON.stringify([['Worker 030','en']])}],hash),false);
  assert.equal(deletionSnapshotsClear([{filename:'[Deleted].csv',filename_hash:hash,rows_json:null}],[{snapshot_json:JSON.stringify([['Deleted opaque','en']])}],hash),true);
  for(const snapshot_json of ['not JSON','{}','[{}]','[[null]]'])assert.throws(()=>deletionSnapshotsClear([],[{snapshot_json}],hash));
});
test('reserved label digest matching preserves Unicode code points and the worker label length bound',()=>{
  const labels=['\u0634\u0631\u0643\u0629','\u{10400}a','Worker-030','A'.repeat(80)];
  for(const label of labels){
    const hashes=localImports.importLabelHashes([],`archive ${label}.csv`);
    assert.ok(hashes.includes(createHash('sha256').update(label).digest('hex')));
  }
  const tooLong='A'.repeat(81);
  assert.ok(!localImports.importLabelHashes([],`${tooLong}.csv`).includes(createHash('sha256').update(tooLong).digest('hex')));
});
for(const backend of ['SQLite','PostgreSQL'])test(`${backend} worker pseudonymization waits for cleanup, rolls back audit and preserves usable opaque-label reports`,async()=>{
  const pg=backend==='PostgreSQL',db=pg?new PGlite():openDatabase(':memory:');
  const client={async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};
  const connection=pg?{async connect(){return client;}}:db,exports=pg?pgExports:localExports,imports=pg?pgImports:localImports;
  const redact=pg?pgRedact:processOneDeletionRedaction,pseudonym=pg?pgPseudonym:processOneDeletionPseudonym;
  const complete=pg?pgComplete:processOneDeletionCompletion;
  const get=pg?pgGet:getWorkerDeletion;
  const query=async(sql,values=[])=>pg?(await db.query(sql,values)).rows:db.prepare(sql.replace(/\$\d+/g,'?')).all(...values);
  const publicationId=pg?'pub':'shelf-v3',assignmentId=pg?'assignment':'assignment-30';
  try{
    if(pg){
      await runMigrations(connection);
      await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
        INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner');
        INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');
        INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('briefing','cedar','beirut','Synthetic','Synthetic','ready');
        INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('pub','cedar','beirut','briefing',1,'{}','published');
        INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','cedar','beirut','pub','worker-30','en');`);
    }else{seed(db);ensureDeletionRedactionSchema(db);}
    await query("INSERT INTO crews(id,org_id,site_id,name) VALUES('crew','cedar','beirut','Synthetic crew')");
    await query("INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id,joined_at) VALUES('worker-30','cedar','beirut','crew',$1)",[new Date().toISOString()]);
    const recordedAt=new Date().toISOString();
    await query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,created_at,received_at)
      VALUES('audio','cedar','beirut',$1,'audio-submission',$2,1,100,'received',$3,$4)`,[assignmentId,'0'.repeat(64),recordedAt,recordedAt]);
    const before=(await query("SELECT * FROM workers WHERE id='worker-30'"))[0];
    const upload={requestId:randomUUID(),filename:'Worker 030.csv',bytes:Buffer.from('worker_id,language\nWorker 030,en\n')};
    await imports.previewWorkerImport(connection,owner,upload);
    const oldExport=await exports.requestExport(connection,owner,{requestId:randomUUID(),publicationId});
    const change={requestId:randomUUID(),expectedCode:'Worker 030',reason:'worker_request',confirmed:true};
    assert.equal(await get(connection,owner,'worker-30'),null);
    await assert.rejects(async()=>get(connection,{...owner,role:'supervisor'},'worker-30'),/Forbidden/);
    await assert.rejects(async()=>get(connection,{...owner,token_hash:'f'.repeat(64)},'worker-30'),/Sign in required/);
    await (pg?pgDelete:requestWorkerDeletion)(connection,owner,'worker-30',change);
    assert.equal((await get(connection,owner,'worker-30')).status,'queued');
    await assert.rejects(async()=>query("UPDATE workers SET code='Changed label' WHERE id='worker-30'"),/pending/);
    await assert.rejects(async()=>exports.requestExport(connection,owner,{requestId:randomUUID(),publicationId}),/pending/);
    assert.equal(await pseudonym(connection),false);
    await exports.expireExports(connection);await imports.expireWorkerImports(connection);
    assert.equal(await redact(connection),false);
    let removed=0;await (pg?pgPurge:processOneAudioPurge)(connection,{async remove(){removed++;},async exists(){return false;}});
    assert.equal(removed,1);assert.equal(await redact(connection),true);
    if(pg)await db.exec(`CREATE FUNCTION fail_pseudonym_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='worker.identity.pseudonymized' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;RETURN NEW;END;$$;
      CREATE TRIGGER fail_pseudonym_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_pseudonym_audit();`);
    else db.exec("CREATE TRIGGER fail_pseudonym_audit BEFORE INSERT ON audit WHEN NEW.action='worker.identity.pseudonymized' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    await assert.rejects(async()=>pseudonym(connection),/Injected/);
    assert.equal((await query("SELECT code FROM workers WHERE id='worker-30'"))[0].code,before.code);
    assert.equal(Number((await query('SELECT count(*) AS count FROM worker_deletion_pseudonyms'))[0].count),0);
    assert.equal(Number((await query("SELECT count(*) AS count FROM crew_memberships WHERE worker_id='worker-30'"))[0].count),1);
    await db.exec(pg?'DROP TRIGGER fail_pseudonym_audit ON audit':'DROP TRIGGER fail_pseudonym_audit');
    assert.equal(await pseudonym(connection),true);assert.equal(await pseudonym(connection),false);
    const after=(await query("SELECT * FROM workers WHERE id='worker-30'"))[0],receipt=(await query('SELECT * FROM worker_deletion_pseudonyms'))[0];
    assert.match(after.code,/^Deleted [0-9a-f-]{36}$/);assert.equal(after.code,receipt.pseudonym);
    assert.equal(receipt.code_hash,createHash('sha256').update(before.code).digest('hex'));
    for(const key of ['id','org_id','site_id','language'])assert.equal(after[key],before[key]);
    assert.equal(Number((await query("SELECT count(*) AS count FROM crew_memberships WHERE worker_id='worker-30'"))[0].count),0);
    assert.equal(Number((await query("SELECT count(*) AS count FROM audit WHERE action='worker.identity.pseudonymized'"))[0].count),1);
    await assert.rejects(async()=>query('DELETE FROM worker_deletion_pseudonyms'),/immutable/);
    await assert.rejects(async()=>query("UPDATE workers SET code='Worker 030' WHERE id='worker-30'"),/pending|unavailable/);
    await assert.rejects(async()=>(pg?pgCreate:createWorker)(connection,owner,{code:'Worker 030',language:'en'}),/unavailable/);
    await query("INSERT INTO organizations VALUES('separate-org','Synthetic scope')");
    await query("INSERT INTO sites VALUES('separate-site','separate-org','Synthetic scope','UTC')");
    await query("INSERT INTO workers(id,org_id,site_id,code,language) VALUES('separate-worker','separate-org','separate-site','Worker 030','en')");
    assert.equal((await query("SELECT code FROM workers WHERE id='separate-worker'"))[0].code,'Worker 030');
    await assert.rejects(async()=>get(connection,owner,'separate-worker'),/Worker unavailable/);
    await assert.rejects(async()=>imports.previewWorkerImport(connection,owner,{...upload,requestId:randomUUID()}),/unavailable/);
    await assert.rejects(async()=>imports.previewWorkerImport(connection,owner,{requestId:randomUUID(),filename:'archive Worker 030.csv',bytes:Buffer.from('worker_id,language\nNew Unrelated,en\n')}),/unavailable/);
    assert.equal((await imports.previewWorkerImport(connection,owner,upload)).duplicate,true);
    assert.equal((await (pg?pgDelete:requestWorkerDeletion)(connection,owner,'worker-30',change)).duplicate,true);
    await assert.rejects(async()=>exports.downloadExport(connection,owner,oldExport.id),/expired/);
    const fresh=await exports.requestExport(connection,owner,{requestId:randomUUID(),publicationId});
    assert.equal(await exports.processOneExport(connection),true);
    const csv=(await exports.downloadExport(connection,owner,fresh.id)).csv;
    assert.match(csv,/Deleted /);assert.doesNotMatch(csv,/Worker 030/);
    assert.equal(await complete(connection,{}),false);
    assert.equal(await complete(connection,{async exists(){return true;}}),false);
    assert.equal(await complete(connection,{async exists(){return undefined;}}),false);
    await assert.rejects(()=>complete(connection,{async exists(){throw new Error('Storage check unavailable');}}),/unavailable/);
    let checked=0;
    assert.equal(await complete(connection,{async exists(){
      checked++;
      await query(`INSERT INTO worker_grants(id,org_id,site_id,worker_id,token_hash,expires_at,created_at)
        VALUES('late-grant','cedar','beirut','worker-30',$1,$2,$3)`,['1'.repeat(64),new Date(Date.now()+60_000).toISOString(),new Date().toISOString()]);
      return false;
    }}),false);
    assert.equal(checked,1);
    await query("UPDATE worker_grants SET revoked_at=$1 WHERE id='late-grant'",[new Date().toISOString()]);
    if(pg)await db.exec(`CREATE FUNCTION fail_completion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='worker.deletion.completed' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;RETURN NEW;END;$$;
      CREATE TRIGGER fail_completion_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_completion_audit();`);
    else db.exec("CREATE TRIGGER fail_completion_audit BEFORE INSERT ON audit WHEN NEW.action='worker.deletion.completed' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    const absent={async exists(){return false;}};
    await assert.rejects(()=>complete(connection,absent),/Injected/);
    assert.equal(Number((await query('SELECT count(*) AS count FROM worker_deletion_completions'))[0].count),0);
    assert.equal((await (pg?pgDelete:requestWorkerDeletion)(connection,owner,'worker-30',change)).status,'queued');
    await db.exec(pg?'DROP TRIGGER fail_completion_audit ON audit':'DROP TRIGGER fail_completion_audit');
    assert.equal(await complete(connection,absent),true);
    assert.equal(await complete(connection,absent),false);
    assert.equal((await (pg?pgDelete:requestWorkerDeletion)(connection,owner,'worker-30',change)).status,'complete');
    const status=await get(connection,owner,'worker-30');
    assert.equal(status.status,'complete');assert.ok(status.completedAt);assert.ok(status.contentRedactedAt);assert.ok(status.identityPseudonymizedAt);
    assert.deepEqual(status.cleanupEvidence,applicationCleanupEvidence());
    const completionBefore=await query('SELECT * FROM worker_deletion_completions');
    assert.deepEqual(await get(connection,owner,'worker-30'),status);
    assert.deepEqual(await query('SELECT * FROM worker_deletion_completions'),completionBefore);
    assert.doesNotMatch(JSON.stringify(status),/Worker 030|code_hash|fingerprint|token/);
    assert.equal(Number((await query("SELECT count(*) AS count FROM audit WHERE action='worker.deletion.completed'"))[0].count),1);
    await assert.rejects(async()=>query('DELETE FROM worker_deletion_completions'),/immutable/);
    await assert.rejects(async()=>query("UPDATE worker_deletion_completions SET site_id='separate-site'"),/immutable/);
  }finally{await db.close();}
});
