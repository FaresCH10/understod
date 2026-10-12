import {useEffect,useRef,useState,type FormEvent} from 'react';
import {RefreshCw,X} from 'lucide-react';
import {readPendingReview} from './review-recovery';
import {clearPendingRegeneration,savePendingRegeneration,checkedRegenerationResult,checkedRegenerationReceipt,type PendingRegeneration} from './regeneration-recovery';

class RegenerationError extends Error {constructor(message:string,public uncertain=false){super(message);}}
async function requestRegeneration(path:string,body?:unknown) {
  let response:Response,data;
  try {response=await fetch(`/api${path}`,{credentials:'include',...(body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {})});data=await response.json();}
  catch {throw new RegenerationError('Connection interrupted. Check the saved regeneration request.',!!body);}
  if(!response.ok) throw new RegenerationError(data.error || 'Regeneration request failed.',!!body && response.status>=500);
  return data;
}
const send=(pending:PendingRegeneration)=>requestRegeneration(`/briefings/${encodeURIComponent(pending.briefingId)}/regenerate`,{...pending.body,requestId:pending.requestId});
const receipt=(pending:PendingRegeneration)=>requestRegeneration(`/briefing-regeneration/receipts/${pending.requestId}`);
const names={en:'English',ar:'Arabic',ur:'Urdu'};

export function RegenerationRecovery({pending,scope,onResolved}:{pending:PendingRegeneration;scope:string;onResolved:(id:string)=>void}) {
  const [busy,setBusy]=useState(true),[checked,setChecked]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const sending=useRef(false),heading=useRef<HTMLHeadingElement>(null),resolved=useRef(onResolved);resolved.current=onResolved;
  useEffect(()=>{heading.current?.focus();},[]);
  const finish=(id:string)=>{clearPendingRegeneration(sessionStorage,scope,pending.requestId);resolved.current(id);};
  useEffect(()=>{
    let current=true;setBusy(true);setChecked(false);setError('');
    receipt(pending).then(value=>{if(!current) return;const accepted=checkedRegenerationReceipt(value,pending);if(accepted) finish(accepted.id);else setChecked(true);})
      .catch(reason=>{if(current) setError(reason.message);}).finally(()=>{if(current) setBusy(false);});
    return ()=>{current=false;};
  },[pending,scope,refresh]);
  async function retry() {
    if(sending.current || busy || !checked) return;sending.current=true;setBusy(true);setError('');
    try {savePendingRegeneration(sessionStorage,scope,pending);const result=checkedRegenerationResult(await send(pending),pending);finish(result.id);}
    catch(reason) {setChecked(false);setError((reason as Error).message);}
    finally {sending.current=false;setBusy(false);}
  }
  return <><h1 ref={heading} tabIndex={-1}>Recover regeneration</h1><section className="panel"><h2>{names[pending.body.language]} {pending.body.kind} · source revision {pending.body.revision}</h2><p role="status">{busy ? 'Checking saved regeneration...' : checked ? 'No saved receipt was found. You can retry the original confirmed request.' : 'The pending request has not been resolved.'}</p>{error && <p role="alert" className="record-error">{error}</p>}<div className="actions"><button className="button outline" disabled={busy} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={18}/>Check saved request</button>{checked && <button className="button primary" disabled={busy} onClick={()=>void retry()}><RefreshCw size={18}/>Retry original request</button>}</div></section></>;
}

