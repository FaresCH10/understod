import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Building2,Plus,RefreshCw,ChevronLeft,ChevronRight,Save,Clock3,Search,Settings2,Archive,ArchiveRestore} from 'lucide-react';
import {SiteWorkerAccess,type AccessSite} from './SiteWorkerAccess';
type Session={clientContext:string;expiresAt:string;siteState?:'active'|'archived'};
type Body={requestId:string;name:string;timezone:string;generationLanguages:string[];confirmed:true};
type Pending={expiresAt:string;body:Body};
type Catalog={items:(AccessSite & {timezone:string;workers:number;current:boolean;canManageAccess:boolean;canManageLifecycle:boolean})[];total:number;page:number;pageSize:number;canCreate:boolean};
const uuid=(value:unknown)=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function validPending(value:unknown,session:Session):value is Pending {
  const p=value as Pending,b=p?.body;
  return !!p && Object.keys(p).length===2 && p.expiresAt===session.expiresAt && Date.parse(p.expiresAt)>Date.now() && !!b && Object.keys(b).length===5 && uuid(b.requestId)
    && b.confirmed===true && typeof b.name==='string' && b.name.trim()===b.name && b.name.length>=2 && b.name.length<=120 && !/[\x00-\x1f\x7f]/.test(b.name)
    && typeof b.timezone==='string' && b.timezone.length>0 && b.timezone.length<=80 && Array.isArray(b.generationLanguages) && b.generationLanguages.includes('en')
    && b.generationLanguages.length<=3 && new Set(b.generationLanguages).size===b.generationLanguages.length && b.generationLanguages.every(code=>['en','ar','ur'].includes(code));
}
export function OrganizationSites({session,timezone,disabled,onLocked,onLifecycleChanged}:{session:Session;timezone:string;disabled:boolean;onLocked:(value:boolean)=>void;onLifecycleChanged:()=>void}) {
  const key=`understood:site-creation:${session.clientContext}`;
  const [catalog,setCatalog]=useState<Catalog|null>(null),[search,setSearch]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[zone,setZone]=useState(timezone),[languages,setLanguages]=useState(['en']),[confirmed,setConfirmed]=useState(false);
  const [pending,setPending]=useState<Pending|null>(null),[missing,setMissing]=useState(false),[corrupt,setCorrupt]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [accessTarget,setAccessTarget]=useState<AccessSite|null>(null),[accessLocked,setAccessLocked]=useState(false);
  const [lifecycleTarget,setLifecycleTarget]=useState<AccessSite|null>(null),[lifecycleLocked,setLifecycleLocked]=useState(false);
  const sending=useRef(false),mounted=useRef(true),lockCallback=useRef(onLocked),heading=useRef<HTMLHeadingElement>(null);lockCallback.current=onLocked;
  const locked=editing || busy || !!pending || corrupt || accessLocked || lifecycleLocked;
  useEffect(()=>{lockCallback.current(locked);},[locked]);
  async function request(path:string,body?:Body) {
    if(Date.parse(session.expiresAt)<=Date.now())throw Error('Session expired. Sign in again.');
    const response=await fetch(`/api/settings/sites${path}`,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-client-session-context':session.clientContext},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw Error(result.error || 'Site request unavailable');return result;
  }
  function remove(value:Pending) {
    if(sessionStorage.getItem(key)!==JSON.stringify(value))throw Error('The saved site request changed. Reload before continuing.');
    sessionStorage.removeItem(key);setPending(null);setMissing(false);
  }
  async function check(value:Pending) {
    if(sending.current)return;sending.current=true;setBusy(true);setError('');
    try{const result=await request(`/receipts/${value.body.requestId}`);if(!mounted.current)return;
      if(result.found===false && Object.keys(result).length===1){setMissing(true);return;}
      const b=value.body,r=result.request;
      if(result.found!==true || !uuid(result.id) || !uuid(result.ownerId) || !r || Object.keys(r).length!==4 || r.name!==b.name || r.timezone!==b.timezone || r.confirmed!==true || JSON.stringify(r.generationLanguages)!==JSON.stringify(b.generationLanguages))throw Error('Site receipt could not be verified.');
      remove(value);setEditing(false);setName('');setConfirmed(false);setMessage('Site created.');setPage(1);setRefresh(n=>n+1);heading.current?.focus();
    }catch(e){if(mounted.current)setError((e as Error).message);}finally{sending.current=false;if(mounted.current)setBusy(false);}
  }
  async function send(value:Pending) {
    if(sending.current)return;sending.current=true;setBusy(true);setMissing(false);setError('');
    try{if(sessionStorage.getItem(key)!==JSON.stringify(value))throw Error('The saved site request changed. Reload before continuing.');await request('',value.body);}
    catch(e){if(mounted.current)setError((e as Error).message);}
    finally{sending.current=false;if(mounted.current){setBusy(false);void check(value);}}
  }
  function submit(event:FormEvent) {
    event.preventDefault();if(disabled || accessLocked || lifecycleLocked || session.siteState==='archived' || !catalog?.canCreate || !confirmed || pending || corrupt || sending.current)return;
    const value:Pending={expiresAt:session.expiresAt,body:{requestId:crypto.randomUUID(),name:name.trim(),timezone:zone,generationLanguages:languages,confirmed:true}};
    try{if(sessionStorage.getItem(key))throw Error('An earlier site request needs checking.');sessionStorage.setItem(key,JSON.stringify(value));if(sessionStorage.getItem(key)!==JSON.stringify(value))throw Error('Site request could not be saved.');setPending(value);void send(value);}catch(e){setError((e as Error).message);}
  }
  useEffect(()=>{mounted.current=true;try{const raw=sessionStorage.getItem(key);if(raw){if(raw.length>2048)throw Error();const value:unknown=JSON.parse(raw);if(!validPending(value,session))throw Error();setPending(value);void check(value);}}catch{setCorrupt(true);setError('Saved site request unavailable. Reload or sign in again before creating a site.');}return()=>{mounted.current=false;lockCallback.current(false);};},[key]);
  useEffect(()=>{let current=true;setLoading(true);const timer=setTimeout(()=>{request(`?${new URLSearchParams({search,page:String(page),pageSize:'10'})}`).then((value:Catalog)=>{if(current)setCatalog(value);}).catch(e=>{if(current){setCatalog(null);setError(e.message);}}).finally(()=>{if(current)setLoading(false);});},200);return()=>{current=false;clearTimeout(timer);};},[key,search,page,refresh]);
  const frozen=disabled || busy || !!pending || corrupt || accessLocked || lifecycleLocked,zones=[...new Set(['UTC',timezone,...Intl.supportedValuesOf('timeZone')])],pages=Math.max(1,Math.ceil((catalog?.total || 0)/10));
  return <section className="organization-sites"><div className="page-header"><h2 ref={heading} tabIndex={-1}><Building2 size={22}/>Sites{catalog?` (${catalog.total})`:''}</h2><div className="actions"><button className="icon-button" title="Refresh sites" aria-label="Refresh sites" disabled={disabled || busy || loading} onClick={()=>{setError('');setRefresh(n=>n+1);}}><RefreshCw size={18}/></button>{catalog?.canCreate && !editing && <button className="button primary" disabled={frozen || session.siteState==='archived'} onClick={()=>{setEditing(true);setMessage('');setConfirmed(false);}}><Plus size={18}/>Add site</button>}</div></div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="record-error">{error}</p>}
    {pending && <div className="notice notice-amber"><Clock3 size={20}/><div><strong>Site request awaiting confirmation</strong><div className="actions"><button className="button outline" disabled={busy || disabled} onClick={()=>void check(pending)}><RefreshCw size={18}/>Check receipt</button>{missing && <><button className="button primary" disabled={busy || disabled} onClick={()=>void send(pending)}><Save size={18}/>Retry unchanged request</button><button className="button outline" disabled={busy || disabled} onClick={()=>{try{remove(pending);setEditing(false);}catch(e){setError((e as Error).message);}}}>Cancel unsaved request</button></>}</div></div></div>}
    {editing && !pending && <form className="site-create-form" onSubmit={submit}><fieldset disabled={frozen}><legend>New site</legend><label className="field">Site name<input autoFocus required minLength={2} maxLength={120} value={name} onChange={e=>{setName(e.target.value);setConfirmed(false);}}/></label><label className="field">Timezone<select value={zone} onChange={e=>{setZone(e.target.value);setConfirmed(false);}}>{zones.map(z=><option key={z}>{z}</option>)}</select></label><fieldset className="generation-language-options"><legend>Generation defaults</legend>{[['en','English'],['ar','Arabic'],['ur','Urdu']].map(([code,label])=><label className="billing-confirm" key={code}><input type="checkbox" checked={languages.includes(code)} disabled={code==='en'} onChange={e=>{setLanguages(['en',...['ar','ur'].filter(c=>c===code?e.target.checked:languages.includes(c))]);setConfirmed(false);}}/>{label}</label>)}</fieldset><label className="billing-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm this site and my owner access.</span></label><div className="actions"><button type="button" className="button outline" onClick={()=>{setEditing(false);setError('');}}>Cancel</button><button className="button primary" disabled={!confirmed || name.trim().length<2}><Plus size={18}/>Create site</button></div></fieldset></form>}
    <SiteWorkerAccess session={session} target={accessTarget} disabled={disabled || lifecycleLocked || editing || busy || !!pending || corrupt || session.siteState==='archived'} onLocked={setAccessLocked} onClose={()=>setAccessTarget(null)} onSaved={()=>setRefresh(n=>n+1)}/>
    <SiteWorkerAccess lifecycle session={session} target={lifecycleTarget} disabled={disabled || accessLocked || editing || busy || !!pending || corrupt} onLocked={setLifecycleLocked} onClose={()=>setLifecycleTarget(null)} onSaved={()=>{setRefresh(n=>n+1);onLifecycleChanged();}}/>
    <label className="field site-search">Search sites<span className="search-box"><Search size={18}/><input maxLength={120} value={search} disabled={disabled || busy || accessLocked || lifecycleLocked} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></span></label>
    {loading?<p role="status">Loading sites...</p>:catalog && <><div className="site-table-wrap"><table><thead><tr><th scope="col">Site</th><th scope="col">Timezone</th><th scope="col">Active workers</th><th scope="col">Worker access</th><th scope="col">Status</th></tr></thead><tbody>{catalog.items.map(site=><tr key={site.id}><th scope="row" dir="auto">{site.name}{site.current && <small>Current</small>}</th><td>{site.timezone}</td><td>{site.workers}</td><td><div className="site-access-cell"><span>{site.workerAccess==='paused'?'Paused':'Active'}</span>{site.canManageAccess && <button className="icon-button" disabled={frozen || editing || session.siteState==='archived'} title={`Change worker access for ${site.name}`} aria-label={`Change worker access for ${site.name}`} onClick={()=>{setAccessTarget(site);setMessage('');}}><Settings2 size={18}/></button>}</div></td><td><div className="site-access-cell"><span>{site.lifecycle==='archived'?'Archived':'Active'}</span>{site.canManageLifecycle && <button className="icon-button" disabled={frozen || editing} title={`${site.lifecycle==='active'?'Archive':'Restore'} ${site.name}`} aria-label={`${site.lifecycle==='active'?'Archive':'Restore'} ${site.name}`} onClick={()=>{setLifecycleTarget(site);setMessage('');}}>{site.lifecycle==='active'?<Archive size={18}/>:<ArchiveRestore size={18}/>}</button>}</div></td></tr>)}</tbody></table></div>{!catalog.items.length && <p>No sites match.</p>}<div className="audit-pagination"><span>Page {page} of {pages}</span><div className="actions"><button className="icon-button" title="Previous sites" aria-label="Previous sites" disabled={disabled || busy || accessLocked || lifecycleLocked || page<=1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={18}/></button><button className="icon-button" title="Next sites" aria-label="Next sites" disabled={disabled || busy || accessLocked || lifecycleLocked || page>=pages} onClick={()=>setPage(n=>n+1)}><ChevronRight size={18}/></button></div></div></>}
  </section>;
}
