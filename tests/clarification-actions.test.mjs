import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureRecordingSchema} from '../server/recordings.mjs';
import * as local from '../server/clarifications.mjs';
import * as postgres from '../server/postgres/clarifications.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {clarificationActionCommand} from '../server/clarification-action-input.mjs';
import {clarificationPageView,clarificationDetailView,clarificationHttpError} from '../server/clarification-view.mjs';
import {checkedClarificationPage,checkedClarificationDetail} from '../src/clarification-contract.ts';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const worker={principal_type:'worker',principal_id:'worker-30',org_id:'cedar',site_id:'beirut'};
async function fixture(pg){
  let db,pool;
  if(pg){
    db=new PGlite();pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release(){}};}};
    await runMigrations(pool);
    await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic'),('foreign','Foreign');
      INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC'),('foreign','foreign','Foreign','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner'),('other','cedar','beirut','Other','supervisor'),('audit','cedar','beirut','Audit','auditor'),('foreign','foreign','foreign','Foreign','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','en');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('shelf','cedar','beirut','Synthetic','Synthetic','draft');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('shelf-v3','cedar','beirut','shelf',3,'{"languages":{"en":{"title":"Synthetic"}}}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment-30','cedar','beirut','shelf-v3','worker-30','en');`);
  }else{
    db=openDatabase(':memory:');seed(db);ensureRecordingSchema(db);local.ensureClarificationSchema(db);
    db.exec("INSERT INTO staff VALUES('other','cedar','beirut','Other','supervisor',1),('audit','cedar','beirut','Audit','auditor',1),('foreign','harbor','harbor-yard','Foreign','owner',1)");
  }
  const call=(name,...args)=>pg?postgres[name](pool,...args):local[name](db,...args);
  const q=async(sql,args=[])=>pg?db.query(sql,args):{rows:db.prepare(sql).all(...args)};
  const id=randomUUID();await call('requestHelp',worker,'assignment-30',{requestId:id,text:'Synthetic original help request'});
  const assign=body=>call('assignClarification',owner,id,body),resolve=body=>call('resolveClarification',owner,id,body);
  const receipt=(requestId,principal=owner)=>call('clarificationActionReceipt',principal,id,requestId);
  return {db,pool,id,call,q,assign,resolve,receipt,pg,close:()=>db.close()};
}

