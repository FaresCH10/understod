import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {encodeWav} from '../src/audio.ts';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {processOnePreparation} from '../server/postgres/preparation.mjs';

const schema='understood_test_progress';
const source='Finished items go on blue. Unfinished items go on yellow.';
const wav=()=>Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(.2)}));

function poolFor(db) {
  const client={async query(sql,values){
    if(values?.length) return db.query(sql,values);
    const rows=await db.exec(sql);return rows.at(-1) || {rows:[]};
  },release(){}};
  return {async connect(){return client;}};
}

test('preparation stage evidence is durable, validated and retained across retries',async()=>{
  const db=new PGlite(),pool=poolFor(db);let fail=true;
  const storage={objects:new Map(),async save(row,bytes){this.objects.set(row.id,Buffer.from(bytes));},async read(row){return this.objects.get(row.id);},async remove(row){this.objects.delete(row.id);}};
  const adapter={provenance:{adapter:'progress-fixture',dataClass:'synthetic',textModel:'fixture',speechModel:'fixture',voice:'fixture',promptVersion:'v1',schemaVersion:'v1'},capabilities:{textLanguages:['en'],speechLanguages:['en']},
    async prepare(){return {title:'Shelves',facts:[source.split('.')[0]+'.',source.split('.')[1].trim()+'.'],question:'Where do items go?',askedFacts:[source.split('.')[0]+'.',source.split('.')[1].trim()+'.']};},
    async checkPreparation(){return {sourceGrounded:true,questionAligned:true,ambiguous:false,factEvidence:[{factIndex:0,quote:'Finished items go on blue.'},{factIndex:1,quote:'Unfinished items go on yellow.'}],askedFactIndexes:[0,1],reasons:[]};},
    async translate(){throw Error('translation should not run');},async checkTranslation(){throw Error('translation check should not run');},
    async speech(){if(fail) throw Error('provider secret');return wav();}};
  try {
    await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
    await db.exec("INSERT INTO organizations(id,name) VALUES('org','Org');INSERT INTO sites(id,org_id,name,timezone) VALUES('site','org','Site','UTC');");
    await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES('brief','org','site','Shelves',$1,'processing')",[source]);
    await db.query("INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at) VALUES('job','org','site','brief',1,'prepare','queued',clock_timestamp())");
    await processOnePreparation(pool,{schema,integrationMode:'synthetic',adapter,storage,languages:['en']});
    const failed=(await db.query("SELECT stage,state,origin,error_code FROM preparation_stage_events ORDER BY occurred_at,step,state")).rows;
    assert.ok(failed.some(row=>row.stage==='speech'&&row.state==='failed'&&row.error_code==='speech_failed'),JSON.stringify(failed));
    assert.ok(failed.some(row=>row.stage==='worker'&&row.state==='failed'));
    assert.equal(JSON.stringify(failed).includes('provider secret'),false);
    const firstRuns=(await db.query("SELECT COUNT(DISTINCT run_id)::int AS count FROM preparation_stage_events")).rows[0].count;assert.equal(firstRuns,1);
    await db.exec("UPDATE briefings SET state='processing' WHERE id='brief';UPDATE jobs SET status='queued',lease_token=NULL,lease_until=NULL,error=NULL WHERE id='job'");
    fail=false;await processOnePreparation(pool,{schema,integrationMode:'synthetic',adapter,storage,languages:['en']});
    const rows=(await db.query("SELECT run_id,stage,state,error_code FROM preparation_stage_events ORDER BY occurred_at,step,state")).rows;
    assert.equal(new Set(rows.map(row=>row.run_id)).size,2);
    assert.ok(rows.some(row=>row.stage==='worker'&&row.state==='completed'));
    assert.ok(rows.some(row=>row.stage==='finalization'&&row.state==='completed'));
    assert.equal((await db.query("SELECT status FROM jobs WHERE id='job'")).rows[0].status,'ready');
    assert.equal((await db.query("SELECT state FROM briefings WHERE id='brief'")).rows[0].state,'ready');
  } finally {await db.close();}
});
