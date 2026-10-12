import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {bundleHash} from '../server/ai/prepared-bundle.mjs';
import {assessmentInputHash} from '../server/ai/assessment-config.mjs';
import {evaluationDataset,sampleInput,evaluateDataset,evaluationMetrics,evaluationProvenance} from '../evaluation/runner.mjs';
import {createContractEvaluator,evaluateLocal,observedEvaluator,GEMINI_PROVENANCE,LOCAL_PROVENANCE} from '../evaluation/evaluators.mjs';
import {reportArguments,emitEvaluationReport} from '../evaluation/report-output.mjs';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const data=JSON.parse(readFileSync(new URL('../evaluation/assessment-v1.json',import.meta.url),'utf8'));
const run=(evaluate,mode='mocked-gemini-contract')=>evaluateDataset(data,{mode,provenance:mode==='synthetic-local' ? LOCAL_PROVENANCE : GEMINI_PROVENANCE,
  evaluate,now:()=> '2026-10-10T18:00:00.000Z'});

test('versioned evaluation dataset is bounded, frozen and covers exact question/rubric changes',()=>{
  const dataset=evaluationDataset(data);assert.equal(dataset.samples.length,43);assert.ok(Object.isFrozen(dataset.samples[0]));
  assert.deepEqual(dataset.pilotTolerances,{status:'awaiting_agreement'});
  for(const edit of [d=>{d.dataClass='real';},d=>{d.pilotTolerances.status='passed';},d=>{d.samples[1].id=d.samples[0].id;},
    d=>{d.publications[1].id=d.publications[0].id;},d=>{d.samples[0].expected='safe';},d=>{d.samples[0].publicationId='unknown';},
    d=>{d.samples[0].answer='a'.repeat(2001);},d=>{d.samples[0].language='fr';},d=>{d.samples[0].hidden='secret';},
    d=>{d.publications[0].askedFacts=[];},d=>{d.publications[0].languages=['en','en'];}]) {
    const invalid=structuredClone(data);edit(invalid);assert.throws(()=>evaluationDataset(invalid),/Invalid/);
  }
  const a=sampleInput(dataset,dataset.samples.find(s=>s.id==='en-standard'));
  for(const patch of [{question:'Other question'},{askedFacts:['Other rubric']},{publicationId:'other'},{version:4},{language:'ar'},{answer:'Other answer'}])
    assert.notEqual(assessmentInputHash(a),assessmentInputHash({...a,...patch}));
  const changed=structuredClone(data);changed.publications[0].question='Changed question';assert.notEqual(bundleHash(changed),bundleHash(data));
  assert.throws(()=>evaluationDataset(changed),/version\/content hash/);
  for(const patch of [{dataClass:'real'},{model:'private key with spaces'},{extra:'hidden'}])assert.throws(()=>evaluationProvenance({...GEMINI_PROVENANCE,...patch}),/Invalid/);
});

test('false matches, false clarifications, false unassessable and unresolved delivery use separate denominators',()=>{
  const metrics=evaluationMetrics([
    {expected:'clarification',actual:'matched',status:'completed'},
    {expected:'unassessable',actual:'unassessable',status:'completed'},
    {expected:'matched',actual:'clarification',status:'completed'},
    {expected:'matched',actual:'unassessable',status:'completed'},
    {expected:'matched',actual:'matched',status:'completed'},
    {expected:'matched',actual:null,status:'failed'},
    {expected:'matched',actual:null,status:'not_run'},
  ]);
  assert.deepEqual(metrics.falseMatches,{count:1,denominator:2,rate:.5});
  assert.deepEqual(metrics.falseClarifications,{count:1,denominator:3,rate:1/3});
  assert.deepEqual(metrics.falseUnassessable,{count:1,denominator:3,rate:1/3});
  assert.equal(metrics.unresolvedExpectedMatches,1);assert.equal(metrics.failed,1);assert.equal(metrics.notRun,1);
  assert.equal(metrics.confusion.matched.unresolved,1);assert.equal(metrics.confusion.matched.not_run,1);
  assert.equal(evaluationMetrics([]).falseMatches.rate,null);
});

test('mocked protocol evaluation preserves fault failures rather than laundering them as successful assessments',async()=>{
  let requests=0;const before=globalThis.fetch;globalThis.fetch=()=>assert.fail('Live network prohibited');
  let report;
  try {report=await run(createContractEvaluator({onRequest:()=>requests++}));}finally {globalThis.fetch=before;}
  assert.equal(requests,42);assert.deepEqual(report.contractChecks,{total:43,passed:43,failed:0});
  assert.equal(report.mode,'mocked-gemini-contract');assert.equal(report.metrics.completed,37);assert.equal(report.metrics.failed,6);
  assert.equal(report.metrics.falseUnassessable.count,3);assert.equal(report.metrics.unresolvedExpectedMatches,6);
  assert.equal(report.pilotAcceptance.status,'not_evaluated');assert.equal(report.evidenceLimits.semanticAccuracyClaim,false);
  assert.equal(report.semanticMetrics.total,34);assert.equal(report.semanticMetrics.outcomeDisagreements,0);assert.equal(report.faultMetrics.total,9);
  for(const id of ['fault-json','fault-empty','fault-refusal','fault-http','fault-timeout','fault-reasons']) {
    const row=report.results.find(item=>item.id===id);assert.equal(row.actual,null);assert.equal(row.status,'failed');assert.equal(row.contractPassed,true);
  }
  for(const id of ['fault-missing-evidence','fault-invented-quote','fault-fact-index'])assert.equal(report.results.find(row=>row.id===id).actual,'unassessable');
  const text=JSON.stringify(report);assert.doesNotMatch(text,/synthetic-evaluation-mock-only|Finished blue; unfinished yellow|Invented quote never spoken/);
  assert.equal(report.results[0].inputHash,assessmentInputHash(sampleInput(evaluationDataset(data),data.samples[0])));
  assert.ok(Object.isFrozen(report.results));assert.equal(report.byModel[GEMINI_PROVENANCE.model].total,43);
});

