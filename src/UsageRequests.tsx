import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ChevronLeft,ChevronRight,RefreshCw,Send,X} from 'lucide-react';
import {readUsageRequest,storeUsageRequest,clearUsageRequest,requestUsageChange,UsageRequestError,type UsageSession,type PendingUsageRequest} from './usage-request-recovery';
type Inbox={items:{requestId:string;request:{kind:string;message:string};createdAt:string}[];total:number;pageSize:number;scope:string};
export default function UsageRequests({session}:{session:UsageSession}) {
  const [recovery,setRecovery]=useState(()=>{try{return {pending:readUsageRequest(sessionStorage,session),error:''};}catch(error){return {pending:null,error:(error as Error).message};}});
  const [kind,setKind]=useState('quota'),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[absent,setAbsent]=useState(false),[rejected,setRejected]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tick,setTick]=useState(0),[page,setPage]=useState(1),[inbox,setInbox]=useState<Inbox|null>(null),[listError,setListError]=useState('');
  const inFlight=useRef(false),controller=useRef<AbortController|null>(null),pending=recovery.pending;
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{
    const abort=new AbortController();let current=true;setListError('');
    fetch(`/api/usage/requests?page=${page}`,{credentials:'include',cache:'no-store',signal:abort.signal,headers:{'x-client-session-context':session.clientContext}}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error || 'Requests could not be loaded.');if(current)setInbox(data);}).catch(error=>{if(current)setListError(error.message);});
    return ()=>{current=false;abort.abort();};
  },[page,tick,session.clientContext]);
  useEffect(()=>{
    if(!pending || inFlight.current)return;
    const abort=new AbortController();controller.current=abort;const timeout=setTimeout(()=>abort.abort(),30000);let current=true;setBusy(true);setAbsent(false);
    requestUsageChange(pending,false,fetch,abort.signal).then(found=>{
      if(!current)return;
      if(found){clearUsageRequest(sessionStorage,pending);setRecovery({pending:null,error:''});setMessage('');setConfirmed(false);setNotice('Request recorded in the site owner inbox. No plan, quota or payment changed.');}
      else setAbsent(true);
    }).catch(reason=>{if(current)setError((reason as Error).message);}).finally(()=>{clearTimeout(timeout);if(current)setBusy(false);});
    return ()=>{current=false;clearTimeout(timeout);abort.abort();};
  },[pending,tick]);
  async function send(value:PendingUsageRequest) {
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');setAbsent(false);setRejected(false);
    const abort=new AbortController();controller.current=abort;const timeout=setTimeout(()=>abort.abort(),30000);
    try{storeUsageRequest(sessionStorage,value);setRecovery({pending:value,error:''});await requestUsageChange(value,true,fetch,abort.signal);}
    catch(reason){setError((reason as Error).message);setRejected(reason instanceof UsageRequestError && reason.rejected);}
    finally{clearTimeout(timeout);inFlight.current=false;setBusy(false);setConfirmed(false);setTick(n=>n+1);}
  }
  function submit(event:FormEvent){event.preventDefault();if(confirmed && message.trim() && !busy)void send({...session,requestId:crypto.randomUUID(),body:{kind,message:message.trim(),confirmed:true}});}
  return <section className="panel usage-requests"><h2>Plan &amp; allowance requests</h2><p className="muted">Requests are recorded for the site owner. They do not change limits, purchase a subscription or send email.</p>
    {recovery.error?<p role="alert" className="record-error">{recovery.error}</p>:pending?<div><h3>Request receipt</h3><p>{pending.body.kind}: {pending.body.message}</p><p role="status">{busy?'Checking request...':absent?'No accepted receipt was found.':'Acceptance has not been verified.'}</p>
      {absent && !rejected && <label className="billing-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>Retry the original request</label>}
      <div className="actions"><button className="button outline" disabled={busy} onClick={()=>{setError('');setTick(n=>n+1);}}><RefreshCw size={18}/>Check receipt</button>{absent && !rejected && <button className="button primary" disabled={busy || !confirmed} onClick={()=>void send(pending)}><Send size={18}/>Retry unchanged request</button>}{absent && rejected && <button className="button outline" disabled={busy} onClick={()=>{try{clearUsageRequest(sessionStorage,pending);setRecovery({pending:null,error:''});}catch(reason){setError((reason as Error).message);}}}><X size={18}/>Close rejected request</button>}</div>
    </div>:<form onSubmit={submit}><label>Request type<select value={kind} disabled={busy} onChange={event=>{setKind(event.target.value);setConfirmed(false);}}><option value="quota">Request allowance change</option><option value="plan">Request plan discussion</option><option value="contact">Contact site owner</option></select></label><label>Message<textarea maxLength={1000} rows={3} value={message} disabled={busy} onChange={event=>{setMessage(event.target.value);setConfirmed(false);}}/></label><label className="billing-confirm"><input type="checkbox" checked={confirmed} disabled={busy || !message.trim()} onChange={event=>setConfirmed(event.target.checked)}/>Record this request for the site owner</label><button className="button primary" disabled={busy || !confirmed || !message.trim()}><Send size={18}/>Record request</button></form>}
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <h3>{inbox?.scope==='site_owner_inbox'?'Site owner inbox':'Your requests'}</h3>{listError && <p role="alert" className="record-error">{listError}</p>}
    {inbox?.items.map(row=><article className="usage-request-row" key={row.requestId}><div><strong>{row.request.kind}</strong><span className="muted">{new Date(row.createdAt).toLocaleString()}</span></div><p>{row.request.message}</p><small className="muted">Recorded · no changes applied</small></article>)}
    {inbox?.total===0 && <p className="muted">No recorded requests.</p>}<div className="actions"><button className="icon-button" aria-label="Previous request page" title="Previous request page" disabled={page===1 || busy} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={18}/></button><span>Page {page}</span><button className="icon-button" aria-label="Next request page" title="Next request page" disabled={!inbox || page*inbox.pageSize>=inbox.total || busy} onClick={()=>setPage(n=>n+1)}><ChevronRight size={18}/></button></div>
  </section>;
}
