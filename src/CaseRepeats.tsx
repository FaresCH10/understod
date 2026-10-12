import {useEffect,useRef,useState} from 'react';
import {RefreshCw,Repeat2} from 'lucide-react';
import type {MessageSession} from './case-message-recovery';

type Repeat={id:string;caseId:string;status:string;dueAt:string;createdAt:string;submittedAt:string|null};
type Pending={id:string;dueAt:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function CaseRepeats({caseId,session,canWrite,closed,onBusyChange}:{caseId:string;session:MessageSession;canWrite:boolean;closed:boolean;onBusyChange:(value:boolean)=>void}) {
  const [rows,setRows]=useState<Repeat[]>([]),[due,setDue]=useState(''),[pending,setPending]=useState<Pending|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[tick,setTick]=useState(0),[recoveryFailed,setRecoveryFailed]=useState(false);
  const mounted=useRef(true),inFlight=useRef(false),busyCallback=useRef(onBusyChange);busyCallback.current=onBusyChange;
  const key=`understood:case-repeat:${session.clientContext}:${caseId}`,path=`/api/clarifications/${encodeURIComponent(caseId)}/repeats`;
  function read():Pending|null {
    if(Date.parse(session.expiresAt)<=Date.now())throw Error('Session expired.');
    const raw=sessionStorage.getItem(key);if(raw===null)return null;const value=JSON.parse(raw);
    if(raw.length>200 || !value || Object.keys(value).sort().join(',')!=='dueAt,id' || !uuid.test(value.id)
      || typeof value.dueAt!=='string' || !Number.isFinite(Date.parse(value.dueAt)) || new Date(value.dueAt).toISOString()!==value.dueAt)throw Error('Repeat recovery cannot be verified.');return value;
  }
  async function request(url:string,body?:unknown) {
    const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{'x-client-session-context':session.clientContext,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw Error(value.error || 'Repeat request unavailable.');return value;
  }
  useEffect(()=>{mounted.current=true;try{setPending(read());}catch{setRecoveryFailed(true);setError('Repeat recovery cannot be verified. Nothing new will be sent.');}return()=>{mounted.current=false;busyCallback.current(false);};},[key]);
  useEffect(()=>{let current=true;setLoaded(false);request(path).then(value=>{if(current){setRows(value);setLoaded(true);}}).catch(()=>{if(current)setError('Repeat history unavailable.');});return()=>{current=false;};},[path,tick]);
  async function act(check=false) {
    if(inFlight.current || recoveryFailed || !loaded || !canWrite)return;inFlight.current=true;setBusy(true);busyCallback.current(true);setError('');setNotice('');
    let retained:Pending|null=null;
    try {
      retained=read();if(!check && !retained){const deadline=Date.parse(due);if(!Number.isFinite(deadline) || deadline<=Date.now() || deadline>Date.now()+30*86400000)throw Error('Choose a deadline within the next 30 days.');retained={id:crypto.randomUUID(),dueAt:new Date(deadline).toISOString()};const raw=JSON.stringify(retained);sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw Error('Recovery storage unavailable. Nothing was sent.');}
      if(!retained)throw Error('No pending receipt.');if(mounted.current)setPending(retained);
      const row:Repeat=await request(check?`${path}/${retained.id}`:path,check?undefined:{requestId:retained.id,dueAt:retained.dueAt});
      if(!mounted.current)return;
      if(row.id!==retained.id || row.caseId!==caseId || row.dueAt!==retained.dueAt || !['pending','submitted','cancelled','expired'].includes(row.status) || !Number.isFinite(Date.parse(row.createdAt)))throw Error('Acknowledgement cannot be verified.');
      sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw Error('Recovery could not be cleared.');
      setPending(null);setDue('');setNotice('Repeat request saved. Earlier responses and assessments are unchanged.');setTick(value=>value+1);
    }catch(reason){if(mounted.current)setError(`${(reason as Error).message}${retained?' Delivery remains unknown. Check its receipt before starting another request.':''}`);}
    finally{inFlight.current=false;if(mounted.current){setBusy(false);busyCallback.current(false);}}
  }
  const active=rows.some(row=>row.status==='pending' && Date.parse(row.dueAt)>Date.now());
  return <section className="panel"><div className="worker-card-head"><h2>Repeat answer</h2><button className="icon-button" title="Refresh repeat requests" aria-label="Refresh repeat requests" disabled={busy} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button></div>
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!loaded?<p role="status">Loading repeat requests...</p>:rows.map(row=><div className="case-attempt" key={row.id}><strong>{row.status==='pending' && closed?'Case closed':row.status==='pending' && Date.parse(row.dueAt)<=Date.now()?'Expired':row.status}</strong><p>Due <time dateTime={row.dueAt}>{new Date(row.dueAt).toLocaleString()}</time></p>{row.submittedAt && <p>Received <time dateTime={row.submittedAt}>{new Date(row.submittedAt).toLocaleString()}</time></p>}</div>)}
    {pending && <div className="notice notice-amber"><p>Request receipt is not confirmed.</p><button className="button outline" disabled={busy || !canWrite} onClick={()=>void act(true)}><RefreshCw size={18}/>Check receipt</button><button className="button outline" disabled={busy || closed || !canWrite} onClick={()=>void act()}>Retry same request</button></div>}
    {canWrite && !closed && !active && !pending && <form onSubmit={event=>{event.preventDefault();void act();}}><label className="field">Answer deadline ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" value={due} disabled={busy || recoveryFailed || !loaded} onChange={event=>setDue(event.target.value)} required/></label><button className="button outline" disabled={busy || recoveryFailed || !loaded || !due}><Repeat2 size={18}/>Request another answer</button></form>}
  </section>;
}
