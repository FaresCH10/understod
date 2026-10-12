import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {receiveSourceAudio,getSourceAudioReceipt} from '../server/source-audio.mjs';
import {retrySourceAudio,getSourceRetryReceipt} from '../server/source-audio-retry.mjs';
import {processOneSourceAudio} from '../server/source-audio-worker.mjs';
import {receiveSourceAudio as pgReceive,getSourceAudioReceipt as pgReceipt} from '../server/postgres/source-audio.mjs';
import {retrySourceAudio as pgRetry,getSourceRetryReceipt as pgRetryReceipt} from '../server/postgres/source-audio-retry.mjs';
import {processOneSourceAudio as pgProcess} from '../server/postgres/source-audio-worker.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';

const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const other={...owner,principal_id:'rami',role:'supervisor'};
const wav=Buffer.alloc(32044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);
wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);wav.writeInt16LE(1000,44);
async function fixture(pg) {
  const objects=new Map(),save=async(r,b)=>{if(objects.has(r.id))throw Error('Exists');objects.set(r.id,Buffer.from(b));};
  const read=async r=>{if(!objects.has(r.id))throw Error('Missing');return objects.get(r.id);};
  const storage={save,read,saveOriginal:save,readOriginal:read};
  let fail=false;
  if(!pg){
    const db=openDatabase(':memory:');seed(db);db.prepare("INSERT INTO staff VALUES('rami','cedar','beirut','Rami','supervisor',1)").run();
    return {db,storage,receive:(input)=>receiveSourceAudio(db,owner,input,wav,wav,storage),retry:(s,id,input)=>retrySourceAudio(db,s,id,input),
      receipt:(s,id,retry)=>getSourceRetryReceipt(db,s,id,retry),source:id=>getSourceAudioReceipt(db,owner,id),
      process:adapter=>processOneSourceAudio(db,adapter,storage),query:async(sql,values=[])=>({rows:db.prepare(sql).all(...values)}),
      fail(){db.exec("CREATE TRIGGER retry_audit_fail BEFORE INSERT ON audit WHEN NEW.action='briefing.source_audio_retry_requested' BEGIN SELECT RAISE(ABORT,'Injected'); END");},
      recover(){db.exec('DROP TRIGGER retry_audit_fail');},close:()=>db.close()};
  }
  const db=new PGlite(),options={schema:'understood_test_source_retry'};
  const pool={async connect(){return {async query(sql,values){if(fail && sql.includes('INSERT INTO audit'))throw Error('Injected');return values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)||{rows:[]};},release(){}};}};
  await db.exec(`CREATE SCHEMA ${options.schema};SET search_path TO ${options.schema},pg_catalog`);await runMigrations(pool,options);
  await db.exec("INSERT INTO organizations VALUES('cedar','Cedar Works');INSERT INTO sites VALUES('beirut','cedar','Beirut','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Maya','owner'),('rami','cedar','beirut','Rami','supervisor')");
  return {db,storage,receive:input=>pgReceive(pool,owner,input,wav,wav,storage,options),retry:(s,id,input)=>pgRetry(pool,s,id,input,options),
    receipt:(s,id,retry)=>pgRetryReceipt(pool,s,id,retry,options),source:id=>pgReceipt(pool,owner,id,options),process:adapter=>pgProcess(pool,adapter,storage,options),
    query:(sql,values)=>db.query(sql,values),fail(){fail=true;},recover(){fail=false;},close:()=>db.close()};
}
const sourceInput=()=>({requestId:randomUUID(),title:'Synthetic retry source',originalType:'audio/wav',generationLanguages:['en','ar']});
for(const pg of [false,true]) {
  const name=pg?'PostgreSQL':'SQLite',bind=sql=>pg?sql.replaceAll('?',()=>'$'+(++bind.n)):sql;
  async function execute(f,sql,args=[]){bind.n=0;return f.query(bind(sql),args);}
  test(`${name} source retry queues once, preserves audio intent and does not repeat after transcription`,async()=>{
    const f=await fixture(pg);try {
      const source=sourceInput(),accepted=await f.receive(source);await f.process();
      assert.equal((await f.source(source.requestId)).status,'blocked');
      const input={requestId:randomUUID(),sourceHash:accepted.requestHash,confirmed:true};
      const receipt=await f.retry(owner,source.requestId,input);assert.equal(receipt.sourceHash,accepted.requestHash);assert.ok(Date.parse(receipt.acceptedAt));
      assert.deepEqual(await f.retry(owner,source.requestId,input),receipt);
      assert.deepEqual(await f.receipt(owner,source.requestId,input.requestId),receipt);
      assert.equal((await f.source(source.requestId)).status,'received');
      let calls=0;await f.process({transcribe:async()=>{calls++;return {text:'Synthetic recovered source transcript with both shelves.'};}});
      assert.equal(calls,1);assert.equal((await f.source(source.requestId)).status,'transcribed');
      assert.deepEqual(await f.retry(owner,source.requestId,input),receipt);assert.equal(await f.process(),false);
      assert.equal((await execute(f,"SELECT count(*) AS n FROM audit WHERE action='briefing.source_audio_retry_requested'")).rows[0].n,1);
      const draft=(await execute(f,'SELECT title,source FROM briefings WHERE id=?',[source.requestId])).rows[0];
      assert.equal(draft.title,source.title);assert.match(draft.source,/recovered source/);
      const failed=sourceInput(),failedReceipt=await f.receive(failed);await f.process();
      await execute(f,"UPDATE source_audio_requests SET status='failed',attempts=3 WHERE request_id=?",[failed.requestId]);
      await f.retry(owner,failed.requestId,{...input,requestId:randomUUID(),sourceHash:failedReceipt.requestHash});
      assert.equal((await f.source(failed.requestId)).status,'received');
      assert.equal((await execute(f,'SELECT attempts FROM source_audio_requests WHERE request_id=?',[failed.requestId])).rows[0].attempts,0);
    }finally{await f.close();}
  });
  test(`${name} source retry refuses changed scope, hash, state, authority and cleanup`,async()=>{
    const f=await fixture(pg);try {
      const source=sourceInput(),accepted=await f.receive(source),input={requestId:randomUUID(),sourceHash:accepted.requestHash,confirmed:true};
      await assert.rejects(async()=>f.retry(owner,source.requestId,input),/state changed/);
      await f.process();
      await assert.rejects(async()=>f.retry(other,source.requestId,input),/conflict/);
      await assert.rejects(async()=>f.retry(owner,source.requestId,{...input,sourceHash:'0'.repeat(64)}),/conflict/);
      await assert.rejects(async()=>f.retry(owner,source.requestId,{...input,confirmed:false}),/Invalid/);
      await assert.rejects(async()=>f.retry(owner,source.requestId,{...input,extra:true}),/Invalid/);
      assert.equal((await f.receipt(other,source.requestId,input.requestId)).found,false);
      await execute(f,"INSERT INTO source_audio_purges(request_id,org_id,site_id,reason,status,created_at) VALUES(?,'cedar','beirut','audio_retention','queued',?)",[source.requestId,new Date().toISOString()]);
      await assert.rejects(async()=>f.retry(owner,source.requestId,input),/expired/);
      assert.equal((await execute(f,'SELECT count(*) AS n FROM source_audio_retries')).rows[0].n,0);
      const changed=sourceInput(),changedReceipt=await f.receive(changed);await f.process();
      await execute(f,"INSERT INTO staff_access_revisions(staff_id,org_id,site_id,revision) VALUES('maya','cedar','beirut',2)");
      await assert.rejects(async()=>f.retry(owner,changed.requestId,{...input,sourceHash:changedReceipt.requestHash}),/authority changed/);
    }finally{await f.close();}
  });
  test(`${name} source retry rolls back audit failures and freezes its receipt`,async()=>{
    const f=await fixture(pg);try {
      const source=sourceInput(),accepted=await f.receive(source);await f.process();
      const input={requestId:randomUUID(),sourceHash:accepted.requestHash,confirmed:true};
      f.fail();await assert.rejects(async()=>f.retry(owner,source.requestId,input));f.recover();
      assert.equal((await f.receipt(owner,source.requestId,input.requestId)).found,false);
      assert.equal((await f.source(source.requestId)).status,'blocked');
      await f.retry(owner,source.requestId,input);
      await assert.rejects(()=>execute(f,'UPDATE source_audio_retries SET created_at=? WHERE retry_id=?',[new Date().toISOString(),input.requestId]),/immutable/);
      await assert.rejects(()=>execute(f,'DELETE FROM source_audio_retries WHERE retry_id=?',[input.requestId]),/immutable/);
      await assert.rejects(async()=>f.retry(owner,source.requestId,{...input,requestId:randomUUID()}),/state changed/);
    }finally{await f.close();}
  });
}