test('actual local synthetic evaluator retains the legacy 19-case regression and exposes new limitations',async()=>{
  const report=await run(evaluateLocal,'synthetic-local');
  const legacy=JSON.parse(readFileSync(new URL('../evaluation/synthetic-cases.json',import.meta.url),'utf8'));
  for(const item of legacy)assert.equal(report.results.find(row=>row.id===item.id).actual,item.expected,item.id);
  assert.equal(report.metrics.completed,24);assert.equal(report.metrics.notRun,19);assert.equal(report.metrics.falseUnassessable.count,3);
  for(const id of ['ar-paraphrase','ar-dialect','ur-paraphrase'])assert.equal(report.results.find(row=>row.id===id).actual,'unassessable');
  for(const id of ['en-noise','fr-unsupported'])assert.equal(report.results.find(row=>row.id===id).actual,'clarification');
  assert.equal(report.results.find(row=>row.id==='v4-new-arrangement').status,'not_run');
  assert.equal(report.pilotAcceptance.status,'not_evaluated');
});

test('observed evaluations deny wrong fingerprints, do not invent missing outcomes and validate exact evidence',async()=>{
  const input=sampleInput(evaluationDataset(data),data.samples[0]);
  const record={id:'en-standard',inputHash:assessmentInputHash(input),status:'completed',provenance:GEMINI_PROVENANCE,
    assessment:{outcome:'matched',reasons:['asked_facts_present'],evidence:input.askedFacts.map((_,factIndex)=>({factIndex,quote:input.answer}))}};
  const report=await run(observedEvaluator([record]),'observed-runtime');
  assert.equal(report.metrics.completed,1);assert.equal(report.metrics.notRun,42);assert.equal(report.contractChecks.total,0);
  assert.equal(report.semanticMetrics.notRun,33);
  assert.equal(report.results[0].provenance.model,GEMINI_PROVENANCE.model);
  await assert.rejects(run(observedEvaluator([{...record,inputHash:'f'.repeat(64)}]),'observed-runtime'),/exact evaluation input/);
  assert.throws(()=>observedEvaluator([record,record]),/Invalid/);
  await assert.rejects(run(observedEvaluator([{...record,assessment:{...record.assessment,evidence:[{factIndex:0,quote:'Never spoken'}]}}]),'observed-runtime'),/evidence invalid/);
  for(const status of ['pending','failed','blocked']) {
    const r=await run(observedEvaluator([{...record,status}]),'observed-runtime');
    assert.equal(r.results[0].actual,null);assert.equal(r.results[0].diagnostic,`runtime_${status}`);
  }
  const r=await run(observedEvaluator([{...record,assessment:{...record.assessment,reasons:['private_token_value']}}]),'observed-runtime');
  assert.deepEqual(r.results[0].reasonCodes,['unrecognized_reason']);assert.doesNotMatch(JSON.stringify(r),/private_token_value/);
});

test('generated evaluation reports cannot replace an existing checkpoint or accept ambiguous arguments',async()=>{
  assert.deepEqual(reportArguments([]),{primary:'contract',output:undefined});
  assert.deepEqual(reportArguments(['bindings.json','--output','report.json'],{runtime:true}),{primary:'bindings.json',output:'report.json'});
  for(const args of [['live'],['contract','report.json'],['contract','--output'],['contract','--output','a','--other']])assert.throws(()=>reportArguments(args),/Invalid/);
  const root=await mkdtemp(join(tmpdir(),'understood-evaluation-')),path=join(root,'report.json');
  const original=console.log;console.log=()=>{};
  try {
    const report=await run(createContractEvaluator());await emitEvaluationReport(report,path);
    const before=await readFile(path,'utf8');assert.deepEqual(JSON.parse(before),report);
    await assert.rejects(emitEvaluationReport({...report,datasetVersion:'changed'},path),error=>error.code==='EEXIST');
    assert.equal(await readFile(path,'utf8'),before);
  }finally {console.log=original;await unlink(path);await rmdir(root);}
});

test('evaluation CLI contract status is not confused with local semantic limitations or authorized live dispatch',()=>{
  for(const mode of ['contract','local']) {
    const result=spawnSync(process.execPath,['scripts/evaluate-synthetic.mjs',mode],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:20000});
    assert.equal(result.status,mode==='contract' ? 0 : 1,result.stderr);const report=JSON.parse(result.stdout);
    assert.equal(report.datasetVersion,data.version);assert.equal(report.pilotAcceptance.status,'not_evaluated');
  }
  const bad=spawnSync(process.execPath,['scripts/evaluate-synthetic.mjs','live'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(bad.status,2);assert.match(bad.stderr,/never dispatches/);
  const runtime=spawnSync(process.execPath,['scripts/evaluate-runtime.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',
    env:{PATH:process.env.PATH,UNDERSTOOD_TIER:'production',GEMINI_API_KEY:'secret-not-printed'}});
  assert.equal(runtime.status,2);assert.doesNotMatch(runtime.stderr,/secret-not-printed/);
});
