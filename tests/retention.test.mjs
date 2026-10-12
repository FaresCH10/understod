import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {getRetention,saveRetention,retentionReceipt,ensureRetentionSchema,processOneAudioPurge} from '../server/retention.mjs';
import {getRecordingAudio} from '../server/recordings.mjs';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {getRetention as pgGet,saveRetention as pgSave,retentionReceipt as pgReceipt,processOneAudioPurge as pgPurge} from '../server/postgres/retention.mjs';
import {getRecordingAudio as pgAudio} from '../server/postgres/recordings.mjs';

const session={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
function fixture(){const db=openDatabase(':memory:');seed(db);ensureRetentionSchema(db);return db;}
function recording(db,{age=40,status='processing'}={}){
  const id=randomUUID(),assignment=db.prepare("SELECT id FROM assignments WHERE org_id='cedar' LIMIT 1").get();
  const created=new Date(Date.now()-age*86400000).toISOString();
  db.prepare(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,created_at,received_at,lease_token,lease_until)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,'cedar','beirut',assignment.id,randomUUID(),'synthetic',1,100,status,created,created,'old-worker',new Date(Date.now()+180000).toISOString());
  return id;
}
test('retention policy requires confirmation, current revision and active scoped authority',()=>{
  const db=fixture();try{
    assert.equal(getRetention(db,session).audioDays,null);
    const input={requestId:randomUUID(),revision:0,audioDays:30,confirmed:true};
    assert.throws(()=>saveRetention(db,session,{...input,confirmed:false}),/Invalid/);
    assert.throws(()=>saveRetention(db,{...session,site_id:'harbor-yard'},input),/Forbidden/);
    assert.deepEqual(saveRetention(db,session,input),{revision:1,duplicate:false});
    assert.deepEqual(saveRetention(db,session,input),{revision:1,duplicate:true});
    assert.equal(retentionReceipt(db,session,input.requestId).revision,1);
    assert.equal(retentionReceipt(db,session,randomUUID()),null);
    assert.throws(()=>saveRetention(db,session,{...input,audioDays:7}),/conflict/);
    assert.throws(()=>saveRetention(db,session,{...input,requestId:randomUUID()}),/revision changed/);
    assert.equal(getRetention(db,session).audioDays,30);
  }finally{db.close();}
});
test('audio purge fences workers, denies playback and retries failed object deletion durably',async()=>{
  const db=fixture();try{
    saveRetention(db,session,{requestId:randomUUID(),revision:0,audioDays:30,confirmed:true});
    const id=recording(db),fresh=recording(db,{age:1});let removals=0;
    const failed={async remove(row){assert.equal(row.id,id);removals++;throw new Error('Storage outage');}};
    assert.equal(await processOneAudioPurge(db,failed),true);
    assert.equal(db.prepare('SELECT lease_token FROM recordings WHERE id=?').get(id).lease_token,null);
    await assert.rejects(getRecordingAudio(db,session,id,{async read(){throw new Error('Must not read');}}),/Recording unavailable/);
    assert.equal(db.prepare('SELECT status FROM recording_purges WHERE recording_id=?').get(id).status,'queued');
    assert.equal(await processOneAudioPurge(db,failed),false);
    const future=new Date(Date.now()+60000).toISOString();
    assert.equal(await processOneAudioPurge(db,{async remove(row){assert.equal(row.id,id);removals++;},async exists(){return false;}},{now:future}),true);
    assert.equal(removals,2);
    assert.equal(db.prepare('SELECT status FROM recording_purges WHERE recording_id=?').get(id).status,'complete');
    assert.equal(db.prepare('SELECT status FROM recordings WHERE id=?').get(fresh).status,'processing');
    assert.equal(db.prepare("SELECT count(*) AS count FROM audit WHERE action='recording.audio.purged'").get().count,1);
    assert.equal(await processOneAudioPurge(db,failed,{now:future}),false);
  }finally{db.close();}
});

