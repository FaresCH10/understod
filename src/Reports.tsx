import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileText, History, RefreshCw, Search, TriangleAlert, Users } from 'lucide-react';

type Counts = { assigned: number; responses: number; matches: number; clarifications: number; unassessed: number; pending: number; completion: number };
type Publication = { id: string; title: string; version: number; state: string };
type PublicationPage = {items:(Publication & {publishedAt:string})[];total:number;page:number;pageSize:number;timezone:string};
type ReportFilters={crewId:string;responseFrom:string;responseThrough:string};
type Report = { title: string; publicationId: string; version: number; metrics: Counts | null; timezone: string; asOf: string;
  filters?:ReportFilters;crewSnapshotAvailable?:boolean;availableCrews?:{id:string;name:string}[];
  availablePublications: Publication[]; languages: { language: string; assigned: number; received: number; completion: number }[] };
type Export = { id: string; status: string; createdAt: string; expiresAt: string; filename: string; attempts: number; error: string | null;filters?:ReportFilters & {timezone?:string} };

async function request<T>(path: string, body?: unknown, signal?:AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'include',cache:'no-store',signal, ...(body ? { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const languageNames: Record<string, string> = { en: 'English (EN)', ar: 'Arabic (AR)', ur: 'Urdu (UR)' };

function PublicationHistory({onSelect,disabled}:{onSelect:(id:string)=>void;disabled:boolean}) {
  const [filters,setFilters]=useState({search:'',from:'',through:''}),[page,setPage]=useState(1),[tick,setTick]=useState(0);
  const [data,setData]=useState<PublicationPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setData(null);setError('');
    void request<PublicationPage>(`/reports/publications?${new URLSearchParams({...filters,page:String(page),pageSize:'20'})}`,undefined,controller.signal)
      .then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch((err:Error)=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[filters,page,tick]);
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  const date=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:data?.timezone || 'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  return <section className="report-publication-history" aria-label="Publication history">
    <div className="people-panel-heading"><h2>Publication history</h2><button className="icon-button" title="Refresh publication history" aria-label="Refresh publication history" disabled={loading || disabled} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button></div>
    <form className="filters" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);setPage(1);setFilters({search:String(values.get('search') || ''),from:String(values.get('from') || ''),through:String(values.get('through') || '')});}}>
      <label className="select-label">Title<input name="search" type="search" maxLength={120} disabled={disabled}/></label>
      <label className="select-label">Published from<input name="from" type="date" disabled={disabled}/></label>
      <label className="select-label">Published through<input name="through" type="date" disabled={disabled}/></label>
      <button className="icon-button" type="submit" aria-label="Apply publication filters" title="Apply publication filters" disabled={disabled}><Search size={20}/></button>
    </form>
    {data && <p className="muted">{data.timezone} · {data.total} published {data.total===1?'version':'versions'}</p>}
    {loading ? <p role="status">Loading publication history...</p> : error ? <p role="alert" className="record-error">{error}</p> : <>
      <ul className="report-publication-list">{data?.items.map(item=><li key={item.id}><button className="publication-choice" disabled={disabled} onClick={()=>onSelect(item.id)}><FileText size={20}/><span><strong>{item.title} · v{item.version}</strong><small>{item.state} · {date(item.publishedAt)}</small></span><ChevronRight size={18}/></button></li>)}</ul>
      {!data?.items.length && <p>{page>pages?'This page is no longer available.':'No published versions match these filters.'}</p>}
      {data && <div className="audit-pagination"><span>Page {page} of {pages}</span><div className="actions"><button className="icon-button" aria-label="Previous publication page" title="Previous publication page" disabled={disabled || page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next publication page" title="Next publication page" disabled={disabled || page>=pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button>{page>pages && <button className="button outline" disabled={disabled} onClick={()=>setPage(1)}>First page</button>}</div></div>}
    </>}
  </section>;
}

export function ReportsPage({ refresh }: { refresh: number }) {
  const [publicationId, setPublicationId] = useState('');
  const [filters,setFilters]=useState<ReportFilters>({crewId:'',responseFrom:'',responseThrough:''});
  const [chosenFilters,setChosenFilters]=useState<ReportFilters>({crewId:'',responseFrom:'',responseThrough:''});
  const [report, setReport] = useState<Report | null>(null);
  const [exports, setExports] = useState<Export[]>([]);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [reportRefresh,setReportRefresh]=useState(0);
  const historyTrigger=useRef<HTMLButtonElement>(null);
  const requestKey = useRef<{ publicationId: string; requestId: string;filters:ReportFilters } | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    request<Report>(`/reports?${new URLSearchParams({...filters,...(publicationId?{publicationId}:{})})}`)
      .then((data) => { if (current) setReport(data); })
      .catch((err: Error) => { if (current) { setReport(null); setError(err.message); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [publicationId, refresh,filters,reportRefresh]);
  useEffect(() => {
    let current = true;
    let timer: number;
    const load = async () => {
      try {
        const rows = await request<Export[]>('/reports/exports');
        if (!current) return;
        setExports(rows); setExportError('');
        timer = window.setTimeout(load, rows.some((row) => ['queued', 'processing'].includes(row.status)) ? 1500 : 60_000);
      } catch (err) { if (current) { setExportError((err as Error).message); timer = window.setTimeout(load, 60_000); } }
    };
    void load();
    return () => { current = false; window.clearTimeout(timer); };
  }, [refresh, historyRefresh]);
  const exportReport = async () => {
    if (!report?.publicationId || sending.current) return;
    sending.current = true; setBusy(true); setExportError(''); setMessage('');
    if (requestKey.current?.publicationId !== report.publicationId || JSON.stringify(requestKey.current?.filters)!==JSON.stringify(filters)) requestKey.current = { publicationId: report.publicationId, requestId: crypto.randomUUID(),filters };
    try {
      const result = await request<Export>('/reports/exports', requestKey.current);
      setMessage(result.status === 'ready' ? 'Export is ready to download.' : `Export ${result.status}.`);
      requestKey.current = null;
      setHistoryRefresh((value) => value + 1);
    } catch (err) { setExportError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  };
  const retry = async (id: string) => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setExportError('');
    try { await request(`/reports/exports/${id}/retry`, {}); setMessage('Export queued.'); setHistoryRefresh((value) => value + 1); }
    catch (err) { setExportError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  };
  const date = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: report?.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const m = report?.metrics;
  const windowed=Boolean(filters.responseFrom || filters.responseThrough);
  const width = (count: number) => `${m?.assigned ? count / m.assigned * 100 : 0}%`;
  return <>
    <div className="page-header"><div><h1>Briefing activity</h1><p>{report?.title ? `${report.title} · Published v${report.version}` : 'Response activity at this site'}</p></div>
      <div className="actions"><a className="button outline" href="#reports/activity"><History size={18} />Activity history</a><button className="button primary" onClick={() => void exportReport()} disabled={loading || busy || !m}><Download size={18} />{busy ? 'Queuing...' : 'Export CSV'}</button></div>
    </div>
    <div className="filters"><button ref={historyTrigger} className="button outline" disabled={busy} aria-expanded={historyOpen} aria-controls="report-publication-history" onClick={()=>setHistoryOpen(value=>!value)}><History size={18}/>Briefing version<ChevronDown size={18}/></button>
      {report?.asOf && <span className="report-date">{date(report.asOf)} · {report.timezone}</span>}</div>
    {historyOpen && <div id="report-publication-history"><PublicationHistory disabled={busy} onSelect={id=>{setPublicationId(id);setFilters(value=>({...value,crewId:''}));setChosenFilters(value=>({...value,crewId:''}));setHistoryOpen(false);historyTrigger.current?.focus();}}/></div>}
    <form className="filters report-scope-filters" onSubmit={event=>{event.preventDefault();if(!busy && !loading)setFilters({...chosenFilters});}}>
      <label className="select-label">Crew at publication<select value={chosenFilters.crewId} disabled={busy || loading || !report?.crewSnapshotAvailable} onChange={event=>setChosenFilters(value=>({...value,crewId:event.target.value}))}><option value="">All assigned workers</option>{report?.availableCrews?.map(crew=><option key={crew.id} value={crew.id}>{crew.name}</option>)}{report?.crewSnapshotAvailable && <option value="@unassigned">No crew</option>}</select></label>
      <label className="select-label">Latest response from<input type="date" value={chosenFilters.responseFrom} disabled={busy || loading || !report?.filters} onChange={event=>setChosenFilters(value=>({...value,responseFrom:event.target.value}))}/></label>
      <label className="select-label">Latest response through<input type="date" min={chosenFilters.responseFrom || undefined} value={chosenFilters.responseThrough} disabled={busy || loading || !report?.filters} onChange={event=>setChosenFilters(value=>({...value,responseThrough:event.target.value}))}/></label>
      <button className="icon-button" type="submit" aria-label="Apply report filters" title="Apply report filters" disabled={busy || loading || !report?.filters}><Search size={20}/></button>
      <button className="icon-button" type="button" aria-label="Clear report filters" title="Clear report filters" disabled={busy || loading} onClick={()=>{const empty={crewId:'',responseFrom:'',responseThrough:''};setChosenFilters(empty);setFilters(empty);}}><RefreshCw size={18}/></button>
    </form>
    {report?.filters && !report.crewSnapshotAvailable && <p className="muted">Historical crew snapshot unavailable for this version.</p>}
    {windowed && <p className="report-date">Latest-response window: {filters.responseFrom || 'Start'} to {filters.responseThrough || 'Present'} · {report?.timezone}</p>}
    {loading ? <p>Loading report...</p> : error ? <div className="actions"><p role="alert" className="record-error">{error}</p><button className="icon-button" title="Retry report" aria-label="Retry report" disabled={busy} onClick={()=>setReportRefresh(value=>value+1)}><RefreshCw size={18}/></button></div> : !m ? <p>No published briefing is available.</p> : <>
      <div className="metrics">{[
        { icon: FileText, value: m.assigned, label: 'assigned' }, { icon: Users, value: m.responses, label: 'responses' },
        { icon: CheckCircle2, value: m.matches, label: 'match key facts' }, { icon: TriangleAlert, value: m.clarifications, label: 'need clarification' },
        { icon: Clock3, value: m.pending, label: windowed?'no response in window':'awaiting response' },
      ].map(({ icon: Icon, value, label }, index) => <div className={`metric ${index === 3 ? 'metric-warn' : ''}`} key={label}><div className="metric-icon"><Icon size={28} /></div><div><strong>{value}</strong><span>{label}</span></div></div>)}</div>
      <section className="panel"><h2>Response status</h2><div className="report-bar"><span style={{ width: width(m.matches) }} /><span style={{ width: width(m.clarifications) }} /><span style={{ width: width(m.unassessed) }} /><span style={{ width: width(m.pending) }} /></div>
        <div className="report-bottom"><div className="legend"><span><i className="dot green" />{m.matches} match the rubric</span><span><i className="dot amber" />{m.clarifications} need clarification</span><span><i className="dot blue" />{m.unassessed} awaiting assessment</span><span><i className="dot grey" />{m.pending} {windowed?'no response in window':'awaiting response'}</span></div><strong>{m.completion}% <small>response completion</small></strong></div>
      </section>
    </>}
    {message && <p role="status">{message}</p>}
    <div className="report-grid">
      {m && <section className="panel"><h2>Language breakdown</h2><div className="table-wrap"><table className="language-table"><thead><tr><th>Assignment language</th><th>Assigned</th><th>Received</th><th>Completion</th></tr></thead><tbody>{report.languages.map((row) => <tr key={row.language}><td>{languageNames[row.language] || row.language}</td><td>{row.assigned}</td><td>{row.received}</td><td><div className="language-completion"><span>{row.completion}%</span><meter min="0" max="100" value={row.completion} aria-label={`${row.language} response completion`} /></div></td></tr>)}</tbody></table></div></section>}
      <section className="panel export-history"><div className="people-panel-heading"><h2>Export history</h2><button className="icon-button" title="Refresh exports" aria-label="Refresh exports" onClick={() => setHistoryRefresh((value) => value + 1)}><RefreshCw size={18} /></button></div>
        {exportError && <p role="alert" className="record-error">{exportError}</p>}
        {!exports.length ? <p>No exports requested.</p> : <ul className="export-list">{exports.map((item) => <li key={item.id}><FileText size={24} /><div className="export-info"><strong>{item.filename}</strong><span className={`status status-${item.status === 'ready' ? 'green' : item.status === 'failed' ? 'red' : 'blue'}`}>{item.status}</span><small>{date(item.createdAt)}</small>{(item.filters?.responseFrom || item.filters?.responseThrough) && <small>Latest responses: {item.filters.responseFrom || 'Start'} to {item.filters.responseThrough || 'Present'} · {item.filters.timezone || report?.timezone}</small>}{item.filters?.crewId && <small>Crew-filtered audience</small>}{item.status === 'ready' && <small>Expires {date(item.expiresAt)}</small>}{item.error && <small>{item.error}</small>}</div>
          {item.status === 'ready' && <a className="button outline" href={`/api/reports/exports/${item.id}/download`} download={item.filename}><Download size={16} />Download</a>}
          {item.status === 'failed' && item.attempts < 3 && <button className="button outline" disabled={busy} onClick={() => void retry(item.id)}><RefreshCw size={16} />Retry</button>}
        </li>)}</ul>}
      </section>
    </div>
    <div className="notice"><TriangleAlert size={22} /><span>Response status is not proof of safe work or internal understanding.</span></div>
  </>;
}
