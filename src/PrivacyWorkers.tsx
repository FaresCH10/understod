import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,RefreshCw,Search,UserRound} from 'lucide-react';
import {WorkerDeletion} from './WorkerDeletion';

type Worker={id:string;code:string;active:boolean;deletion_status:'none'|'queued'|'complete';requested_at:string|null;completed_at:string|null};
type WorkerPage={items:Worker[];total:number;page:number;pageSize:number};
const statusLabel={none:'No request',queued:'Queued',complete:'Server cleanup complete'};

export function PrivacyWorkers(){
  const [data,setData]=useState<WorkerPage|null>(null),[selected,setSelected]=useState<Worker|null>(null);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const query=new URLSearchParams({search,status,page:String(page),pageSize:'5'});
    void fetch(`/api/privacy/workers?${query}`,{credentials:'include',signal:controller.signal}).then(async response=>{
      const result=await response.json();if(!response.ok)throw new Error(result.error || 'Worker data requests unavailable');
      if(controller.signal.aborted)return;
      setData(result);setSelected(current=>result.items.find((worker:Worker)=>worker.id===current?.id) || current || result.items[0] || null);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[search,status,page,refresh]);
  const pages=Math.max(1,Math.ceil((data?.total || 0)/5));
  return <div className="people-layout privacy-workers-layout">
    <section className="panel" aria-label="Worker data requests">
      <div className="people-panel-heading"><h2>Worker data requests</h2><button className="icon-button" title="Refresh worker data requests" aria-label="Refresh worker data requests" disabled={loading} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={18}/></button></div>
      <div className="filters"><label className="search-box"><Search size={18}/><span className="sr-only">Find worker data</span><input type="search" value={search} maxLength={80} onChange={event=>{setSearch(event.target.value);setPage(1);setSelected(null);}}/></label>
        <label className="select-label">Request status<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);setSelected(null);}}><option value="all">All workers</option><option value="none">No request</option><option value="queued">Queued</option><option value="complete">Server cleanup complete</option></select></label></div>
      {error?<p className="record-error" role="alert">{error}</p>:loading?<p role="status">Loading worker data requests...</p>:data?.items.length?<div className="table-wrap"><table className="privacy-workers-table"><thead><tr><th>Worker</th><th>Request status</th></tr></thead>
        <tbody>{data.items.map(worker=><tr key={worker.id} className={selected?.id===worker.id?'people-selection':''}><td><button className="people-row-button" aria-pressed={selected?.id===worker.id} disabled={loading} onClick={()=>setSelected(worker)}><UserRound size={18}/><bdi>{worker.code}</bdi></button><small className="muted">{worker.active?'Active':'Disabled'}</small></td><td>{statusLabel[worker.deletion_status]}</td></tr>)}</tbody></table></div>:<p role="status">No workers match these filters.</p>}
      <div className="people-pagination"><span>{data?.total || 0} workers · Page {page} of {pages}</span><div><button className="icon-button" title="Previous worker data page" aria-label="Previous worker data page" disabled={loading || !!error || page<=1} onClick={()=>{setSelected(null);setPage(page-1);}}><ChevronLeft size={18}/></button><button className="icon-button" title="Next worker data page" aria-label="Next worker data page" disabled={loading || !!error || page>=pages} onClick={()=>{setSelected(null);setPage(page+1);}}><ChevronRight size={18}/></button>{page>pages&&!loading&&!error&&<button className="button subtle" onClick={()=>{setPage(1);setSelected(null);}}>First page</button>}</div></div>
    </section>
    {selected&&!error&&<WorkerDeletion key={selected.id} workerId={selected.id} code={selected.code} refresh={refresh} onLocked={()=>{}} onQueued={()=>setRefresh(value=>value+1)}/>}
  </div>;
}
