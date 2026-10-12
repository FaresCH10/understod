import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,BookOpen,ChevronLeft,ChevronRight,Pencil,Plus,RefreshCw,Save,Search,Trash2,X} from 'lucide-react';
import {glossarySignature} from '../server/glossary-input.mjs';
import {readPendingGlossary,savePendingGlossary,clearPendingGlossary,pendingGlossarySignature,checkedGlossaryResult,type PendingGlossary,type GlossaryKind} from './glossary-recovery';
type Content={override:string;suggestion:string|null;provenance:{adapter:string;live:boolean}|null};
type Row={id:string;term:string;sourceLanguage:string;targetLanguage:string;revision:number;status:string;content:Content};
type Page={items:Row[];total:number;page:number;pageSize:number};
type Detail=Omit<Row,'content'> & {selected:{revision:number;status:string;content:Content;created_at:string};history:{items:{revision:number;status:string;created_at:string}[];total:number;page:number;pageSize:number}};
const languages={en:'English',ar:'Arabic',ur:'Urdu'};
const labels:Record<GlossaryKind,string>={create:'Add term',edit:'Save terminology',remove:'Remove term',restore:'Restore term',regenerate:'Regenerate suggestion'};
class GlossaryError extends Error {constructor(message:string,public uncertain=false){super(message);}}
async function request<T>(path:string,body?:unknown):Promise<T> {
  let response:Response,data;
  try {response=await fetch(`/api/glossary${path}`,{credentials:'include',...(body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {})});data=await response.json();}
  catch {throw new GlossaryError('Connection interrupted. The saved request can be checked before retrying.',!!body);}
  if(!response.ok) throw new GlossaryError(data.error || 'Glossary request failed.',!!body && response.status>=500);
  return data;
}
function useRead<T>(path:string,refresh:number,paused=false) {
  const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{if(paused) return;let current=true;setLoading(true);setError('');request<T>(path).then(value=>{if(current) setData(value);}).catch(reason=>{if(current) {setData(null);setError(reason.message);}}).finally(()=>{if(current) setLoading(false);});return ()=>{current=false;};},[path,refresh,paused]);
  return {data,loading,error};
}
export function Glossary({id,newTerm=false,canWrite,scope,navigate}:{id?:string;newTerm?:boolean;canWrite:boolean;scope?:string|null;navigate:(path:string)=>void}) {
  const [recovery,setRecovery]=useState(()=>{try {return {pending:scope ? readPendingGlossary(sessionStorage,scope) : null,error:''};}catch(reason) {return {pending:null,error:(reason as Error).message};}});
  const [search,setSearch]=useState(''),[status,setStatus]=useState('active'),[sourceLanguage,setSourceLanguage]=useState('en'),[targetLanguage,setTargetLanguage]=useState('ar'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const {data,loading,error}=useRead<Page>(`?${new URLSearchParams({search,status,sourceLanguage,targetLanguage,page:String(page),pageSize:'20'})}`,refresh,!!id || newTerm || !!recovery.pending || !!recovery.error);
  if(recovery.error) return <div className="glossary-view"><h1>Glossary recovery</h1><p role="alert" className="record-error">{recovery.error}</p></div>;
  if(recovery.pending && scope) return <GlossaryRecovery pending={recovery.pending} scope={scope} navigate={path=>{setRecovery({pending:null,error:''});navigate(path);setRefresh(value=>value+1);}}/>;
  if(id || newTerm) return <GlossaryDetail key={id || 'new'} id={id} canWrite={canWrite} scope={scope} navigate={navigate}/>;
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  return <div className="glossary-view"><div className="page-header"><div><h1>Company glossary</h1><p>Terminology at this site</p></div>{canWrite && <button className="button primary" onClick={()=>navigate('glossary/new')}><Plus size={20}/>Add term</button>}</div>
    <div className="filters"><label className="select-label">From<select value={sourceLanguage} onChange={event=>{setSourceLanguage(event.target.value);setPage(1);}}><option value="all">All languages</option>{Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label className="select-label">To<select value={targetLanguage} onChange={event=>{setTargetLanguage(event.target.value);setPage(1);}}><option value="all">All languages</option>{Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label className="search-box"><Search size={19}/><input aria-label="Search terminology" maxLength={80} placeholder="Search terminology..." value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label><label className="select-label">Status<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="active">Active</option><option value="removed">Removed</option><option value="all">All statuses</option></select></label><button className="icon-button" aria-label="Refresh terminology" title="Refresh terminology" disabled={loading} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={18}/></button></div>
    {error && <p role="alert" className="record-error">{error}</p>}{loading ? <p role="status">Loading terminology...</p> : data && <section className="panel"><h2>Terms ({data.total})</h2><div className="glossary-list">{data.items.map(row=><button className="glossary-row" key={row.id} onClick={()=>navigate(`glossary/${row.id}`)}><span><strong dir="auto">{row.term}</strong><small>{languages[row.sourceLanguage as keyof typeof languages]} to {languages[row.targetLanguage as keyof typeof languages]}</small></span><span><b dir="auto">{row.content.override || row.content.suggestion || 'No translation generated'}</b><small>v{row.revision} · {row.status} · {row.content.override ? 'Company override' : row.content.provenance?.live ? 'AI suggestion' : row.content.suggestion ? 'Synthetic suggestion' : 'Not generated'}</small></span><ChevronRight size={18}/></button>)}</div>{!data.total && <p>No terms match these filters.</p>}<div className="audit-pagination"><span>Page {page} of {pages} · {data.total} terms</span><button className="icon-button" aria-label="Previous terms" title="Previous terms" disabled={loading || page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next terms" title="Next terms" disabled={loading || page>=pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button></div></section>}
  </div>;
}
function GlossaryRecovery({pending,scope,navigate}:{pending:PendingGlossary;scope:string;navigate:(path:string)=>void}) {
  const [busy,setBusy]=useState(false),[checked,setChecked]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),sending=useRef(false),heading=useRef<HTMLHeadingElement>(null),onResolved=useRef(navigate);
  onResolved.current=navigate;
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    let current=true;setBusy(true);setChecked(false);setError('');
    request<{found:boolean;request?:Record<string,unknown>;result?:unknown}>(`/receipts/${pending.requestId}`).then(value=>{
      if(!current) return;
      if(value.found===true) {
        if(!value.request || glossarySignature(value.request)!==pendingGlossarySignature(pending)) throw new Error('Saved receipt does not match this pending glossary request.');
        const result=checkedGlossaryResult(value.result,pending);clearPendingGlossary(sessionStorage,scope,pending.requestId);onResolved.current(`glossary/${result.id}`);
      } else if(value.found===false) setChecked(true);else throw new Error('Glossary receipt response cannot be verified.');
    }).catch(reason=>{if(current) setError(reason.message);}).finally(()=>{if(current) setBusy(false);});return ()=>{current=false;};
  },[pending,scope,refresh]);
  async function retry() {
    if(busy || !checked || sending.current) return;sending.current=true;setBusy(true);setError('');
    try {savePendingGlossary(sessionStorage,scope,pending);const result=checkedGlossaryResult(await request(pending.kind==='create' ? '' : `/${encodeURIComponent(pending.termId!)}/${pending.kind}`,{...pending.body,requestId:pending.requestId}),pending);clearPendingGlossary(sessionStorage,scope,pending.requestId);onResolved.current(`glossary/${result.id}`);}
    catch(reason) {setError((reason as Error).message);}finally {sending.current=false;setBusy(false);}
  }
  return <div className="glossary-view"><h1 ref={heading} tabIndex={-1}>Recover glossary request</h1><section className="panel"><h2>{labels[pending.kind]}</h2><p dir="auto">{String(pending.body.term || pending.termId || '')}</p><p>{busy ? 'Checking saved request...' : checked ? 'No saved receipt was found. You can retry the original confirmed request.' : 'The pending request has not been resolved.'}</p>{error && <p role="alert" className="record-error">{error}</p>}<div className="actions"><button className="button outline" disabled={busy} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={18}/>Check saved request</button>{checked && <button className="button primary" disabled={busy} onClick={()=>void retry()}><Save size={18}/>Retry original request</button>}</div></section></div>;
}
function GlossaryDetail({id,canWrite,scope,navigate}:{id?:string;canWrite:boolean;scope?:string|null;navigate:(path:string)=>void}) {
  const [refresh,setRefresh]=useState(0),[version,setVersion]=useState(''),[historyPage,setHistoryPage]=useState(1),[kind,setKind]=useState<GlossaryKind|null>(id ? null : 'create');
  const [term,setTerm]=useState(''),[sourceLanguage,setSourceLanguage]=useState('en'),[targetLanguage,setTargetLanguage]=useState('ar'),[override,setOverride]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const {data,loading,error:readError}=useRead<Detail>(`/${encodeURIComponent(id || '')}?${new URLSearchParams({page:String(historyPage),...(version ? {version} : {})})}`,refresh,!id || !!kind);
  const heading=useRef<HTMLHeadingElement>(null),formHeading=useRef<HTMLHeadingElement>(null),sending=useRef(false),pending=useRef<PendingGlossary|null>(null);
  useEffect(()=>{if(kind) formHeading.current?.focus();else if(data && !loading) heading.current?.focus();},[kind,data,loading]);
  const locked=busy || uncertain,current=data?.selected.revision===data?.revision;
  function open(next:GlossaryKind) {setKind(next);setOverride(data?.selected.content.override || '');setConfirmed(false);setError('');setMessage('');}
  async function submit(event:FormEvent) {
    event.preventDefault();if(!kind || !confirmed || sending.current) return;
    const body={confirmed:true,...(kind==='create' ? {term,sourceLanguage,targetLanguage,override} : {revision:data!.revision,...(kind==='edit' ? {override} : {})})};
    const value=pending.current || {requestId:crypto.randomUUID(),kind,termId:id || null,body};sending.current=true;setBusy(true);setError('');let sent=false;
    try {
      if(!scope) throw new GlossaryError('Glossary recovery scope is unavailable. Sign in again before saving.');
      savePendingGlossary(sessionStorage,scope,value);pending.current=value;sent=true;
      const result=checkedGlossaryResult(await request(kind==='create' ? '' : `/${encodeURIComponent(id!)}/${kind}`,{...value.body,requestId:value.requestId}),value);
      clearPendingGlossary(sessionStorage,scope,value.requestId);pending.current=null;setUncertain(false);
      if(kind==='create') navigate(`glossary/${result.id}`);else {setKind(null);setVersion('');setHistoryPage(1);setRefresh(value=>value+1);setMessage(`Saved term v${result.revision}. ${result.invalidatedDrafts} current drafts invalidated. Published content is unchanged.`);}
    } catch(reason) {
      let unknown=sent && (!(reason instanceof GlossaryError) || reason.uncertain);
      if(sent && !unknown && scope) {try {clearPendingGlossary(sessionStorage,scope,value.requestId);pending.current=null;}catch {unknown=true;}}
      setUncertain(unknown);setError((reason as Error).message);
    } finally {sending.current=false;setBusy(false);}
  }
  return <div className="glossary-view"><button className="back-link" disabled={locked} onClick={()=>navigate('glossary')}><ArrowLeft size={18}/>Company glossary</button>
    {kind ? <section className="panel glossary-form-section"><form className="template-form" onSubmit={submit}><h1 ref={formHeading} tabIndex={-1}>{labels[kind]}</h1>
      {kind==='create' ? <><label>Source term<input required dir="auto" maxLength={200} disabled={locked} value={term} onChange={event=>{setTerm(event.target.value);setConfirmed(false);}}/></label><div className="billing-dates"><label>Source language<select disabled={locked} value={sourceLanguage} onChange={event=>{setSourceLanguage(event.target.value);if(event.target.value===targetLanguage) setTargetLanguage(Object.keys(languages).find(code=>code!==event.target.value)!);setConfirmed(false);}}>{Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label>Target language<select disabled={locked} value={targetLanguage} onChange={event=>{setTargetLanguage(event.target.value);setConfirmed(false);}}>{Object.entries(languages).filter(([code])=>code!==sourceLanguage).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div></> : <p dir="auto">{data?.term} · v{data?.revision}</p>}
      {['create','edit'].includes(kind) && <label>Company terminology override (optional)<textarea dir="auto" maxLength={500} disabled={locked} value={override} onChange={event=>{setOverride(event.target.value);setConfirmed(false);}}/></label>}
      <p>Current site drafts will be invalidated. Previously prepared drafts will be queued again. Published versions stay unchanged.</p>
      <label className="billing-confirm"><input type="checkbox" disabled={locked} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Apply this change to the site glossary and current draft dependencies.</label>
      {error && <p role="alert" className="record-error">{error}</p>}<div className="actions"><button className="button primary" disabled={busy || !confirmed || (kind==='create' && (!term.trim() || sourceLanguage===targetLanguage))}><Save size={18}/>{busy ? 'Saving...' : uncertain ? 'Retry unchanged request' : labels[kind]}</button><button type="button" className="button outline" disabled={locked} onClick={()=>{pending.current=null;if(id) setKind(null);else navigate('glossary');}}><X size={18}/>Cancel</button></div>
    </form></section> : loading ? <p role="status">Loading term...</p> : readError || !data ? <p role="alert" className="record-error">{readError || 'Glossary term unavailable'}</p> : <>
      <div className="page-header"><div><h1 ref={heading} tabIndex={-1} dir="auto">{data.term}</h1><p>{languages[data.sourceLanguage as keyof typeof languages]} to {languages[data.targetLanguage as keyof typeof languages]} · v{data.revision} · {data.status}</p></div>{canWrite && current && <div className="actions">{data.status==='active' ? <><button className="button outline" onClick={()=>open('edit')}><Pencil size={18}/>Edit override</button><button className="button outline danger" onClick={()=>open('remove')}><Trash2 size={18}/>Remove term</button></> : <button className="button primary" onClick={()=>open('restore')}><RefreshCw size={18}/>Restore term</button>}</div>}</div>
      {message && <p role="status">{message}</p>}<div className="template-detail-grid"><section className="panel"><h2>Translation · v{data.selected.revision}</h2><h3>Suggested translation</h3><p className="artifact-text" lang={data.selected.content.suggestion ? data.targetLanguage : 'en'} dir={data.selected.content.suggestion && ['ar','ur'].includes(data.targetLanguage) ? 'rtl' : 'ltr'}>{data.selected.content.suggestion || 'No suggestion has been generated.'}</p><h3>Company terminology override</h3><p className="artifact-text" lang={data.selected.content.override ? data.targetLanguage : 'en'} dir={data.selected.content.override && ['ar','ur'].includes(data.targetLanguage) ? 'rtl' : 'ltr'}>{data.selected.content.override || 'No override'}</p><h3>Provenance</h3><p>{data.selected.content.provenance?.live ? 'AI-generated suggestion' : data.selected.content.suggestion ? 'Synthetic fixture suggestion. No live AI call.' : 'Live terminology generation is not configured.'}</p><p>{data.selected.content.provenance?.adapter || 'No generation provenance'} · {data.selected.created_at}</p>
        {canWrite && current && data.status==='active' && <button className="button outline" onClick={()=>open('regenerate')}><RefreshCw size={18}/>Regenerate suggestion</button>}
      </section><section className="panel"><h2><BookOpen size={20}/>Version history</h2><div className="row-list">{data.history.items.map(item=><button key={item.revision} className="item-row" aria-pressed={data.selected.revision===item.revision} onClick={()=>setVersion(String(item.revision))}><span className="item-main"><strong>v{item.revision} · {item.status}</strong><small>{item.created_at}</small></span><ChevronRight size={18}/></button>)}</div><div className="audit-pagination"><span>Page {historyPage} of {Math.ceil(data.history.total/20)}</span><button className="icon-button" title="Previous term versions" aria-label="Previous term versions" disabled={historyPage<=1} onClick={()=>setHistoryPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" title="Next term versions" aria-label="Next term versions" disabled={historyPage*20>=data.history.total} onClick={()=>setHistoryPage(value=>value+1)}><ChevronRight size={18}/></button></div></section></div>
    </>}
  </div>;
}
