import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export function reportArguments(args,{runtime=false}={}) {
  const primary=runtime ? args[0] : args[0] ?? 'contract',remaining=args.slice(1);
  if(typeof primary!=='string' || !primary || (!runtime && !['contract','local'].includes(primary))
    || (remaining.length!==0 && (remaining.length!==2 || remaining[0]!=='--output' || typeof remaining[1]!=='string'
      || !remaining[1] || remaining[1].length>1000 || remaining[1].includes('\0'))))throw Error('Invalid evaluation arguments');
  return {primary,output:remaining[1]};
}

export async function emitEvaluationReport(report,output) {
  const json=JSON.stringify(report,null,2)+'\n';
  if(output===undefined){console.log(json.trimEnd());return;}
  const file=await open(output,'wx',0o600);
  try {await file.writeFile(json,'utf8');await file.sync();}finally{await file.close();}
  console.log(JSON.stringify({schemaVersion:report.schemaVersion,datasetVersion:report.datasetVersion,datasetHash:report.datasetHash,
    reportSha256:createHash('sha256').update(json).digest('hex'),mode:report.mode,metrics:report.metrics,semanticMetrics:report.semanticMetrics,contractChecks:report.contractChecks,
    pilotAcceptance:report.pilotAcceptance,
    ...(Array.isArray(report.checks) ? {workflowChecks:{total:report.checks.length,passed:report.checks.filter(check=>check.status==='passed').length},
      providerCounts:{externalRequests:report.providerEvidence.externalRequests,scriptedRequests:report.providerEvidence.scriptedRequests,
        acceptedRequests:report.providerEvidence.acceptedRequests,reservedRequests:report.providerEvidence.reservedRequests,operations:report.providerEvidence.operations},
      evidenceLimits:report.evidenceLimits} : {})},null,2));
}
