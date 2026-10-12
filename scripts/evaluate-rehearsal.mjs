import {runPipelineRehearsal} from '../evaluation/rehearsal.mjs';
import {emitEvaluationReport} from '../evaluation/report-output.mjs';

const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--output' || !args[1] || args[1].length>1000 || args[1].includes('\0'))) {
  console.error('Usage: npm run evaluate:rehearsal -- [--output path]');process.exitCode=2;
}else {
  try {await emitEvaluationReport(await runPipelineRehearsal(),args[1]);}
  catch {console.error('Isolated pipeline rehearsal failed; no production-readiness claim. Run its focused tests for diagnostics.');process.exitCode=1;}
}
