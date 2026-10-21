import {useRef,useState} from 'react';
import {Activity,ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react';
import {useArtifactRead} from './useArtifactRead';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';
import {checkedProviderHistory,type ProviderHistory} from './processing-provenance';
import type {ProcessingJob} from './processing-state';
import {staffRequestBinding} from './staff-request';
const labels:Record<string,string>={'preparation':'Preparation','source-transcription':'Source transcription','recording-transcription':'Voice transcription','recording-assessment':'Voice answer check','typed-assessment':'Typed answer check'};
const states:Record<string,string>={started:'Unfinished receipt',accepted:'HTTP accepted',rejected:'HTTP rejected',uncertain:'Outcome unknown'};
export function ProcessingProvenance({authority,job,refresh}:{authority:StaffRequestAuthority;job:ProcessingJob;refresh:number}){
  const {current}=useStaffRequest(authority),[page,setPage]=useState(1),[tick,setTick]=useState(0);
  const read=useArtifactRead<unknown>(authority,`/api/processing/${encodeURIComponent(job.id)}/provenance?page=${page}&pageSize=10`,refresh+tick);
  const selection=JSON.stringify([staffRequestBinding(authority.session),job.id,job.kind,job.publication_id,job.publication_version,job.assignment_id,page,10]);
  const verified=useRef<{selection:string;data:ProviderHistory}|null>(null);
  let data:ProviderHistory|null=null,error=read.error;
  if(read.data)try{data=checkedProviderHistory(read.data,job,page);verified.current={selection,data};}catch(reason){error=(reason as Error).message;}
  else if(read.loading && current() && verified.current?.selection===selection)data=verified.current.data;
  if(error || !current()){verified.current=null;data=null;}
  const pages=Math.max(1,Math.ceil((data?.total || 0)/10)),change=(next:number)=>{if(current())setPage(next);};
  return <section className="panel processing-provider-history" aria-label="Provider request history"><div className="people-panel-heading"><h2><Activity size={19}/> Provider request history</h2>
    <button className="icon-button" title="Refresh provider history" aria-label="Refresh provider history" disabled={read.loading} onClick={()=>{if(current())setTick(value=>value+1);}}><RefreshCw size={18}/></button></div>
    {read.loading && data && <p className="muted" role="status">Refreshing provider history...</p>}
    {read.loading && !data?<p role="status">Loading provider history...</p>:error?<p role="alert">{error}</p>:data && <>
      {!data.supported?<p>No provider journal is available on this backend.</p>:!data.items.length?<p>{page>pages?'This page is no longer available.':'No provider operation was recorded for this job.'}</p>:data.items.map(operation=><section key={operation.id} className="processing-provider-operation" aria-label={`${labels[operation.kind]} operation ${operation.id}`}>
        <div className="processing-provider-heading"><h3>{labels[operation.kind]}{operation.stage?` · ${operation.stage.name.replaceAll('_',' ')}`:''}</h3><span className={`status status-${operation.currentRun?'amber':'blue'}`}>{operation.currentRun?'Current claim':'Historical claim'}</span></div>
        <dl className="processing-details"><dt>Operation</dt><dd>{operation.id}</dd><dt>Run</dt><dd>{operation.runId}</dd><dt>Reserved</dt><dd>{operation.reservedRequests} requests · {operation.requests.length} recorded</dd><dt>Model</dt><dd>{operation.model}</dd><dt>Started</dt><dd><time dateTime={operation.startedAt}>{new Date(operation.startedAt).toLocaleString()}</time></dd><dt>Data class</dt><dd>Synthetic</dd>
          {operation.provenance?<><dt>Adapter</dt><dd>{operation.provenance.adapter}</dd><dt>Prompt version</dt><dd>{operation.provenance.promptVersion}</dd><dt>Schema version</dt><dd>{operation.provenance.schemaVersion}</dd></>:<><dt>Input provenance</dt><dd>Not recorded</dd></>}
          {operation.stage && <><dt>Language</dt><dd>{operation.stage.language.toUpperCase()}{operation.stage.track?` · ${operation.stage.track}`:''}</dd></>}
          <dt>Result reference</dt><dd>{operation.resultReference?`${operation.resultReference[0].toUpperCase()}${operation.resultReference.slice(1)} reference recorded`:'No result reference recorded'}</dd>
        </dl>{operation.requests.length?<div className="table-wrap" tabIndex={0} aria-label={`Request receipts for operation ${operation.id}`}><table><thead><tr><th>Request</th><th>Receipt</th><th>HTTP</th><th>Finished</th></tr></thead><tbody>{operation.requests.map(request=><tr key={request.sequence}><td>{request.sequence}{request.cleanup?' · Cleanup':''}</td><td>{states[request.state]}</td><td>{request.httpStatus ?? '-'}</td><td>{request.finishedAt?<time dateTime={request.finishedAt}>{new Date(request.finishedAt).toLocaleString()}</time>:'Not recorded'}</td></tr>)}</tbody></table></div>:<p>No request receipt was recorded for this reservation.</p>}
      </section>)}
      {data.supported && <div className="audit-pagination"><span>Page {page} of {pages} · {data.total} operations</span><div className="actions"><button className="icon-button" title="Previous provider page" aria-label="Previous provider page" disabled={page<=1} onClick={()=>change(page-1)}><ChevronLeft size={18}/></button><button className="icon-button" title="Next provider page" aria-label="Next provider page" disabled={page>=pages} onClick={()=>change(page+1)}><ChevronRight size={18}/></button>{page>pages && <button className="button outline" onClick={()=>change(1)}>First page</button>}</div></div>}
    </>}
    <p className="muted">HTTP acceptance does not prove that content was valid, understood, or safe to act on.</p>
  </section>;
}
