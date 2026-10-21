import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureStaffCaseRecordingSchema} from '../server/staff-case-recording-schema.mjs';
import * as local from '../server/staff-case-recordings.mjs';
import * as postgres from '../server/postgres/staff-case-recordings.mjs';
import * as localCases from '../server/clarifications.mjs';
import * as pgCases from '../server/postgres/clarifications.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {processOneCaseVoicePurge,getCaseVoiceAudio} from '../server/postgres/case-voice.mjs';
import {encodeWav} from '../src/audio.ts';
import {staffRecordingInput,staffRecordingPage} from '../server/staff-case-recording-input.mjs';
import {requestWorkerDeletion} from '../server/deletions.mjs';
import {requestWorkerDeletion as pgDelete} from '../server/postgres/deletions.mjs';
import {processOneDeletionRedaction} from '../server/deletion-redactions.mjs';
import {processOneDeletionRedaction as pgRedact} from '../server/postgres/deletion-redactions.mjs';
import {processOneDeletionPseudonym} from '../server/deletion-pseudonyms.mjs';
import {processOneDeletionPseudonym as pgPseudonym} from '../server/postgres/deletion-pseudonyms.mjs';
import {processOneDeletionCompletion} from '../server/deletion-completions.mjs';
import {processOneDeletionCompletion as pgComplete} from '../server/postgres/deletion-completions.mjs';
import {createAppServer} from '../server/index.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential} from '../server/auth.mjs';
import {provisionStaffCredential as provisionPgCredential} from '../server/postgres/auth.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {listCaseTimeline} from '../server/case-timeline.mjs';
import {listCaseTimeline as pgTimeline} from '../server/postgres/case-timeline.mjs';
import {createHash} from 'node:crypto';
import {checkedStaffRecordingReceipt,checkedStaffRecordingPage,checkedStaffRecordingNotice,requestStaffRecording} from '../src/staff-case-recordings.ts';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},worker={...owner,principal_type:'worker',principal_id:'worker-30'};
const wav=(amplitude=.2)=>Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(amplitude)}));
async function fixture(pg,schema='public'){
  const db=pg?new PGlite():openDatabase(':memory:');let pool;
  if(pg){
    pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release(){}};}};
    if(schema!=='public')await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
    await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic'),('foreign','Foreign');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC'),('foreign','foreign','Foreign','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic Owner','owner'),('other','cedar','beirut','Synthetic Supervisor','supervisor'),
        ('audit','cedar','beirut','Synthetic Auditor','auditor'),('admin','cedar','beirut','Synthetic Administrator','administrator'),('foreign','foreign','foreign','Foreign','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker-30','cedar','beirut','Worker 030','ar');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','cedar','beirut','Synthetic','Synthetic','draft');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('publication','cedar','beirut','brief',3,'{"title":"Synthetic","languages":{"ar":{"text":"Synthetic"}}}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment-30','cedar','beirut','publication','worker-30','ar');`);
  }else{seed(db);ensureStaffCaseRecordingSchema(db);db.exec("INSERT INTO staff VALUES('other','cedar','beirut','Synthetic Supervisor','supervisor',1),('audit','cedar','beirut','Synthetic Auditor','auditor',1),('admin','cedar','beirut','Synthetic Administrator','administrator',1)");}
  const q=async(sql,args=[])=>pg?db.query(sql,args):{rows:db.prepare(sql).all(...args)};
  const caseId=randomUUID(),requestId=randomUUID(),objects=new Map();
  if(pg)await pgCases.requestHelp(pool,worker,'assignment-30',{requestId:caseId,text:'Synthetic original help'},{schema});else localCases.requestHelp(db,worker,'assignment-30',{requestId:caseId,text:'Synthetic original help'});
  const storage={async save(row,bytes){if(objects.has(row.id))throw Error('Overwrite refused');objects.set(row.id,Buffer.from(bytes));},async read(row){if(!objects.has(row.id))throw Error('Unavailable');return Buffer.from(objects.get(row.id));},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
  const call=(method,principal,...args)=>pg?postgres[method](pool,principal,...args,{schema}):local[method](db,principal,...args);
  return {pg,db,pool,q,caseId,requestId,objects,storage,call,
    receive:(bytes=wav(),language='en',id=requestId,principal=owner)=>call('receiveStaffCaseRecording',principal,caseId,id,language,bytes,storage),
    receipt:(principal=owner)=>call('staffCaseRecordingReceipt',principal,caseId,requestId),
    list:()=>call('listStaffCaseRecordings',owner,caseId,{}),audio:(principal=owner)=>call('getStaffCaseRecordingAudio',principal,caseId,requestId,storage),
    resolve:()=>pg?pgCases.resolveClarification(pool,owner,caseId,{notes:'Synthetic private human resolution'},{schema}):localCases.resolveClarification(db,owner,caseId,{notes:'Synthetic private human resolution'}),
    purge:()=>pg?processOneCaseVoicePurge(pool,storage,{schema}):local.processOneStaffCaseRecordingPurge(db,storage),close:()=>db.close()};
}

