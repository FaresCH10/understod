import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensureStaffCaseRecordingSchema} from '../server/staff-case-recording-schema.mjs';
import {receiveStaffCaseRecording} from '../server/staff-case-recordings.mjs';
import {listStaffCaseRecordings,getStaffCaseRecordingAudio} from '../server/postgres/staff-case-recordings.mjs';
import {requestHelp} from '../server/clarifications.mjs';
import {audioStore} from '../server/private-storage.mjs';
import {backupLocal,restoreLocal} from '../scripts/local-backup.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {importSqliteBackup} from '../server/postgres/import-sqlite.mjs';
import {encodeWav} from '../src/audio.ts';
import {validateImportedCaseVoice} from '../server/postgres/staff-case-recording-import.mjs';

test('private staff audio survives local restore and guarded synthetic cutover with historical author and no replayed staging',async()=>{
  const root=await mkdtemp(join(tmpdir(),'understood-staff-audio-backup-')),database=join(root,'source.sqlite'),audioRoot=join(root,'audio');
  const db=openDatabase(database),pg=new PGlite(),schema='understood_test_staff_audio_backup';
  let fail=false;const pool={connect:async()=>({query:async(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO "case_voice"'))throw Error('Synthetic import interruption');return args?.length?pg.query(sql,args):(await pg.exec(sql)).at(-1)||{rows:[]};},release(){}})};
  const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
  const bytes=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(.2)}));
  try{
    seed(db);ensureStaffCaseRecordingSchema(db);const caseId=randomUUID(),requestId=randomUUID();
    requestHelp(db,{...owner,principal_type:'worker',principal_id:'worker-30'},'assignment-30',{requestId:caseId,text:'Synthetic help'});
    const receipt=await receiveStaffCaseRecording(db,owner,caseId,requestId,'ur',bytes,audioStore(audioRoot));
    const original=db.prepare('SELECT * FROM case_voice').get(),staged={...original,id:randomUUID(),request_id:randomUUID(),status:'storing',case_id:null,received_at:null,lease_token:randomUUID(),lease_until:new Date(Date.now()+120000).toISOString()};
    const fields=Object.keys(staged);db.prepare(`INSERT INTO case_voice(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).run(...fields.map(key=>staged[key]));
    db.exec("UPDATE staff SET role='auditor',active=0 WHERE id='maya'");
    const backup=join(root,'backup');assert.equal((await backupLocal({database,audioRoot,destination:backup})).recordings,1);
    const restored=join(root,'restored');await restoreLocal({source:backup,destination:restored});
    assert.deepEqual(await audioStore(join(restored,'private-audio')).read(original),bytes);
    await pg.exec(`CREATE SCHEMA ${schema}`);await runMigrations(pool,{schema});
    const options={source:backup,schema,requestId:randomUUID(),dataClass:'synthetic',dryRun:true};
    const dry=await importSqliteBackup(pool,options);assert.equal(dry.counts.case_voice,2);assert.equal((await pg.query(`SELECT count(*) n FROM ${schema}.case_voice`)).rows[0].n,0);
    const enabled=async()=> (await pg.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='case_voice_guard'",[`${schema}.case_voice`])).rows[0].tgenabled;
    assert.equal(await enabled(),'O');fail=true;await assert.rejects(importSqliteBackup(pool,{...options,dryRun:false}),/Synthetic import interruption/);fail=false;assert.equal(await enabled(),'O');
    assert.equal((await pg.query(`SELECT count(*) n FROM ${schema}.staff`)).rows[0].n,0);
    await importSqliteBackup(pool,{...options,dryRun:false});assert.equal(await enabled(),'O');
    const rows=(await pg.query(`SELECT * FROM ${schema}.case_voice ORDER BY request_id`)).rows;
    const accepted=rows.find(row=>row.request_id===requestId),retired=rows.find(row=>row.request_id===staged.request_id);
    assert.equal(accepted.actor_id,'maya');assert.equal(accepted.actor_role,'owner');assert.equal(accepted.status,'received');assert.equal(accepted.received_at.toISOString(),receipt.receivedAt);
    assert.equal(retired.status,'failed');assert.equal(retired.lease_token,null);assert.equal(retired.lease_until,null);
    const supervisor={...owner,principal_id:'reader',role:'supervisor'};
    await pg.exec(`SET search_path TO ${schema},pg_catalog`);
    await pg.query(`INSERT INTO ${schema}.staff(id,org_id,site_id,name,role) VALUES('reader','cedar','beirut','Synthetic reader','supervisor')`);
    const list=await listStaffCaseRecordings(pool,supervisor,caseId,{}, {schema});assert.equal(list.total,2);assert.equal(list.items.find(row=>row.requestId===requestId).actorRole,'owner');
    assert.deepEqual(await getStaffCaseRecordingAudio(pool,supervisor,caseId,requestId,audioStore(join(restored,'private-audio')),{schema}),bytes);
    await assert.rejects(pg.query(`UPDATE ${schema}.case_voice SET actor_id='reader'`),/immutable/);
    const snapshot={assignments:db.prepare('SELECT * FROM assignments').all(),staff:db.prepare('SELECT * FROM staff').all(),clarifications:db.prepare('SELECT * FROM clarifications').all().map(row=>({...row,site_id:'beirut'})),case_messages:[],case_voice:[original]};
    assert.doesNotThrow(()=>validateImportedCaseVoice(snapshot));
    for(const change of [{actor_id:'foreign'},{actor_role:'auditor'},{worker_id:'worker-29'},{kind:'reply'},{sha256:'invalid'},{status:'failed'},{request_id:'invalid'}])
      assert.throws(()=>validateImportedCaseVoice({...snapshot,case_voice:[{...original,...change}]}),/Invalid source/);
  }finally{db.close();await pg.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'understood-staff-audio-backup-'));await rm(root,{recursive:true});}
});
