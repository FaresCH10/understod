import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, LockKeyhole, RefreshCw, Search, X } from 'lucide-react';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';

type Event = { id: string; actor: string; actorType: string; actorId: string; action: string; objectId: string; occurredAt: string;identityExpired?:boolean };
type History = { rows: Event[]; total: number; page: number; pageSize: number; timezone: string; asOf: string; actions: string[] };
type Detail = Event & { timezone: string };

export function AuditPage({ refresh,authority }: { refresh: number;authority:StaffRequestAuthority }) {
  const {request,current:isCurrent}=useStaffRequest(authority);
  const [date, setDate] = useState(''), [search, setSearch] = useState('');
  const [actorType, setActorType] = useState('all'), [action, setAction] = useState('');
  const [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [history, setHistory] = useState<History | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false);
  const query = new URLSearchParams({ date, search, actorType, action, page: String(page), pageSize: '20' }).toString();
  useEffect(() => {
    const controller=new AbortController(),current=()=>isCurrent() && !controller.signal.aborted;
    setLoading(true); setError(''); setSelected(''); setDetail(null);
    request<History>(`/api/audit?${query}`,undefined,controller.signal).then((data) => { if (current()) setHistory(data); })
      .catch((err: Error) => { if (current()) { setHistory(null); setError(err.message); } })
      .finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [query, refresh, reload,request,isCurrent]);
  useEffect(() => {
    const controller=new AbortController(),current=()=>isCurrent() && !controller.signal.aborted;
    setDetail(null); setDetailError(''); setDetailLoading(!!selected);
    if (selected) request<Detail>(`/api/audit/${encodeURIComponent(selected)}`,undefined,controller.signal).then((data) => { if (current()) setDetail(data); })
      .catch((err: Error) => { if (current()) setDetailError(err.message); })
      .finally(() => { if (current()) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected,request,isCurrent]);
  const change = (set: (value: string) => void, value: string) => { set(value); setPage(1); };
  const formatTime = (value: string, timezone = history?.timezone || 'UTC') => new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
  const index = history?.rows.findIndex((row) => row.id === selected) ?? -1;
  const pages = Math.max(1, Math.ceil((history?.total || 0) / 20));
  return <>
    <a className="back-link" href="#reports"><ArrowLeft size={18} />Reports</a>
    <div className="page-header"><div><h1>Activity history</h1><p>{history?.timezone || 'Site activity'}</p></div><div className="actions">
      <button className="icon-button" title="Refresh activity" aria-label="Refresh activity" onClick={() => setReload((value) => value+1)}><RefreshCw size={18} /></button>
      {history && !loading && <a className="button primary" href={`/api/audit.csv?${query}`} download="activity-history.csv"><Download size={18} />Export CSV</a>}
    </div></div>
    <div className="filters audit-filters">
      <label className="select-label">Site date<input type="date" value={date} onChange={(event) => change(setDate,event.target.value)} /></label>
      <label className="search-box"><Search size={18} /><span className="sr-only">Search activity</span><input value={search} maxLength={80} placeholder="Search actors, actions, items" onChange={(event) => change(setSearch,event.target.value)} /></label>
      <label className="select-label">Actor<select value={actorType} onChange={(event) => change(setActorType,event.target.value)}><option value="all">All actors</option><option value="staff">Staff</option><option value="worker">Workers</option><option value="system">System</option></select></label>
      <label className="select-label">Action<select value={action} onChange={(event) => change(setAction,event.target.value)}><option value="">All actions</option>{(history?.actions || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="record-error">{error}</p>}
    <div className={`audit-grid ${selected ? 'audit-with-detail' : ''}`}>
      <section className="panel"><h2>Events {history ? `(${history.total})` : ''}</h2>
        {loading ? <p role="status">Loading activity...</p> : !history?.rows.length ? <p>No events in this filter.</p> : <div className="table-wrap"><table className="audit-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Item</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
          {history.rows.map((row) => <tr key={row.id} className={selected === row.id ? 'selected-row' : ''}><td>{formatTime(row.occurredAt)}</td><td>{row.actor}<small className="muted">{row.actorType}</small></td><td>{row.action}</td><td>{row.identityExpired?'Expired item':row.objectId}</td><td><button className="icon-button" title="View event" aria-label={`View event ${row.id}`} onClick={() => setSelected(row.id)}><ChevronRight size={18} /></button></td></tr>)}
        </tbody></table></div>}
        {history && !loading && <div className="audit-pagination"><span>Page {page} of {pages}</span><div className="actions"><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={page<=1} onClick={() => setPage((value) => value-1)}><ChevronLeft size={18} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={page>=pages} onClick={() => setPage((value) => value+1)}><ChevronRight size={18} /></button></div></div>}
      </section>
      {selected && <aside className="panel audit-detail"><div className="people-panel-heading"><h2>Event details</h2><button className="icon-button" title="Close event" aria-label="Close event" onClick={() => setSelected('')}><X size={18} /></button></div>
        <div className="audit-pagination"><span className="status status-blue"><LockKeyhole size={14} />Read-only log</span><div className="actions"><button className="icon-button" title="Previous event" aria-label="Previous event" disabled={index<=0} onClick={() => setSelected(history!.rows[index-1].id)}><ChevronLeft size={18} /></button><button className="icon-button" title="Next event" aria-label="Next event" disabled={index<0 || index>=(history?.rows.length || 0)-1} onClick={() => setSelected(history!.rows[index+1].id)}><ChevronRight size={18} /></button></div></div>
        {detailLoading ? <p role="status">Loading event...</p> : detailError ? <p role="alert" className="record-error">{detailError}</p> : detail && <dl className="audit-fields">{[
          ['Event ID',detail.id], ['Time',formatTime(detail.occurredAt,detail.timezone)], ['Site time zone',detail.timezone],
          ['Actor',detail.actor], ['Actor type',detail.actorType], ['Actor ID',detail.identityExpired?'Cleared by retention':detail.actorId], ['Action',detail.action], ['Item',detail.identityExpired?'Cleared by retention':detail.objectId],
        ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </aside>}
    </div>
  </>;
}
