import {CheckCircle2,Clock3,TriangleAlert} from 'lucide-react';
import './provider-stage-tests.css';

export type StageTest={stage:'translation'|'speech';language:'en'|'ar'|'ur';maxRequests:1|2;state:string;createdAt?:string;finishedAt?:string|null;diagnosticCode?:string|null;evidence?:{model:string;checks:string[];requestCount:number;durationSeconds?:number}|null};
const languages={en:'English',ar:'Arabic',ur:'Urdu'};
const diagnostics:Record<string,string>={invalid_output:'Output or request evidence did not pass.',transport_uncertain:'An external response was not confirmed.',authority_changed:'Operator access or dispatch permission changed.',test_interrupted:'The test deadline elapsed.'};
export function ProviderStageTests({tests}:{tests:StageTest[]}) {
  return <div className="provider-stage-tests">{tests.map(test=>{
    const Icon=test.state==='verified'?CheckCircle2:['failed','uncertain','interrupted'].includes(test.state)?TriangleAlert:Clock3;
    return <div className="provider-stage-test" key={`${test.stage}:${test.language}`}>
      <div><strong>{languages[test.language]} {test.stage==='translation'?'translation':'speech'}</strong><small>{test.maxRequests} request {test.maxRequests===1?'slot':'slots'}</small></div>
      <span className="provider-test-state"><Icon size={17}/>{test.state==='verified'?'Technical test passed':test.state.replaceAll('_',' ')}</span>
      <div className="provider-test-evidence">{test.evidence && <><span>{test.evidence.model}</span><span>{test.evidence.checks.map(check=>check.replaceAll('_',' ')).join(' · ')}</span>{test.evidence.durationSeconds!==undefined && <span>{test.evidence.durationSeconds.toFixed(2)} seconds</span>}</>}{test.diagnosticCode && <span>{diagnostics[test.diagnosticCode] || 'Test evidence is unavailable.'}</span>}{test.createdAt && <time dateTime={test.createdAt}>{new Date(test.finishedAt || test.createdAt).toLocaleString()}</time>}</div>
    </div>;
  })}</div>;
}
