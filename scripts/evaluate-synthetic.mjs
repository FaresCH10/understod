import {readFileSync} from 'node:fs';
import {evaluateDataset} from '../evaluation/runner.mjs';
import {LOCAL_PROVENANCE,GEMINI_PROVENANCE,evaluateLocal,createContractEvaluator} from '../evaluation/evaluators.mjs';
import {reportArguments,emitEvaluationReport} from '../evaluation/report-output.mjs';

try {
  const {primary:mode,output}=reportArguments(process.argv.slice(2));
  const dataset=JSON.parse(readFileSync(new URL('../evaluation/assessment-v1.json',import.meta.url),'utf8'));
  const report=await evaluateDataset(dataset,{mode:mode==='contract' ? 'mocked-gemini-contract' : 'synthetic-local',
    provenance:mode==='contract' ? GEMINI_PROVENANCE : LOCAL_PROVENANCE,evaluate:mode==='contract' ? createContractEvaluator() : evaluateLocal});
  await emitEvaluationReport(report,output);
  if(mode==='contract' ? report.contractChecks.failed>0 : report.semanticMetrics.outcomeDisagreements+report.semanticMetrics.failed+report.semanticMetrics.notRun>0)
    process.exitCode=1;
}catch {
  console.error('Synthetic evaluation unavailable. Use evaluate-synthetic.mjs [contract|local] [--output new-report.json]; existing output files are not replaced. This command never dispatches a live request.');process.exitCode=2;
}