test('clarification action commands hash exact normalized intent without accepting forged fields',()=>{
  const requestId=randomUUID(),notes='  Synthetic private resolution  ';
  assert.deepEqual(clarificationActionCommand('resolve',{requestId,notes}),clarificationActionCommand('resolve',{requestId,notes:notes.trim()}));
  assert.equal(clarificationActionCommand('resolve',{notes}),null);
  for(const [kind,body] of [['resolve',{requestId,notes:'bad'}],['resolve',{requestId,notes,extra:'private'}],['resolve',{requestId:'invalid',notes}],
    ['assign',{requestId,ownerId:'maya'}],['assign',{requestId,ownerId:'foreign\nid',expectedOwnerId:null}],['assign',{requestId,ownerId:null,expectedOwnerId:null,org_id:'foreign'}]])
    assert.throws(()=>clarificationActionCommand(kind,body));
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} owner/resolution receipts are original-actor exact, append-only and independent of later state`,async()=>{
  const f=await fixture(pg);try{
    const before=JSON.stringify((await f.q('SELECT * FROM attempts')).rows),input={requestId:randomUUID(),ownerId:'other',expectedOwnerId:null};
    const first=await f.assign(input);assert.equal(first.effect,'applied');assert.equal(first.ownerId,'other');assert.equal(first.kind,'assign');
    assert.deepEqual(await f.assign(input),first);assert.deepEqual(await f.receipt(input.requestId),first);
    await assert.rejects(async()=>f.assign({...input,ownerId:'maya'}),/action conflict/);
    await assert.rejects(async()=>f.receipt(input.requestId,{...owner,principal_id:'other',role:'supervisor'}),/receipt unavailable/);
    const resolution={requestId:randomUUID(),notes:'Synthetic private resolution without certification.'},resolved=await f.resolve(resolution);
    assert.equal(resolved.status,'resolved');assert.equal(resolved.effect,'applied');assert.deepEqual(await f.resolve(resolution),resolved);
    assert.deepEqual(await f.assign(input),first);assert.deepEqual(await f.receipt(input.requestId),first);
    assert.equal(JSON.stringify(await f.receipt(resolution.requestId)).includes(resolution.notes),false);
    const rows=(await f.q('SELECT * FROM clarification_action_receipts')).rows;assert.equal(rows.length,2);assert.equal(JSON.stringify(rows).includes(resolution.notes),false);
    assert.equal((await f.q("SELECT count(*) n FROM audit WHERE action='clarification.assigned'")).rows[0].n,1);
    assert.equal((await f.q("SELECT count(*) n FROM audit WHERE action='clarification.resolved'")).rows[0].n,1);
    assert.equal(JSON.stringify((await f.q('SELECT * FROM attempts')).rows),before);
    await assert.rejects(f.q("UPDATE clarification_action_receipts SET effect='unchanged'"),/immutable/);
    await assert.rejects(f.q('DELETE FROM clarification_action_receipts'),/immutable/);
    await assert.rejects(async()=>f.call('resolveClarification',{...owner,principal_id:'audit',role:'auditor'},f.id,{requestId:randomUUID(),notes:resolution.notes}),/Forbidden/);
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} stale owner, unavailable owner and competing resolution produce durable rejected receipts, not success`,async()=>{
  const f=await fixture(pg);try{
    await f.assign({ownerId:'other'});
    const stale={requestId:randomUUID(),ownerId:'maya',expectedOwnerId:null},rejected=await f.assign(stale);
    assert.equal(rejected.effect,'rejected');assert.equal(rejected.reasonCode,'owner_changed');assert.equal(rejected.ownerId,'other');
    assert.deepEqual(await f.assign(stale),rejected);assert.deepEqual(await f.receipt(stale.requestId),rejected);
    const unavailable=await f.assign({requestId:randomUUID(),ownerId:'foreign',expectedOwnerId:'other'});assert.equal(unavailable.reasonCode,'owner_unavailable');
    const unchanged=await f.assign({requestId:randomUUID(),ownerId:'other',expectedOwnerId:null});assert.equal(unchanged.effect,'unchanged');
    await f.resolve({notes:'Synthetic earlier resolution'});
    const otherResolution=await f.resolve({requestId:randomUUID(),notes:'Different synthetic resolution'});assert.equal(otherResolution.effect,'rejected');assert.equal(otherResolution.reasonCode,'resolution_conflict');
    const sameResolution=await f.resolve({requestId:randomUUID(),notes:'Synthetic earlier resolution'});assert.equal(sameResolution.effect,'unchanged');
    const closed=await f.assign({requestId:randomUUID(),ownerId:null,expectedOwnerId:'other'});assert.equal(closed.reasonCode,'case_resolved');
    assert.equal((await f.call('getClarification',owner,f.id)).notes,'Synthetic earlier resolution');
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} receipt audit failure atomically rolls back the action and exact retry commits once`,async()=>{
  const f=await fixture(pg);try{
    if(pg)await f.db.exec("CREATE FUNCTION fail_case_action_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='clarification.action_received' THEN RAISE EXCEPTION 'Synthetic receipt audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_case_action_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_case_action_audit()");
    else f.db.exec("CREATE TRIGGER fail_case_action_audit BEFORE INSERT ON audit WHEN NEW.action='clarification.action_received' BEGIN SELECT RAISE(ABORT,'Synthetic receipt audit failure'); END");
    const input={requestId:randomUUID(),notes:'Synthetic failed receipt audit'};
    await assert.rejects(async()=>f.resolve(input),/Synthetic receipt audit failure/);
    assert.equal((await f.call('getClarification',owner,f.id)).status,'open');assert.equal((await f.q('SELECT count(*) n FROM clarification_action_receipts')).rows[0].n,0);
    assert.equal((await f.q("SELECT count(*) n FROM audit WHERE action='clarification.resolved'")).rows[0].n,0);
    if(pg)await f.db.exec('DROP TRIGGER fail_case_action_audit ON audit');else f.db.exec('DROP TRIGGER fail_case_action_audit');
    const receipt=await f.resolve(input);assert.equal(receipt.effect,'applied');assert.deepEqual(await f.resolve(input),receipt);
    assert.equal((await f.q("SELECT count(*) n FROM audit WHERE action='clarification.resolved'")).rows[0].n,1);
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} scoped projected case reads match the strict client contract without private list fields`,async()=>{
  const f=await fixture(pg);try{
    const context='a'.repeat(64),page=clarificationPageView(await f.call('listClarifications',owner,{page:1,pageSize:20}),context);
    checkedClarificationPage(page,1,20,context);assert.ok(page.ownerOptions.some(row=>row.id==='other'));assert.ok(!page.ownerOptions.some(row=>row.id==='foreign'||row.id==='audit'));
    assert.ok(page.rows.every(row=>!Object.hasOwn(row,'notes')));
    const detail=clarificationDetailView(await f.call('getClarification',owner,f.id),context);checkedClarificationDetail(detail,f.id,context);
    assert.equal(detail.helpRequest.text,'Synthetic original help request');assert.equal(Object.hasOwn(detail.snapshot,'rubric'),false);
    const input={requestId:randomUUID(),notes:'Synthetic private resolution'};await f.resolve(input);
    await assert.rejects(async()=>f.call('clarificationActionReceipt',{...owner,principal_id:'foreign',org_id:pg?'foreign':'harbor',site_id:pg?'foreign':'harbor-yard'},f.id,input.requestId),/unavailable/);
    const fields='request_id,org_id,site_id,case_id,actor_id,actor_role,kind,request_hash,effect,result_status,result_owner_id,reason_code,created_at';
    const values=[randomUUID(),'cedar','beirut',f.id,'foreign','owner','resolve','c'.repeat(64),'applied','resolved',null,null,new Date().toISOString()];
    const placeholders=values.map((_,index)=>pg?'$'+(index+1):'?').join(',');
    await assert.rejects(f.q(`INSERT INTO clarification_action_receipts(${fields}) VALUES(${placeholders})`,values),/scope|foreign key/i);
  }finally{await f.close();}
});

test('case HTTP error projection never leaks internal diagnostics',()=>{
  assert.deepEqual(clarificationHttpError(Error('PRIVATE_SQL_DIAGNOSTIC')),{status:503,error:'Clarification operation unavailable. Check the request status before retrying.'});
  for(const [message,status] of [['Forbidden',403],['Clarification action conflict',409],['Invalid clarification filter',400],['Clarification action receipt unavailable',404]])assert.equal(clarificationHttpError(Error(message)).status,status);
});

test('SQLite historical recorded-assessment wrappers retain reasons and quotes without exposing wrapper metadata',async()=>{
  const f=await fixture(false);try{
    const id=(await f.q('SELECT id FROM clarifications WHERE attempt_id IS NOT NULL LIMIT 1')).rows[0].id;
    const original=await f.call('getClarification',owner,id),evidence=[{factIndex:0,quote:original.answer_text.slice(0,20)}];
    await f.q('UPDATE attempts SET reasons_json=? WHERE id=?',[JSON.stringify({reasons:['missing_asked_fact'],evidence,recordingId:'PRIVATE_LEGACY_WRAPPER_METADATA'}),original.attempt_id]);
    const value=clarificationDetailView(await f.call('getClarification',owner,id),'a'.repeat(64));
    checkedClarificationDetail(value,id,'a'.repeat(64));assert.deepEqual(value.assessmentReasons,['missing_asked_fact']);assert.deepEqual(value.assessmentEvidence,evidence);
    assert.deepEqual(value.attempts.find(row=>row.id===original.attempt_id).assessmentEvidence,evidence);
    assert.equal(JSON.stringify(value).includes('PRIVATE_LEGACY_WRAPPER_METADATA'),false);
  }finally{await f.close();}
});
