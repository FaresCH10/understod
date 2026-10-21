import {useEffect,useMemo,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {checkedArtifactScope} from './artifact-request';
import {useArtifactRead} from './useArtifactRead';
import {useArtifactMutation} from './useArtifactMutation';
import type {ArtifactDefinition} from './useArtifactRequest';
import type {StaffRequestAuthority} from './useStaffRequest';
import {readPendingProcessingRetry,savePendingProcessingRetry,clearPendingProcessingRetry,checkedProcessingRetryContext,checkedProcessingRetryResult,checkedProcessingRetryReceipt,type PendingProcessingRetry,type ProcessingRetryContext} from './processing-retry-recovery';
export function ProcessingRetry({authority,jobId,publicationId,assignmentId,refresh,disabled,onChanged,onActiveChange}:{authority:StaffRequestAuthority;jobId:string;publicationId:string;assignmentId:string;refresh:number;disabled:boolean;onChanged:()=>void;onActiveChange:(value:boolean)=>void}){
  const scope=authority.session.staffScope;
  const [recovery]=useState(()=>{try{return {pending:readPendingProcessingRetry(sessionStorage,checkedArtifactScope(scope,authority.session),jobId),error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}});
  const definition=useMemo<ArtifactDefinition<PendingProcessingRetry,ReturnType<typeof checkedProcessingRetryResult>>>(()=>({endpoint:`/api/processing/${encodeURIComponent(jobId)}/retries`,path:()=>'',receiptPath:value=>`/${encodeURIComponent(value.requestId)}`,result:checkedProcessingRetryResult,receipt:checkedProcessingRetryReceipt,clear:clearPendingProcessingRetry}),[jobId]);
  const [tick,setTick]=useState(0),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState('');
  const operation=useArtifactMutation(authority,scope,definition,savePendingProcessingRetry,!disabled,()=>{setConfirmed(false);setMessage('Retry accepted. The receipt confirms queueing only.');setTick(value=>value+1);onChanged();},recovery.pending);
  const read=useArtifactRead<unknown>(authority,definition.endpoint,refresh+tick,!!recovery.error || operation.uncertain);
  useEffect(()=>{onActiveChange(operation.busy || operation.uncertain || !!recovery.error);return()=>onActiveChange(false);},[operation.busy,operation.uncertain,recovery.error,onActiveChange]);
  useEffect(()=>{if(!recovery.pending)return;const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void operation.check(controller.signal);});return()=>controller.abort();},[operation.api]);
  let context:ProcessingRetryContext|null=null,error=read.error;
  if(read.data && !operation.uncertain)try{context=checkedProcessingRetryContext(read.data,jobId,publicationId,assignmentId);}catch(reason){error=(reason as Error).message;}
  if(recovery.error)return <p role="alert">{recovery.error}</p>;
  async function submit(){if(!confirmed || disabled || read.loading || !context?.available || !operation.api.current())return;setMessage('');await operation.write({requestId:crypto.randomUUID(),body:{jobId,publicationId,assignmentId,generation:context.generation,confirmed:true}});}
  return <div className="processing-retry">
    {message && <p role="status">{message}</p>}{operation.error && <p role="alert">{operation.error}</p>}
    {operation.uncertain?<><p role="status">{operation.busy?'Checking saved retry...':operation.checked?'No acceptance receipt was found.':'Retry acceptance is not confirmed.'}</p><div className="actions">
      <button className="button outline" disabled={operation.busy || disabled} onClick={()=>void operation.check()}><RefreshCw size={18}/>Check saved retry</button>
      {operation.checked && operation.pending.current && <button className="button primary" disabled={operation.busy || disabled} onClick={()=>void operation.write(operation.pending.current!)}><RefreshCw size={18}/>Retry original request</button>}
    </div></>:<>{error && <p role="alert">{error}</p>}{context?.available && <><p>The accepted response and published version stay unchanged. Queueing does not enable a provider or bypass a processing pause.</p>
      <label className="consent"><input type="checkbox" checked={confirmed} disabled={disabled || operation.busy || read.loading} onChange={event=>setConfirmed(event.target.checked)}/>Queue another attempt for this accepted response</label>
      <div className="actions"><button className="button primary" disabled={!confirmed || disabled || operation.busy || read.loading} onClick={()=>void submit()}><RefreshCw size={18}/>Retry response processing</button></div></>}
      {error && <button className="icon-button" title="Refresh retry state" aria-label="Refresh retry state" disabled={disabled || operation.busy || read.loading} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button>}
    </>}
  </div>;
}
