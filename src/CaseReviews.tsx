import {useEffect,useRef,useState} from 'react';
import {CalendarClock,MessageSquareWarning,RefreshCw,X} from 'lucide-react';
import {readPendingMessage,retainMessage,clearPendingMessage,type MessageSession,type PendingMessage} from './case-message-recovery';

type Review={id:string;caseId:string;kind:'deadline'|'disagree';dueAt:string|null;expectedDueAt:string|null;reason:string|null;attemptId:string|null;createdAt:string};
export function CaseReviews({caseId,session,canWrite,closed,hasAssessment,onDirtyChange,onDeadlineChange}:{caseId:string;session:MessageSession;canWrite:boolean;closed:boolean;hasAssessment:boolean;onDirtyChange:(value:boolean)=>void;onDeadlineChange:(dueAt:string)=>void}) {
  const [rows,setRows]=useState<Review[]>([]),[currentDue,setCurrentDue]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[tick,setTick]=useState(0),[reason,setReason]=useState(''),[due,setDue]=useState(''),[pending,setPending]=useState<PendingMessage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[recoveryFailed,setRecoveryFailed]=useState(false);
  const mounted=useRef(true),inFlight=useRef(false),callback=useRef(onDirtyChange);callback.current=onDirtyChange;
  const path=`/api/clarifications/${encodeURIComponent(caseId)}/reviews`;
  async function request(url:string,body?:unknown) {
    const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{'x-client-session-context':session.clientContext,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw Error(value.error || 'Case review unavailable.');return value;
  }
  useEffect(()=>{mounted.current=true;try{setPending(readPendingMessage(sessionStorage,session,caseId,'review'));}catch{setRecoveryFailed(true);setError('Review recovery cannot be verified. Nothing new will be sent.');}return()=>{mounted.current=false;callback.current(false);};},[caseId,session.clientContext]);
  useEffect(()=>{const dirty=!!reason.trim() || !!due || busy;callback.current(dirty);if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[reason,due,busy]);
  useEffect(()=>{let current=true;setLoaded(false);Promise.all([request(path),request(`/api/clarifications/${encodeURIComponent(caseId)}`)]).then(([history,detail])=>{if(current){setRows(history);setCurrentDue(detail.case_due_at || detail.due_at || null);setLoaded(true);}}).catch(()=>{if(current)setError('Case review history unavailable.');});return()=>{current=false;};},[path,tick]);
  async function act(kind:'deadline'|'disagree'|'check') {
    if(inFlight.current || recoveryFailed || !loaded || !canWrite)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
    let retained:PendingMessage|null=null;
    try {
      let body:Record<string,unknown>|undefined;
      if(kind==='check'){retained=readPendingMessage(sessionStorage,session,caseId,'review');if(!retained)throw Error('No pending review.');}
      else {
        if(kind==='deadline'){
          const deadline=Date.parse(due);if(!Number.isFinite(deadline) || deadline<=Date.now() || deadline>Date.now()+30*86400000)throw Error('Choose a deadline within the next 30 days.');
          body={kind,dueAt:new Date(deadline).toISOString(),expectedDueAt:currentDue};
        }else {if(reason.trim().length<5)throw Error('Enter a disagreement reason.');body={kind,reason:reason.trim()};}
        retained=await retainMessage(sessionStorage,session,caseId,kind==='deadline'?JSON.stringify(body):reason.trim(),kind,'review');body.requestId=retained.id;
      }
      if(!mounted.current)return;setPending(retained);
      const row:Review=await request(kind==='check'?`${path}/${retained.id}`:path,body);
      if(!mounted.current)return;
      if(row.id!==retained.id || row.caseId!==caseId || row.kind!==retained.kind || !Number.isFinite(Date.parse(row.createdAt)))throw Error('Acknowledgement cannot be verified.');
      const expected=row.kind==='deadline'?JSON.stringify({kind:'deadline',dueAt:row.dueAt,expectedDueAt:row.expectedDueAt}):row.reason || '';
      await retainMessage(sessionStorage,session,caseId,expected,row.kind,'review');clearPendingMessage(sessionStorage,session,caseId,retained.id,'review');
      if(!mounted.current)return;setPending(null);setReason('');setDue('');setNotice(row.kind==='deadline'?'Case deadline saved.':'Disagreement recorded. Original assessment unchanged.');if(row.dueAt)onDeadlineChange(row.dueAt);setTick(value=>value+1);
    }catch(reason){if(mounted.current)setError(`${(reason as Error).message}${retained?' Delivery remains unknown. Check the receipt before starting another review.':''}`);}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  return <section className="panel"><div className="worker-card-head"><h2>Supervisor review</h2><button className="icon-button" title="Refresh case reviews" aria-label="Refresh case reviews" disabled={busy || !!reason.trim() || !!due} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button></div>
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!loaded?<p role="status">Loading case reviews...</p>:rows.map(row=><article className="case-attempt" key={row.id}><strong>{row.kind==='deadline'?'Deadline changed':'Assessment disagreement'}</strong><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>{row.reason && <p>{row.reason}</p>}{row.dueAt && <p>Due <time dateTime={row.dueAt}>{new Date(row.dueAt).toLocaleString()}</time></p>}</article>)}
    {pending && <div className="notice notice-amber"><p>Review receipt is not confirmed. Check before retrying. Only the exact original review can be resent.</p><button className="button outline" disabled={busy || !canWrite} onClick={()=>void act('check')}><RefreshCw size={18}/>Check review receipt</button></div>}
    {canWrite && !closed && (!pending || pending.kind==='deadline') && <form onSubmit={event=>{event.preventDefault();void act('deadline');}}><label className="field">Case follow-up deadline ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" value={due} disabled={busy || recoveryFailed || !loaded} onChange={event=>setDue(event.target.value)} required/></label><button className="button outline" disabled={busy || recoveryFailed || !loaded || !due}><CalendarClock size={18}/>{pending?'Retry exact deadline':'Save case deadline'}</button></form>}
    {canWrite && hasAssessment && (!pending || pending.kind==='disagree') && <form onSubmit={event=>{event.preventDefault();void act('disagree');}}><label className="field">Disagreement reason (supervisor only)<textarea value={reason} maxLength={1000} rows={3} disabled={busy || recoveryFailed || !loaded} onChange={event=>setReason(event.target.value)}/></label><button className="button outline" disabled={busy || recoveryFailed || !loaded || reason.trim().length<5}><MessageSquareWarning size={18}/>{pending?'Retry exact disagreement':'Record disagreement'}</button></form>}
    {!pending && (!!reason || !!due) && <button className="icon-button" aria-label="Clear review draft" title="Clear review draft" disabled={busy} onClick={()=>{setReason('');setDue('');}}><X size={18}/></button>}
  </section>;
}