test('audio cleanup during a private storage read prevents returning the earlier recording bytes',async()=>{
  const db=fixture();try{
    saveRetention(db,session,{requestId:randomUUID(),revision:0,audioDays:7,confirmed:true});
    const id=recording(db,{age:10,status:'received'});
    await assert.rejects(getRecordingAudio(db,session,id,{async read(){
      await processOneAudioPurge(db,{async remove(){},async exists(){return false;}});
      return Buffer.from('earlier synthetic bytes');
    }}),/Recording unavailable/);
  }finally{db.close();}
});

test('revoking staff during private audio read prevents returning previously authorized bytes',async()=>{
  const db=fixture();try{
    const id=recording(db,{age:1,status:'received'});
    await assert.rejects(getRecordingAudio(db,session,id,{async read(){
      db.prepare("UPDATE staff SET active=0 WHERE id='maya'").run();
      return Buffer.from('earlier synthetic bytes');
    }}),/Forbidden/);
  }finally{db.close();}
});

test('PostgreSQL audio retention survives storage failure and preserves immutable cleanup evidence',async()=>{
  const db=new PGlite(),options={schema:'understood_test_retention'};
  const pool={async connect(){return {async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  try{
    await db.exec(`CREATE SCHEMA ${options.schema}; SET search_path TO ${options.schema},pg_catalog`);
    await runMigrations(pool,options);
    await db.exec(`INSERT INTO organizations VALUES('cedar','Cedar Works');
      INSERT INTO sites VALUES('beirut','cedar','Beirut','UTC');
      INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner');
      INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','cedar','beirut','Worker','en');
      INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('briefing','cedar','beirut','Title','Source','ready');
      INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('publication','cedar','beirut','briefing',1,'{}','published');
      INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','cedar','beirut','publication','worker','en');`);
    const input={requestId:randomUUID(),revision:0,audioDays:30,confirmed:true};
    assert.equal((await pgSave(pool,session,input,options)).revision,1);
    assert.equal((await pgSave(pool,session,input,options)).duplicate,true);
    assert.equal((await pgReceipt(pool,session,input.requestId,options)).request.audioDays,30);
    assert.equal(await pgReceipt(pool,session,randomUUID(),options),null);
    await assert.rejects(pgSave(pool,session,{...input,requestId:randomUUID()},options),/revision changed/);
    await assert.rejects(pgGet(pool,{...session,site_id:'foreign'},options),/Forbidden/);
    const id=randomUUID();
    await db.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,received_at,lease_token,lease_until)
      VALUES($1,'cedar','beirut','assignment',$2,$3,1,100,'processing',clock_timestamp()-interval '40 days','stale',clock_timestamp()+interval '3 minutes')`,[id,randomUUID(),'a'.repeat(64)]);
    assert.equal(await pgPurge(pool,{async remove(){throw new Error('Injected outage');}},options),true);
    let row=(await db.query('SELECT r.status,r.lease_token,d.status AS purge_status FROM recordings r JOIN recording_purges d ON d.recording_id=r.id')).rows[0];
    assert.equal(row.status,'failed');assert.equal(row.lease_token,null);assert.equal(row.purge_status,'queued');
    await assert.rejects(pgAudio(pool,session,id,{async read(){throw new Error('Must not read expired audio');}},options),/Recording unavailable/);
    await db.query('UPDATE recording_purges SET retry_at=clock_timestamp()-interval \'1 second\'');
    let removed=0;
    assert.equal(await pgPurge(pool,{async remove(recording){assert.equal(recording.id,id);removed++;},async exists(){return false;}},options),true);
    assert.equal(removed,1);assert.equal((await pgGet(pool,session,options)).jobs.complete,1);
    await assert.rejects(db.query('DELETE FROM recording_purges'),/immutable/);
    assert.equal(await pgPurge(pool,{async remove(){throw new Error('Must not repeat');}},options),false);
  }finally{await db.close();}
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} purge completion requires absence, a live lease and atomic audit`,async()=>{
  const db=postgres?new PGlite():fixture();
  const pool=postgres?{async connect(){return {async query(sql,values){return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}}:null;
  const purge=store=>postgres?pgPurge(pool,store):processOneAudioPurge(db,store);
  const exec=async sql=>postgres?db.exec(sql):db.exec(sql);
  const row=async()=>postgres?(await db.query('SELECT * FROM recording_purges')).rows[0]:db.prepare('SELECT * FROM recording_purges').get();
  const auditCount=async()=>postgres?(await db.query("SELECT count(*)::int AS count FROM audit WHERE action='recording.audio.purged'")).rows[0].count:db.prepare("SELECT count(*) AS count FROM audit WHERE action='recording.audio.purged'").get().count;
  const due=()=>exec(postgres?"UPDATE recording_purges SET retry_at=clock_timestamp()-interval '1 second'":"UPDATE recording_purges SET retry_at='2000-01-01T00:00:00.000Z'");
  try{
    if(postgres){
      await runMigrations(pool);
      await exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic','UTC');
        INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic','owner');
        INSERT INTO workers(id,org_id,site_id,code,language) VALUES('worker','cedar','beirut','Worker','en');
        INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('briefing','cedar','beirut','Title','Source','ready');
        INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('publication','cedar','beirut','briefing',1,'{}','published');
        INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','cedar','beirut','publication','worker','en');`);
      await pgSave(pool,session,{requestId:randomUUID(),revision:0,audioDays:7,confirmed:true});
      await db.query(`INSERT INTO recordings(id,org_id,site_id,assignment_id,submission_id,sha256,duration_seconds,bytes,status,received_at)
        VALUES($1,'cedar','beirut','assignment',$2,$3,1,100,'received',clock_timestamp()-interval '10 days')`,[randomUUID(),randomUUID(),'a'.repeat(64)]);
    }else{
      saveRetention(db,session,{requestId:randomUUID(),revision:0,audioDays:7,confirmed:true});
      recording(db,{age:10,status:'received'});
    }
    for(const store of [
      {async remove(){}},
      {async remove(){},async exists(){return true;}},
      {async remove(){},async exists(){return undefined;}},
      {async remove(){},async exists(){throw Error('Unverified storage response');}},
    ]){
      assert.equal(await purge(store),true);
      assert.equal((await row()).status,'queued');assert.equal((await row()).completed_at,null);
      assert.equal(await auditCount(),0);
      assert.equal(await purge(store),false);
      await due();
    }
    const absent={async remove(){},async exists(){return false;}};
    await purge({...absent,async exists(){
      await exec(postgres?"UPDATE recording_purges SET lease_until=clock_timestamp()-interval '1 second'":"UPDATE recording_purges SET lease_until='2000-01-01T00:00:00.000Z'");
      return false;
    }});
    assert.equal((await row()).status,'processing');assert.equal((await row()).completed_at,null);assert.equal(await auditCount(),0);
    await purge({...absent,async exists(){await exec("UPDATE recording_purges SET lease_token='another-owner'");return false;}});
    assert.equal((await row()).lease_token,'another-owner');assert.equal((await row()).status,'processing');assert.equal(await auditCount(),0);
    await exec(postgres?"UPDATE recording_purges SET lease_until=clock_timestamp()-interval '1 second'":"UPDATE recording_purges SET lease_until='2000-01-01T00:00:00.000Z'");
    await exec(postgres?`CREATE FUNCTION fail_purge_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected audit failure'; END$$;
      CREATE TRIGGER fail_purge_audit BEFORE INSERT ON audit FOR EACH ROW WHEN (NEW.action='recording.audio.purged') EXECUTE FUNCTION fail_purge_audit();`
      :"CREATE TRIGGER fail_purge_audit BEFORE INSERT ON audit WHEN NEW.action='recording.audio.purged' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;");
    await purge(absent);
    assert.equal((await row()).status,'queued');assert.equal((await row()).completed_at,null);assert.equal(await auditCount(),0);
    await exec(postgres?'DROP TRIGGER fail_purge_audit ON audit':'DROP TRIGGER fail_purge_audit');await due();
    assert.equal(await purge(absent),true);assert.equal((await row()).status,'complete');assert.equal(await auditCount(),1);
    assert.equal(await purge(absent),false);assert.equal(await auditCount(),1);
  }finally{if(postgres)await db.close();else db.close();}
});
