import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {ensurePeopleSchema} from '../server/people.mjs';
import {ensureRecordingSchema} from '../server/recordings.mjs';
import {publish,syntheticPrepare,CANONICAL_SOURCE} from '../server/domain.mjs';
import {reportActivity} from '../server/reports.mjs';
import {reportScope,selectReport} from '../server/report-scope.mjs';
import * as exports from '../server/exports.mjs';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {publish as publishPg} from '../server/postgres/domain.mjs';
import {readPublicationReport} from '../server/postgres/reports.mjs';
import * as pgExports from '../server/postgres/exports.mjs';

async function fixture(pg) {
  const schema='report_scopes',owner={principal_type:'staff',principal_id:pg?'owner':'maya',org_id:pg?'org':'cedar',site_id:pg?'site':'beirut',role:'owner'};
  const db=pg?new PGlite():openDatabase(':memory:');
  const pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release(){}};}};
  const query=async(sql,args=[])=>{if(pg){let n=0;return (await db.query(sql.replaceAll('?',()=>`$${++n}`),args)).rows;}
    return db.prepare(sql).all(...args);};
  if(pg){await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog;SET timezone='UTC'`);await runMigrations(pool,{schema});
    await db.exec("INSERT INTO organizations VALUES('org','Org');INSERT INTO sites VALUES('site','org','Site','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','org','site','Owner','owner');INSERT INTO workers(id,org_id,site_id,code,language) VALUES('w1','org','site','One','en'),('w2','org','site','Two','ar'),('w3','org','site','Three','ur');");
    await query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('brief','org','site','Report fixture',?,'ready',?)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
  }else{seed(db);ensurePeopleSchema(db);ensureRecordingSchema(db);await query("UPDATE briefings SET state='ready',prepared_json=? WHERE id='shelf'",[JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);}
  const workers=pg?['w1','w2','w3']:['worker-1','worker-2','worker-3'];
  await query(`INSERT INTO crews(id,org_id,site_id,name,active) VALUES('first',?,?,?,${pg?'true':'1'}),('second',?,?,?,${pg?'true':'1'})`,[owner.org_id,owner.site_id,'First crew',owner.org_id,owner.site_id,'Second crew']);
  for(const id of workers)await query('DELETE FROM crew_memberships WHERE worker_id=?',[id]);
  for(const [n,id] of workers.slice(0,2).entries())await query('INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id,joined_at) VALUES(?,?,?,?,?)',[id,owner.org_id,owner.site_id,n===0?'first':'second',new Date().toISOString()]);
  const draft=(await query('SELECT id,revision,next_version FROM briefings WHERE id=?',[pg?'brief':'shelf']))[0];
  const body={requestId:randomUUID(),revision:draft.revision,nextVersion:draft.next_version,workerIds:workers};
  const publication=pg?await publishPg(pool,owner,draft.id,body,{schema,integrationMode:'synthetic'}):publish(db,owner,draft.id,body);
  const assignments=await query('SELECT id,worker_id FROM assignments WHERE publication_id=?',[publication.id]);
  const read=async filters=>pg?readPublicationReport(pool,owner,{schema,publicationId:publication.id,filters}):reportActivity(db,owner,publication,filters);
  const request=async body=>pg?pgExports.requestExport(pool,owner,body,{schema}):exports.requestExport(db,owner,body);
  const receive=async(index,time)=>{const id=randomUUID(),submission=randomUUID(),assignment=assignments.find(row=>row.worker_id===workers[index]).id;
    if(pg)await query("INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,received_at,assessment_status) VALUES(?,?,?,?,?,'PRIVATE ANSWER','matched','[]',?,'complete')",[id,owner.org_id,owner.site_id,assignment,submission,time]);
    else await query("INSERT INTO attempts(id,org_id,assignment_id,submission_id,answer_text,outcome,reasons_json,received_at) VALUES(?,?,?,?,'PRIVATE ANSWER','matched','[]',?)",[id,owner.org_id,assignment,submission,time]);
    await query("INSERT INTO submission_receipts(org_id,assignment_id,submission_id,kind,received_at) VALUES(?,?,?,'typed',?)",[owner.org_id,assignment,submission,time]);};
  return {db,pool,schema,owner,workers,publication,assignments,query,read,request,receive,close:()=>db.close()};
}

for(const pg of [false,true]){
  test(`${pg?'PostgreSQL':'SQLite'} publication crew snapshot survives later moves/rename/archive; legacy history never invents membership`,async()=>{
    const f=await fixture(pg);try{
      const first=await f.read({crewId:'first'});assert.equal(first.metrics.assigned,1);assert.equal(first.crewSnapshotAvailable,true);assert.equal(first.availableCrews[0].name,'First crew');
      await f.query("UPDATE crew_memberships SET crew_id='second' WHERE worker_id=?",[f.workers[0]]);
      await f.query(`UPDATE crews SET name='Renamed',active=${pg?'false':'0'} WHERE id='first'`);
      const later=await f.read({crewId:'first'});assert.deepEqual(later.metrics,first.metrics);assert.deepEqual(later.availableCrews,first.availableCrews);
      assert.equal((await f.read({crewId:'@unassigned'})).metrics.assigned,1);
      await assert.rejects(f.read({crewId:'foreign'}),/unavailable/);
      await assert.rejects(f.query("UPDATE publication_report_audience SET crew_name='Changed'"),/immutable/);
      await assert.rejects(f.query('DELETE FROM publication_report_audience'),/immutable/);
      const rows=[{assignment_id:'legacy',code:'Only',language:'en'}];
      assert.equal(selectReport(rows,1,reportScope(),'UTC',[]).crewSnapshotAvailable,false);
      assert.throws(()=>selectReport(rows,1,reportScope({crewId:'first'}),'UTC',[]),/snapshot unavailable/);
    }finally{await f.close();}
  });
  test(`${pg?'PostgreSQL':'SQLite'} response civil-day window keeps frozen assigned denominator and latest receipt, not a convenient earlier answer`,async()=>{
    const f=await fixture(pg);try{
      await f.receive(0,'2026-03-28T22:00:00.000Z');await f.receive(1,'2026-03-29T20:59:59.000Z');
      const scope={responseFrom:'2026-03-29',responseThrough:'2026-03-29'},report=await f.read(scope);
      assert.equal(report.metrics.assigned,3);assert.equal(report.metrics.responses,2);assert.equal(report.metrics.completion,67);assert.equal(report.rows.length,2);
      assert.equal(report.languages.reduce((n,row)=>n+row.assigned,0),3);
      await f.receive(0,'2026-03-29T21:00:00.000Z');const later=await f.read(scope);
      assert.equal(later.metrics.assigned,3);assert.equal(later.metrics.responses,1);assert.equal(later.metrics.completion,33);
      assert.equal((await f.read({crewId:'first',...scope})).metrics.responses,0);
      assert.doesNotMatch(JSON.stringify(later),/PRIVATE ANSWER|rubric|reasons_json|password/);
    }finally{await f.close();}
  });
  test(`${pg?'PostgreSQL':'SQLite'} filtered export snapshots rows/timezone and exact filters; later answers/site edits cannot change retry/download`,async()=>{
    const f=await fixture(pg);try{
      await f.receive(0,'2026-10-24T22:00:00.000Z');
      const filters={crewId:'first',responseFrom:'2026-10-25',responseThrough:'2026-10-25'},body={requestId:randomUUID(),publicationId:f.publication.id,filters};
      const result=await f.request(body);assert.equal(result.filters.timezone,'Asia/Beirut');assert.equal((await f.request(body)).duplicate,true);
      await assert.rejects(f.request({...body,filters:{...filters,crewId:''}}),/conflict/);
      await assert.rejects(f.query("UPDATE report_exports SET filters_json='{}' WHERE id=?",[body.requestId]),/immutable/);
      const before=(await f.query('SELECT snapshot_json FROM report_exports WHERE id=?',[body.requestId]))[0].snapshot_json;
      await f.receive(0,'2026-10-25T22:00:00.000Z');await f.query("UPDATE sites SET timezone='UTC' WHERE id=?",[f.owner.site_id]);
      if(pg)await pgExports.processOneExport(f.pool,{schema:f.schema});else exports.processOneExport(f.db);
      const file=pg?await pgExports.downloadExport(f.pool,f.owner,body.requestId,{schema:f.schema}):exports.downloadExport(f.db,f.owner,body.requestId);
      assert.equal(file.csv.split('\r\n').filter(Boolean).length,2);assert.match(file.csv,/2026-10-24T22:00:00/);
      assert.deepEqual((await f.query('SELECT snapshot_json FROM report_exports WHERE id=?',[body.requestId]))[0].snapshot_json,before);
      assert.equal((await f.request(body)).filters.timezone,'Asia/Beirut');
    }finally{await f.close();}
  });
}

test('report scope admits only bounded crew identity and real ordered civil dates',()=>{
  for(const input of [null,[],{orgId:'other'},{crewId:[]},{crewId:'x'.repeat(101)},{crewId:'a/b'},{responseFrom:'2026-02-29'},{responseFrom:'2026-10-03',responseThrough:'2026-10-02'}])assert.throws(()=>reportScope(input),/Invalid/);
  assert.deepEqual(reportScope({responseFrom:'2028-02-29'}),{crewId:'',responseFrom:'2028-02-29',responseThrough:''});
});
