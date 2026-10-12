import { useEffect,useState,type RefObject } from 'react';
import { ArrowLeft,ChevronLeft,ChevronRight,RefreshCw,Search,ShieldCheck,UserRoundCheck } from 'lucide-react';
import {CaseConversation} from './CaseConversation';
import type {MessageSession} from './case-message-recovery';
import {CaseRepeats} from './CaseRepeats';
import {CaseReviews} from './CaseReviews';

type Case = {id:string;worker:string;language:string;title:string;reason:string;status:string;created_at:string;due_at:string|null;case_due_at:string|null;escalated_at:string|null;owner_name:string|null;owner_staff_id:string|null};
type Cases = {rows:Case[];total:number;page:number;pageSize:number};
type Attempt = {id:string;answer_text:string;outcome:string|null;received_at:string;recording_id:string|null};
type Detail = Case & {version:number;notes:string;canRequestRepeat?:boolean;canReview?:boolean;contentExpired?:boolean;answer_text?:string;outcome?:string|null;recording_id?:string|null;snapshot:{question:string;facts:string[]};
  owners:{id:string;name:string}[];helpRequest:{text:string;createdAt:string}|null;attempts:Attempt[]};

async function request<T>(path:string,body?:unknown):Promise<T> {
  const response=await fetch(`/api${path}`,{credentials:'include',...(body===undefined ? {} : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function Status({value}:{value:string}) {return <span className={`status status-${value==='resolved' ? 'green' : 'amber'}`}><span className="status-dot" />{value.replaceAll('_',' ')}</span>;}

export function ClarificationsPage({refresh,navigate}:{refresh:number;navigate:(path:string)=>void}) {
  const [search,setSearch]=useState(''),[status,setStatus]=useState('open'),[owner,setOwner]=useState('all'),[overdue,setOverdue]=useState('all');
  const [page,setPage]=useState(1),[reload,setReload]=useState(0),[data,setData]=useState<Cases|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const query=new URLSearchParams({search,status,owner,overdue,page:String(page),pageSize:'20'}).toString();
  useEffect(() => {
    let current=true; setLoading(true); setError(''); setData(null);
    request<Cases>(`/clarifications?${query}`).then((value) => {if(current) setData(value);})
      .catch((err:Error) => {if(current) setError(err.message);}).finally(() => {if(current) setLoading(false);});
    return () => {current=false;};
  },[query,refresh,reload]);
  const change=(set:(value:string)=>void,value:string) => {set(value);setPage(1);};
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  return <>
    <div className="page-header case-header"><div><h1>Clarifications</h1><p>{data ? `${data.total} ${status==='all' ? '' : status+' '}${data.total===1 ? 'case' : 'cases'}` : 'Cases'}</p></div><button className="icon-button" title="Refresh clarifications" aria-label="Refresh clarifications" onClick={() => setReload((n) => n+1)}><RefreshCw size={18} /></button></div>
    <div className="filters audit-filters">
      <label className="search-box"><Search size={18} /><span className="sr-only">Search clarifications</span><input value={search} maxLength={80} placeholder="Search worker, topic, reason" onChange={(event) => change(setSearch,event.target.value)} /></label>
      <label className="select-label">Status<select value={status} onChange={(event) => change(setStatus,event.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All statuses</option></select></label>
      <label className="select-label">Owner<select value={owner} onChange={(event) => change(setOwner,event.target.value)}><option value="all">All owners</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      <label className="select-label">Deadline<select value={overdue} onChange={(event) => change(setOverdue,event.target.value)}><option value="all">All deadlines</option><option value="true">Overdue</option><option value="false">Not overdue</option></select></label>
    </div>
    {error && <p role="alert" className="record-error">{error}</p>}
    <section className="panel"><h2>Cases {data ? `(${data.total})` : ''}</h2>
      {loading ? <p role="status">Loading clarifications...</p> : data?.rows.length ? <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Language</th><th>Topic</th><th>Reason</th><th>Owner</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><strong>{row.worker}</strong></td><td>{row.language.toUpperCase()}</td><td>{row.title}</td><td>{row.reason}</td><td>{row.owner_name || 'Unassigned'}</td><td><Status value={row.status} /></td><td><button className="icon-button" title="View case" aria-label={`View case for ${row.worker}`} onClick={() => navigate(`clarifications/${row.id}`)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table></div> : !error && <p>No cases in this filter.</p>}
      {data && !loading && <div className="audit-pagination"><span>Page {page} of {pages}</span><div className="actions"><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={page<=1} onClick={() => setPage((n) => n-1)}><ChevronLeft size={18} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={page>=pages} onClick={() => setPage((n) => n+1)}><ChevronRight size={18} /></button></div></div>}
    </section>
  </>;
}

export function ClarificationPage({id,refresh,navigate,canWrite,session,navigationGuard}:{id:string;refresh:number;navigate:(path:string)=>void;canWrite:boolean;session:MessageSession;navigationGuard:RefObject<((next:string,resume?:()=>void)=>boolean)|null>}) {
  const [data,setData]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [notes,setNotes]=useState(''),[owner,setOwner]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  const [conversationDirty,setConversationDirty]=useState(false);
  const [repeatBusy,setRepeatBusy]=useState(false);
  const [reviewDirty,setReviewDirty]=useState(false);
  useEffect(()=>{
    const route=`clarifications/${id}`,guard=(next:string)=>{
      if(!conversationDirty && !repeatBusy && !reviewDirty || next===route)return true;
      history.replaceState(null,'',`${location.pathname}${location.search}#${route}`);
      setError('Finish or clear the current case action before leaving.');return false;
    };
    navigationGuard.current=guard;return()=>{if(navigationGuard.current===guard)navigationGuard.current=null;};
  },[id,conversationDirty,repeatBusy,reviewDirty,navigationGuard]);
  useEffect(() => {
    let current=true; setData(null); setError(''); setLoading(true);
    request<Detail>(`/clarifications/${encodeURIComponent(id)}`).then((value) => {if(current) {setData(value);setNotes(value.notes || '');setOwner(value.owner_staff_id || '');}})
      .catch((err:Error) => {if(current) setError(err.message);}).finally(() => {if(current) setLoading(false);});
    return () => {current=false;};
  },[id,refresh,reload]);
  async function save(action:'resolve'|'assign',body:unknown) {
    setBusy(true);setError('');
    try {await request(`/clarifications/${encodeURIComponent(id)}/${action}`,body);setReload((n) => n+1);setNotice(action==='resolve' ? 'Resolution saved.' : 'Owner saved.');}
    catch(err) {setError((err as Error).message);} finally {setBusy(false);}
  }
  if (loading) return <p role="status">Loading case...</p>;
  if (!data) return <><button className="back-link" onClick={() => navigate('clarifications')}><ArrowLeft size={18} />Back to clarifications</button><p role="alert" className="record-error">{error || 'Case unavailable'}</p></>;
  const editable=canWrite && data.status!=='resolved' && !busy && !conversationDirty && !repeatBusy && !reviewDirty;
  return <>
    <button className="back-link" onClick={() => navigate('clarifications')}><ArrowLeft size={18} />Back to clarifications</button>
    <div className="page-header"><div><h1>{data.worker} · {data.status==='resolved' ? 'Resolved' : 'Follow-up needed'}</h1><p>{data.language.toUpperCase()} · briefing v{data.version}</p></div><Status value={data.status} /></div>
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="detail-grid"><section className="panel"><h2>Original response</h2>
      {data.recording_id && <audio controls preload="none" src={`/api/recordings/${encodeURIComponent(data.recording_id)}/audio`} />}
      <p className="source-text">{data.answer_text || 'No submitted answer for this case.'}</p>
      <dl className="audit-fields"><div><dt>Assessment</dt><dd>{data.outcome?.replaceAll('_',' ') || 'Help request'}</dd></div><div><dt>Reason</dt><dd>{data.reason}</dd></div></dl>
      {data.helpRequest && <><h3>Worker help request</h3><p className="source-text">{data.helpRequest.text}</p><time className="muted" dateTime={data.helpRequest.createdAt}>{new Date(data.helpRequest.createdAt).toLocaleString()}</time></>}
    </section><section className="panel"><h2>Question and key facts</h2><p className="question">{data.snapshot.question}</p><ul>{data.snapshot.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section></div>
    <CaseConversation key={`${id}:${session.clientContext}`} caseId={id} session={session} canWrite={canWrite && !busy && !repeatBusy && !reviewDirty} onDirtyChange={setConversationDirty}/>
    {data.canRequestRepeat && <CaseRepeats caseId={id} session={session} canWrite={canWrite && !busy && !conversationDirty && !reviewDirty} closed={data.status==='resolved'} onBusyChange={setRepeatBusy}/>}
    {data.canReview && <CaseReviews caseId={id} session={session} canWrite={canWrite && !data.contentExpired && !busy && !conversationDirty && !repeatBusy} closed={data.status==='resolved'} hasAssessment={!!data.outcome} onDirtyChange={setReviewDirty} onDeadlineChange={dueAt=>setData(current=>current?{...current,case_due_at:dueAt}:current)}/>}
    <section className="panel"><h2>Case owner</h2>{data.case_due_at && <p>Follow-up due <time dateTime={data.case_due_at}>{new Date(data.case_due_at).toLocaleString()}</time>{data.status==='open' && Date.parse(data.case_due_at)<Date.now() ? ' · Overdue' : ''}</p>}{data.escalated_at && <p>Escalated <time dateTime={data.escalated_at}>{new Date(data.escalated_at).toLocaleString()}</time></p>}<label className="field">Supervisor<select value={owner} disabled={!editable} onChange={(event) => setOwner(event.target.value)}><option value="">Unassigned</option>{data.owner_staff_id && !data.owners.some((item) => item.id===data.owner_staff_id) && <option value={data.owner_staff_id}>{data.owner_name || 'Former supervisor'}</option>}{data.owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{canWrite && <button className="button outline" disabled={!editable || owner===(data.owner_staff_id || '')} onClick={() => void save('assign',{ownerId:owner || null})}><UserRoundCheck size={18} />Save owner</button>}</section>
    <section className="panel"><h2>Resolution notes (supervisor only)</h2><label className="field">Follow-up notes<textarea value={notes} disabled={!editable} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={1000} /></label>{canWrite && <button className="button primary" disabled={!editable || notes.trim().length<5} onClick={() => void save('resolve',{notes})}><ShieldCheck size={18} />Save human resolution</button>}<p className="muted">Resolution records follow-up; it does not certify understanding.</p></section>
    {data.attempts.length>0 && <section className="panel"><h2>Recent responses ({data.attempts.length})</h2><div className="row-list">{data.attempts.map((attempt) => <article className="case-attempt" key={attempt.id}><time dateTime={attempt.received_at}>{new Date(attempt.received_at).toLocaleString()}</time><p>{attempt.answer_text}</p><span className="muted">{attempt.outcome?.replaceAll('_',' ') || 'Assessment pending'}</span>{attempt.recording_id && <audio controls preload="none" src={`/api/recordings/${encodeURIComponent(attempt.recording_id)}/audio`} />}</article>)}</div></section>}
  </>;
}