export function RegenerationControl({id,revision,language,scope,disabled,onChanged,onEditingChange}:{id:string;revision:number;language:'en'|'ar'|'ur';scope?:string|null;disabled:boolean;onChanged:()=>void;onEditingChange:(value:boolean)=>void}) {
  const [kind,setKind]=useState<'translation'|'audio'|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
  const pending=useRef<PendingRegeneration|null>(null),sending=useRef(false),consent=useRef<HTMLInputElement>(null),trigger=useRef<'translation'|'audio'|null>(null),commands=useRef<Partial<Record<'translation'|'audio',HTMLButtonElement|null>>>({}),focusBack=useRef(false);
  const locked=busy || uncertain;
  useEffect(()=>{if(kind) consent.current?.focus();else if(focusBack.current) {focusBack.current=false;if(trigger.current) commands.current[trigger.current]?.focus();}},[kind]);
  const close=()=>{if(locked) return;focusBack.current=true;setKind(null);onEditingChange(false);};
  const finish=(acceptedId:string)=>{if(acceptedId!==id) throw Error('Regeneration briefing changed.');clearPendingRegeneration(sessionStorage,scope!,pending.current!.requestId);pending.current=null;setUncertain(false);setKind(null);onEditingChange(false);onChanged();};
  async function submit(event:FormEvent) {
    event.preventDefault();if(sending.current || !confirmed || !kind) return;
    pending.current ||= {requestId:crypto.randomUUID(),briefingId:id,body:{revision,language,kind,confirmed:true}};
    sending.current=true;setBusy(true);setError('');let sent=false;
    try {
      if(!scope) throw new RegenerationError('Regeneration recovery scope is unavailable. Sign in again.');
      if(readPendingReview(sessionStorage,scope)) throw new RegenerationError('Recover the pending draft review first.');
      savePendingRegeneration(sessionStorage,scope,pending.current);sent=true;
      const accepted=checkedRegenerationResult(await send(pending.current),pending.current);finish(accepted.id);
    }catch(reason) {
      let unknown=uncertain || sent && (!(reason instanceof RegenerationError) || reason.uncertain);
      if(sent && !unknown && scope) {try {clearPendingRegeneration(sessionStorage,scope,pending.current!.requestId);}catch {unknown=true;}}
      if(!unknown) pending.current=null;
      setUncertain(unknown);setError((reason as Error).message);
    }finally {sending.current=false;setBusy(false);}
  }
  async function check() {
    if(sending.current || !pending.current || !scope) return;sending.current=true;setBusy(true);setError('');
    try {const accepted=checkedRegenerationReceipt(await receipt(pending.current),pending.current);if(accepted) finish(accepted.id);else setError('No saved receipt was found. Retry the unchanged confirmed request.');}
    catch(reason) {setError((reason as Error).message);}
    finally {sending.current=false;setBusy(false);}
  }
  return <div className="draft-review">{kind ? <form aria-label={`${names[language]} regeneration`} onSubmit={event=>void submit(event)} onKeyDown={event=>{if(event.key==='Escape' && !locked) {event.preventDefault();close();}}}>
    <h3>Regenerate {names[language]} {kind}</h3><p>{kind==='translation' ? 'Replace the selected translation override with automatic translation and new audio. Other languages and published versions stay unchanged.' : 'Generate new instruction and question audio from the exact selected text. Text, other languages and published versions stay unchanged.'}</p>
    <label className="recipient-row publish-confirm"><input ref={consent} type="checkbox" checked={confirmed} disabled={locked} onChange={event=>setConfirmed(event.target.checked)}/><span>Regenerate {names[language]} {kind} for this draft</span></label>
    {error && <p role="alert" className="record-error">{error}</p>}<div className="actions"><button className="button primary" disabled={busy || !confirmed}><RefreshCw size={18}/>{busy ? 'Submitting...' : uncertain ? 'Retry unchanged request' : 'Confirm regeneration'}</button>{uncertain && <button type="button" className="button outline" disabled={busy} onClick={()=>void check()}><RefreshCw size={18}/>Check saved request</button>}<button type="button" className="button outline" disabled={locked} onClick={close}><X size={18}/>Cancel</button></div>
  </form> : <div className="actions">{(['translation','audio'] as const).filter(value=>value==='audio' || language!=='en').map(value=><button key={value} ref={element=>{commands.current[value]=element;}} className="button outline" disabled={disabled} onClick={()=>{trigger.current=value;setKind(value);setConfirmed(false);setError('');onEditingChange(true);}}><RefreshCw size={18}/>Regenerate {value}</button>)}</div>}</div>;
}
