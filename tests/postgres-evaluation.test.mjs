import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {submitAnswer} from '../server/postgres/domain.mjs';
import {rehearsalTasks,syntheticAssessmentAdapter} from '../server/postgres/runtime.mjs';
import {readEvaluationObservations,evaluationBindings,UNKNOWN_EVALUATION_PROVENANCE} from '../server/postgres/evaluation-observations.mjs';
import {resolveAssessmentAdapter,assessmentInputHash} from '../server/ai/assessment-config.mjs';
import {evaluationDataset,sampleInput,evaluateDataset} from '../evaluation/runner.mjs';
import {observedEvaluator,LOCAL_PROVENANCE,GEMINI_PROVENANCE} from '../evaluation/evaluators.mjs';
import {bundleHash} from '../server/ai/prepared-bundle.mjs';

const dataset=evaluationDataset(JSON.parse(readFileSync(new URL('../evaluation/assessment-v1.json',import.meta.url),'utf8')));
const worker={org_id:'a',site_id:'a',principal_type:'worker',principal_id:'w'};
const scope={orgId:'a',siteId:'a',confirmedSynthetic:true};
async function fixture({badSource=false,randomPublicationIds=false}={}) {
  const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length ? db.query(sql,args) : (await db.exec(sql)).at(-1) ?? {rows:[]},release(){}};}};
  await runMigrations(pool);
  await db.exec(`INSERT INTO organizations VALUES('a','Synthetic evaluation A'),('b','Synthetic evaluation B');
    INSERT INTO sites VALUES('a','a','Synthetic','UTC'),('b','b','Synthetic','UTC');
    INSERT INTO workers(id,org_id,site_id,code,language) VALUES('w','a','a','001','en');
    INSERT INTO provider_policies(scope_key,org_id,revision,enabled,max_daily_requests) VALUES('global',NULL,1,true,100),('tenant:a','a',1,true,100);`);
  const publicationIds=new Map();
  for(const publication of dataset.publications) {
    const publicationId=randomPublicationIds ? randomUUID() : publication.id;publicationIds.set(publication.id,publicationId);
    await db.query(`INSERT INTO briefings(id,org_id,site_id,title,source,state) VALUES($1,'a','a','Synthetic evaluation',$2,'draft')`,[publicationId,publication.source]);
    await db.query(`INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES($1,'a','a',$1,$2,$3,'published')`,
      [publicationId,publication.version,JSON.stringify({source:badSource ? 'Unknown private source' : publication.source,question:publication.question,
        rubric:{askedFacts:publication.askedFacts},languages:{en:{question:publication.question}},provenance:{adapter:'synthetic-local-v1'}})]);
  }
  async function submit(sampleId) {
    const sample=dataset.samples.find(item=>item.id===sampleId),assignmentId=randomUUID(),workerId=`worker-${sampleId}`;
    await db.query(`INSERT INTO workers(id,org_id,site_id,code,language) VALUES($1,'a','a',$2,$3)`,[workerId,sampleId,sample.language]);
    await db.query(`INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES($1,'a','a',$2,$3,$4)`,[assignmentId,publicationIds.get(sample.publicationId),workerId,sample.language]);
    const receipt=await submitAnswer(pool,{...worker,principal_id:workerId},assignmentId,randomUUID(),sample.answer);
    return {sample,receipt,binding:{sampleId,attemptId:receipt.id},input:{...sampleInput(dataset,sample),publicationId:publicationIds.get(sample.publicationId)}};
  }
  const fingerprint=async()=>bundleHash((await db.query(`SELECT jsonb_build_object(
    'attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM attempts t),
    'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM assessment_jobs j),
    'operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM provider_operations o),
    'requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM provider_requests r),
    'publications',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM publications p),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM audit a)) AS value`)).rows[0].value);
  return {db,pool,submit,fingerprint,close:()=>db.close()};
}

