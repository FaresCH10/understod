import {readFileSync} from 'node:fs';
import {createPostgresPool} from '../server/postgres/db.mjs';
import {verifyMigrations} from '../server/postgres/migrate.mjs';
import {readEvaluationObservations,UNKNOWN_EVALUATION_PROVENANCE} from '../server/postgres/evaluation-observations.mjs';
import {evaluateDataset} from '../evaluation/runner.mjs';
import {observedEvaluator} from '../evaluation/evaluators.mjs';
import {reportArguments,emitEvaluationReport} from '../evaluation/report-output.mjs';

async function main() {
  const env=process.env,{primary:bindingsPath,output}=reportArguments(process.argv.slice(2),{runtime:true}),schema=env.UNDERSTOOD_POSTGRES_SCHEMA;
  if(env.UNDERSTOOD_TIER!=='local' || env.UNDERSTOOD_DATA_CLASS!=='synthetic'
    || env.UNDERSTOOD_EVALUATION_SYNTHETIC!=='true' || !/^understood_test_[a-z0-9_]{1,47}$/.test(schema || ''))
    throw Error('Isolated synthetic evaluation configuration required');
  const dataset=JSON.parse(readFileSync(new URL('../evaluation/assessment-v1.json',import.meta.url),'utf8'));
  const raw=readFileSync(bindingsPath,'utf8');if(raw.length>200000)throw Error('Evaluation bindings too large');
  const bindings=JSON.parse(raw),pool=await createPostgresPool();
  try {
    await verifyMigrations(pool,{schema});
    const observations=await readEvaluationObservations(pool,dataset,{orgId:env.UNDERSTOOD_REHEARSAL_ORG_ID,siteId:env.UNDERSTOOD_REHEARSAL_SITE_ID,
      bindings,confirmedSynthetic:true},{schema});
    const report=await evaluateDataset(dataset,{mode:'observed-runtime',provenance:UNKNOWN_EVALUATION_PROVENANCE,evaluate:observedEvaluator(observations)});
    await emitEvaluationReport(report,output);
    if(report.semanticMetrics.failed || report.semanticMetrics.outcomeDisagreements || report.semanticMetrics.notRun)process.exitCode=1;
  }finally {await pool.end();}
}
main().catch(()=>{console.error('Runtime evaluation unavailable: check isolated synthetic scope, exact fixtures, bindings and immutable assessment evidence. No provider request or database write was performed.');process.exitCode=2;});
