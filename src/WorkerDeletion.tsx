import React,{useEffect,useRef,useState} from 'react';
import {CheckCircle2,Clock3,RefreshCw,Trash2,TriangleAlert,X} from 'lucide-react';
import {keepDialogFocus} from './dialog-focus';
import {readDeletionReceipt,verifyDeletionAcceptance,type DeletionReceipt as Receipt} from './deletion-state';

type Props={workerId:string;code:string;refresh?:number;onQueued:(status:Receipt['status'])=>void;onLocked:(locked:boolean)=>void};

export function WorkerDeletion({workerId,code,refresh=0,onQueued,onLocked}:Props){
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),current=useRef(true),requestId=useRef('');
  const readVersion=useRef(0);
  const [receipt,setReceipt]=useState<Receipt|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[confirmed,setConfirmed]=useState(false);
  const [reason,setReason]=useState('worker_request'),[expectedCode,setExpectedCode]=useState(code);
  const [retryReady,setRetryReady]=useState(false);
  const endpoint=`/api/people/workers/${encodeURIComponent(workerId)}/deletion`;
  async function read(){
    const version=++readVersion.current;
    setLoading(true);setError('');
    try{
      const response=await fetch(endpoint,{credentials:'include'}),data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Deletion status unavailable');
      const verified=readDeletionReceipt(data,workerId);
      if(current.current && version===readVersion.current){
        setReceipt(verified);setRetryReady(!verified && !!requestId.current);
        if(verified){dialog.current?.close();setUncertain(false);if(requestId.current){requestId.current='';onQueued(verified.status);}}
      }
    }catch(reason){if(current.current && version===readVersion.current){setRetryReady(false);setError((reason as Error).message);}}
    finally{if(current.current && version===readVersion.current)setLoading(false);}
  }
  useEffect(()=>{current.current=true;void read();return()=>{current.current=false;readVersion.current++;};},[endpoint,refresh]);
  useEffect(()=>{onLocked(loading || busy || !!error || uncertain || !!receipt);},[loading,busy,error,uncertain,receipt,onLocked]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(inFlight.current || !confirmed || (uncertain && !retryReady))return;
    const submittedId=requestId.current;
    inFlight.current=true;setBusy(true);setError('');
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},
        body:JSON.stringify({requestId:submittedId,expectedCode,reason,confirmed:true})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Deletion request unavailable');
      verifyDeletionAcceptance(data,submittedId);
      if(current.current){dialog.current?.close();setUncertain(true);setRetryReady(false);await read();}
    }catch(reason){
      if(current.current){setError(`Check the request status before taking another action. ${(reason as Error).message}`);setUncertain(true);setRetryReady(false);setConfirmed(false);}
    }finally{inFlight.current=false;if(current.current)setBusy(false);}
  }
  const stages=[['Request accepted',receipt?.createdAt],['Content redacted',receipt?.contentRedactedAt],['Identity pseudonymized',receipt?.identityPseudonymizedAt],['Server cleanup verified',receipt?.completedAt]];
  return <section className="panel worker-deletion" aria-label="Worker data request">
    <div className="people-panel-heading"><h2>Worker data</h2><button type="button" className="icon-button" title="Refresh deletion status" aria-label="Refresh deletion status" disabled={busy || loading} onClick={()=>void read()}><RefreshCw size={18}/></button></div>
    {loading ? <p role="status">Checking deletion status...</p> : receipt ? <>
      <p className={`status ${receipt.status==='complete'?'status-green':'status-amber'}`} role="status">{receipt.status==='complete'?<CheckCircle2 size={17}/>:<Clock3 size={17}/>} {receipt.status==='complete'?'Server cleanup complete':'Deletion queued'}</p>
      <dl className="people-facts">{stages.map(([label,date])=><React.Fragment key={label}><dt>{label}</dt><dd>{date?<time dateTime={date}>{new Date(date).toLocaleString()}</time>:'Pending'}</dd></React.Fragment>)}</dl>
      <p className="muted">Request: <bdi>{receipt.id}</bdi></p>
      <p className="notice notice-blue">Older backups and disconnected devices are not erased. Pseudonymous audit and response records remain.</p>
    </> : <>
      {uncertain && <p className="notice" role="status">{retryReady?'No server receipt was found. The original request can be explicitly retried.':'The request outcome is not yet confirmed. Refresh status before taking another action.'}</p>}
      <button type="button" className="button danger full" disabled={!!error || (uncertain && !retryReady) || loading} onClick={()=>{
        if(!uncertain){requestId.current=crypto.randomUUID();setExpectedCode(code);setReason('worker_request');}
        setConfirmed(false);setError('');dialog.current?.showModal();
      }}><Trash2 size={18}/>{uncertain?'Review original request':'Request worker deletion'}</button>
    </>}
    {error && <p className="record-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby="worker-deletion-title" aria-describedby="worker-deletion-impact" onKeyDown={keepDialogFocus}
      onCancel={event=>{if(inFlight.current)event.preventDefault();}} onClose={()=>setConfirmed(false)}>
      <form onSubmit={event=>void submit(event)}>
        <div className="withdraw-heading"><h2 id="worker-deletion-title">Delete worker data?</h2><button autoFocus type="button" className="icon-button" title="Close deletion dialog" aria-label="Close deletion dialog" disabled={busy} onClick={()=>dialog.current?.close()}><X size={20}/></button></div>
        <p id="worker-deletion-impact" className="crew-impact"><strong><bdi>{expectedCode}</bdi></strong> loses server access immediately. Cleanup removes server audio, redacts responses and replaces the worker label. This cannot be undone.</p>
        <p className="notice"><TriangleAlert size={20}/>Older backups and device caches are not erased. Required pseudonymous history remains.</p>
        <label className="field">Reason<select value={reason} disabled={busy || uncertain} onChange={event=>setReason(event.target.value)}><option value="worker_request">Worker request</option><option value="customer_policy">Organization policy</option></select></label>
        <label className="recipient-row publish-confirm"><input type="checkbox" checked={confirmed} disabled={busy || (uncertain && !retryReady)} onChange={event=>setConfirmed(event.target.checked)}/><span>I am authorized to delete this worker's data and understand the limits.</span></label>
        {error && <p className="record-error" role="alert">{error}</p>}
        {uncertain && <button type="button" className="button outline full" disabled={busy || loading} onClick={()=>void read()}><RefreshCw size={18}/>Check request status</button>}
        <div className="actions"><button type="button" className="button outline" disabled={busy} onClick={()=>dialog.current?.close()}>Cancel</button><button type="submit" className="button danger" disabled={busy || loading || (uncertain && !retryReady) || !confirmed}><Trash2 size={18}/>{busy?'Submitting...':uncertain?'Retry same request':'Confirm deletion'}</button></div>
      </form>
    </dialog>
  </section>;
}