test('read-only runtime evaluation matches frozen synthetic inputs and actual metered provider provenance',async()=>{
  const f=await fixture({randomPublicationIds:true});let calls=0;
  try {
    const correct=await f.submit('cartons-correct');
    const adapter=resolveAssessmentAdapter({UNDERSTOOD_ASSESSMENT_ADAPTER:'gemini-free',UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',
      UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',GEMINI_API_KEY:'mock-evaluation-key',
      UNDERSTOOD_SYNTHETIC_ASSESSMENT_HASHES:JSON.stringify([assessmentInputHash(correct.input)])},{fetchImpl:async(url,options)=>{
      calls++;const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
      assert.deepEqual(input,{answer:correct.input.answer,question:correct.input.question,askedFacts:correct.input.askedFacts});
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({outcome:'matched',reasons:['asked_facts_present'],
        evidence:[{factIndex:0,quote:'12 cartons at bay 4.'}]})}]}}]});}});
    assert.equal(await rehearsalTasks(f.pool,{}, {schema:'public',assessmentAdapter:adapter}).assessment(),true);
    const pending=await f.submit('v4-stale-arrangement');
    await f.db.exec("UPDATE briefings SET revision=2,source='Later unrelated draft';UPDATE publications SET state='withdrawn'");
    const before=await f.fingerprint();
    const rows=await readEvaluationObservations(f.pool,dataset,{...scope,bindings:[correct.binding,pending.binding]});
    assert.equal(await f.fingerprint(),before);assert.equal(calls,1);assert.equal(rows[0].status,'completed');assert.deepEqual(rows[0].provenance,GEMINI_PROVENANCE);
    assert.equal(rows[1].status,'pending');assert.deepEqual(rows[1].provenance,UNKNOWN_EVALUATION_PROVENANCE);
    const report=await evaluateDataset(dataset,{mode:'observed-runtime',provenance:UNKNOWN_EVALUATION_PROVENANCE,evaluate:observedEvaluator(rows)});
    assert.equal(report.metrics.completed,1);assert.equal(report.metrics.notRun,42);assert.equal(report.metrics.falseMatches.count,0);
    assert.equal(report.results.find(row=>row.id==='cartons-correct').version,1);
    assert.equal(report.results.find(row=>row.id==='cartons-correct').publicationId,correct.input.publicationId);
    assert.equal(report.results.find(row=>row.id==='cartons-correct').datasetPublicationId,'eval-cartons-v1');
    assert.equal(report.pilotAcceptance.status,'not_evaluated');assert.doesNotMatch(JSON.stringify(report),/mock-evaluation-key|Later unrelated draft|12 cartons at bay 4\./);
    for(const patch of [{orgId:'b',siteId:'b'},{siteId:'b'},{orgId:'b'}])await assert.rejects(readEvaluationObservations(f.pool,dataset,{...scope,...patch,bindings:[correct.binding]}),/unavailable/);
    await assert.rejects(readEvaluationObservations(f.pool,dataset,{...scope,bindings:[{...correct.binding,sampleId:'cartons-wrong-count'}]}),/exact synthetic fixture/);
    assert.equal(await f.fingerprint(),before);assert.equal(calls,1);
  }finally{await f.close();}
});

test('runtime reports genuine pending/failed/blocked states without synthetic success or extra dispatch',async()=>{
  const f=await fixture();
  try {
    const pending=await f.submit('en-standard'),failed=await f.submit('en-concise'),blocked=await f.submit('en-paraphrase');
    await f.db.query("UPDATE assessment_jobs SET status='failed',attempts=3 WHERE attempt_id=$1",[failed.receipt.id]);
    await f.db.query("UPDATE assessment_jobs SET status='blocked' WHERE attempt_id=$1",[blocked.receipt.id]);
    const before=await f.fingerprint(),rows=await readEvaluationObservations(f.pool,dataset,{...scope,bindings:[pending.binding,failed.binding,blocked.binding]});
    const report=await evaluateDataset(dataset,{mode:'observed-runtime',provenance:UNKNOWN_EVALUATION_PROVENANCE,evaluate:observedEvaluator(rows)});
    assert.equal(report.metrics.failed,2);assert.equal(report.metrics.completed,0);assert.equal(report.metrics.notRun,41);assert.equal(report.metrics.unassessable,0);
    assert.equal(report.metrics.falseMatches.rate,null);assert.equal(report.metrics.unresolvedExpectedMatches,2);assert.equal(await f.fingerprint(),before);
    assert.equal((await f.db.query('SELECT count(*)::int AS count FROM provider_requests')).rows[0].count,0);
    assert.throws(()=>readEvaluationObservations(f.pool,dataset,{...scope,confirmedSynthetic:false,bindings:[pending.binding]}),/Confirm/);
    for(const bindings of [[pending.binding,pending.binding],[{...pending.binding,sampleId:'fault-json'}],[{...pending.binding,extra:'bad'}],
      [{sampleId:'en-standard',attemptId:pending.receipt.id},{sampleId:'en-concise',attemptId:pending.receipt.id}]])assert.throws(()=>evaluationBindings(bindings,dataset),/Invalid/);
  }finally{await f.close();}
});

test('local runtime observations remain labeled synthetic and cannot include arbitrary source content',async()=>{
  const f=await fixture();
  try {
    const sample=await f.submit('en-standard');
    await rehearsalTasks(f.pool,{}, {schema:'public',assessmentAdapter:syntheticAssessmentAdapter}).assessment();
    const before=await f.fingerprint(),rows=await readEvaluationObservations(f.pool,dataset,{...scope,bindings:[sample.binding]});
    assert.deepEqual(rows[0].provenance,LOCAL_PROVENANCE);assert.equal(rows[0].assessment.outcome,'matched');assert.equal(await f.fingerprint(),before);
  }finally{await f.close();}
  const invalid=await fixture({badSource:true});
  try {
    const sample=await invalid.submit('en-standard'),before=await invalid.fingerprint();
    await assert.rejects(readEvaluationObservations(invalid.pool,dataset,{...scope,bindings:[sample.binding]}),/exact synthetic fixture/);
    assert.equal(await invalid.fingerprint(),before);
  }finally{await invalid.close();}
});