test('staff recording commands have explicit bounded purpose, request identity and pagination',()=>{
  const id=randomUUID();assert.equal(staffRecordingInput('case-1',id,'ur').language,'ur');assert.deepEqual(staffRecordingPage(),{page:1,pageSize:10});
  for(const args of [['../case',id,'en'],['case','invalid','en'],['case',id,'fr']])assert.throws(()=>staffRecordingInput(...args));
  for(const input of [null,[],{page:true},{page:0},{page:5001},{page:'1e0'},{pageSize:20},{org_id:'foreign'}])assert.throws(()=>staffRecordingPage(input));
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} real staff recording HTTP binds captured context, serves private ranges and does not expose audio to workers`,async()=>{
  const schema=pg?'understood_test_staff_recording_http':'public',f=await fixture(pg,schema),root=await mkdtemp(join(tmpdir(),'understood-staff-recording-http-'));
  const origin='http://127.0.0.1:3031',password='Synthetic-staff-recording-password';let server;
  try{
    for(const id of ['maya','other','audit','admin']){
      if(pg)await provisionPgCredential(f.pool,{staffId:id,orgId:'cedar',siteId:'beirut',email:id+'@recording.example.test',password},{schema});
      else provisionStaffCredential(f.db,id,id+'@recording.example.test',password);
    }
    const options={tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,mail:{mode:'disabled'}};
    server=pg?createPostgresRehearsalServer(f.pool,{...options,schema,dataClass:'synthetic',storage:f.storage}):createAppServer(f.db,{...options,audioRoot:join(root,'audio')});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const call=(path,cookie,context,bytes,extra={})=>fetch(base+path,{method:bytes===undefined?'GET':'POST',headers:{origin,...(cookie?{cookie}:{}),...(context===undefined?{}:{'x-client-session-context':context}),...(bytes===undefined?{}:{'content-type':'audio/wav','x-recording-language':'ur'}),...extra},...(bytes===undefined?{}:{body:bytes})});
    const login=async id=>{const response=await fetch(base+'/auth/staff/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:id+'@recording.example.test',password})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0],session=await (await call('/session',cookie)).json();return {cookie,context:session.clientContext,session};};
    const owner=await login('maya'),other=await login('other'),path=`/clarifications/${f.caseId}/in-person-recordings`,target=path+'/'+f.requestId;
    assert.equal((await call(path)).status,401);assert.equal((await call(path,owner.cookie)).status,409);assert.equal((await call(target,owner.cookie,'f'.repeat(64),wav())).status,409);
    for(const query of ['?page=1&page=2','?pageSize=20','?org_id=foreign'])assert.equal((await call(path+query,owner.cookie,owner.context)).status,400);
    assert.equal((await call(target,owner.cookie,owner.context,wav(),{'content-type':'audio/webm'})).status,400);
    assert.equal((await call(target,owner.cookie,owner.context,wav(),{'x-recording-language':'fr'})).status,400);
    assert.equal((await call(target,owner.cookie,owner.context,Buffer.from('not WAV'))).status,400);
    const acceptedResponse=await call(target,owner.cookie,owner.context,wav());assert.equal(acceptedResponse.status,200);const accepted=await acceptedResponse.json();assert.equal(accepted.status,'received');assert.equal(accepted.language,'ur');assert.equal(accepted.clientContext,owner.context);
    assert.equal(acceptedResponse.headers.get('cache-control'),'no-store');assert.deepEqual(await (await call(target,owner.cookie,owner.context)).json(),accepted);
    const captured={caseId:f.caseId,assignmentId:'assignment-30'},retained={id:f.requestId,hash:createHash('sha256').update(wav()).digest('hex'),bytes:wav().length,language:'ur'};
    assert.deepEqual(checkedStaffRecordingReceipt(accepted,owner.session,captured,retained),accepted);
    assert.equal(checkedStaffRecordingPage(await (await call(path,owner.cookie,owner.context)).json(),f.caseId,1,owner.context).items[0].available,true);
    for(const who of [owner,other])assert.equal(checkedStaffRecordingNotice(await (await call('/privacy/recording-notice',who.cookie,who.context)).json(),who.session,'ur'),null);
    const transport=(path,options)=>fetch(base.replace(/\/api$/,'')+path,{...options,headers:{...options.headers,origin,cookie:owner.cookie}});
    assert.deepEqual(await requestStaffRecording(transport,owner.session,captured,retained,{kind:'receipt'},new AbortController().signal,()=>true),accepted);
    assert.deepEqual(await (await call(target,owner.cookie,owner.context,wav())).json(),accepted);assert.equal((await call(target,owner.cookie,owner.context,wav(.3))).status,409);
    assert.equal((await call(target,other.cookie,other.context)).status,404);
    const audio=await call(target+'/audio',other.cookie);assert.equal(audio.status,200);assert.equal(audio.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await audio.arrayBuffer()),wav());
    const partial=await call(target+'/audio',owner.cookie,undefined,undefined,{range:'bytes=0-43'});assert.equal(partial.status,206);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),wav().subarray(0,44));
    assert.equal((await call(target+'/audio')).status,401);assert.equal((await call(target+'?org_id=foreign',owner.cookie,owner.context)).status,400);
    for(const id of ['audit','admin']){const denied=await login(id);assert.equal((await call(path,denied.cookie,denied.context)).status,403);assert.equal((await call(target+'/audio',denied.cookie)).status,403);}
    await f.resolve();assert.equal((await call(path+'/'+randomUUID(),owner.cookie,owner.context,wav())).status,409);assert.deepEqual(await (await call(target,owner.cookie,owner.context,wav())).json(),accepted);
    assert.equal((await f.q('SELECT count(*) n FROM case_messages')).rows[0].n,0);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'understood-staff-recording-http-'));await rm(root,{recursive:true});}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} private staff recording is an exact original-actor receipt, never a worker answer or message`,async()=>{
  const f=await fixture(pg);try{
    const before=JSON.stringify((await f.q('SELECT * FROM attempts ORDER BY id')).rows),answers=(await f.q('SELECT count(*) n FROM submission_receipts')).rows[0].n;
    const received=await f.receive();assert.equal(received.kind,'in_person');assert.equal(received.actorId,'maya');assert.equal(received.actorRole,'owner');assert.equal(received.language,'en');assert.equal(received.status,'received');
    assert.deepEqual(await f.receive(),received);assert.deepEqual(await f.receipt(),received);assert.deepEqual(await f.audio(),wav());
    const list=await f.list();assert.equal(list.total,1);assert.equal(list.items[0].available,true);assert.equal(list.items[0].actorName,pg?'Synthetic Owner':'Maya Haddad');
    assert.equal((await f.q('SELECT count(*) n FROM case_messages')).rows[0].n,0);assert.equal((await f.q('SELECT count(*) n FROM submission_receipts')).rows[0].n,answers);
    const timeline=await (pg?pgTimeline:listCaseTimeline)(pg?f.pool:f.db,owner,f.caseId);
    assert.equal(timeline.items.filter(row=>row.kind==='in_person_recorded').length,1);assert.doesNotMatch(JSON.stringify(timeline),/sha256|audioUrl|storage|Synthetic original help/);
    assert.equal(JSON.stringify((await f.q('SELECT * FROM attempts ORDER BY id')).rows),before);
    await assert.rejects(async()=>f.receive(wav(.3)),/conflict/);await assert.rejects(async()=>f.receive(wav(),'ar'),/conflict/);
    await assert.rejects(async()=>f.receipt({...owner,principal_id:'other',role:'supervisor'}),/receipt unavailable/);
    await assert.rejects(async()=>f.audio(worker),/Forbidden/);await assert.rejects(async()=>f.audio({...owner,principal_id:'audit',role:'auditor'}),/Forbidden/);
    await assert.rejects(async()=>f.audio({...owner,principal_id:'admin',role:'administrator'}),/Forbidden/);
    await assert.rejects(async()=>f.audio({...owner,principal_id:pg?'foreign':'harbor-owner',org_id:pg?'foreign':'harbor',site_id:pg?'foreign':'harbor-yard'}),/unavailable/);
    if(pg)await assert.rejects(getCaseVoiceAudio(f.pool,worker,f.caseId,f.requestId,f.storage),/unavailable/);
    await assert.rejects(f.q("UPDATE case_voice SET actor_id='other'"),/immutable/);await assert.rejects(f.q('DELETE FROM case_voice'),/immutable/);
    await f.resolve();assert.deepEqual(await f.receive(),received);assert.deepEqual(await f.receipt(),received);assert.deepEqual(await f.audio(),wav());
    await assert.rejects(async()=>f.receive(wav(),'en',randomUUID()),/unavailable/);assert.equal((await f.list()).canRecord,false);
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} lost private-save acknowledgement reconciles exact bytes; corrupt audio and failed audit cannot claim received`,async()=>{
  const f=await fixture(pg);try{
    const save=f.storage.save;f.storage.save=async(row,bytes)=>{await save(row,bytes);throw Error('Synthetic lost save acknowledgement');};
    assert.equal((await f.receive()).status,'received');f.storage.save=save;
    await assert.rejects(async()=>f.receive(Buffer.from('not audio'),'en',randomUUID()),/Invalid staff recording audio/);
    const second=randomUUID();f.storage.read=async()=>wav(.3);assert.equal((await f.receive(wav(),'en',second)).status,'failed');
    assert.equal((await f.call('staffCaseRecordingReceipt',owner,f.caseId,second)).status,'failed');
    f.storage.read=async row=>Buffer.from(f.objects.get(row.id));
    if(pg)await f.db.exec("CREATE FUNCTION fail_staff_voice_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='clarification.in_person_recorded' THEN RAISE EXCEPTION 'Synthetic staff audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_staff_voice_audit BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION fail_staff_voice_audit()");
    else f.db.exec("CREATE TRIGGER fail_staff_voice_audit BEFORE INSERT ON audit WHEN NEW.action='clarification.in_person_recorded' BEGIN SELECT RAISE(ABORT,'Synthetic staff audit failure'); END");
    const failed=await f.receive(wav(),'en',randomUUID());assert.equal(failed.status,'failed');assert.equal(failed.receivedAt,null);
    assert.equal(await f.purge(),true);assert.equal(await f.purge(),true);assert.equal(f.objects.size,1);
    assert.equal((await f.q("SELECT count(*) n FROM audit WHERE action='clarification.in_person_recorded'")).rows[0].n,1);
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} revocation during private storage fences acceptance and stale staged bytes are reclaimed`,async()=>{
  const f=await fixture(pg);try{
    const save=f.storage.save;f.storage.save=async(row,bytes)=>{await save(row,bytes);await f.q(`UPDATE staff SET active=${pg?'false':'0'} WHERE id='maya'`);};
    await assert.rejects(async()=>f.receive(),/Forbidden/);assert.equal((await f.q("SELECT count(*) n FROM case_voice WHERE status='received'")).rows[0].n,0);
    assert.equal((await f.q('SELECT count(*) n FROM case_messages')).rows[0].n,0);
    await f.q("UPDATE case_voice SET lease_until='2000-01-01T00:00:00.000Z'");assert.equal(await f.purge(),true);assert.equal(f.objects.size,0);
    assert.equal((await f.q('SELECT cleanup_state FROM case_voice')).rows[0].cleanup_state,'cleaned');
  }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} staff audio deletion needs verified absence, retries interrupted cleanup and rechecks late objects`,async()=>{
  const f=await fixture(pg);try{
    const originalReceipt=await f.receive(),row=(await f.q('SELECT * FROM case_voice')).rows[0];
    await (pg?pgDelete:requestWorkerDeletion)(pg?f.pool:f.db,owner,'worker-30',{requestId:randomUUID(),expectedCode:'Worker 030',reason:'worker_request',confirmed:true});
    await assert.rejects(async()=>f.audio(),/unavailable/);assert.equal((await f.list()).items[0].available,false);
    f.storage.remove=async()=>{};assert.equal(await f.purge(),true);assert.equal((await f.q('SELECT cleanup_state FROM case_voice')).rows[0].cleanup_state,'cleaning');
    await (pg?pgRedact:processOneDeletionRedaction)(pg?f.pool:f.db);await (pg?pgPseudonym:processOneDeletionPseudonym)(pg?f.pool:f.db);
    const complete=()=> (pg?pgComplete:processOneDeletionCompletion)(pg?f.pool:f.db,f.storage);assert.equal(await complete(),false);
    f.storage.remove=async item=>f.objects.delete(item.id);await f.q("UPDATE case_voice SET cleanup_until='2000-01-01T00:00:00.000Z'");
    assert.equal(await f.purge(),true);assert.equal(f.objects.size,0);
    await (pg?pgRedact:processOneDeletionRedaction)(pg?f.pool:f.db);await (pg?pgPseudonym:processOneDeletionPseudonym)(pg?f.pool:f.db);
    f.objects.set(row.id,wav());assert.equal(await complete(),false);
    await f.q("UPDATE case_voice SET cleanup_checked_at='2000-01-01T00:00:00.000Z'");assert.equal(await f.purge(),true);assert.equal(f.objects.size,0);assert.equal(await complete(),true);
    assert.deepEqual(await f.receipt(),originalReceipt);
  }finally{await f.close();}
});
