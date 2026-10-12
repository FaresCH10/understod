import {useEffect,useRef,useState} from 'react';
import {Bell,Check,ChevronLeft,ChevronRight,ExternalLink,RefreshCw} from 'lucide-react';

type Item={id:string;kind:string;label:string;destination:string;occurredAt:string;readAt:string|null};
type Page={items:Item[];total:number;unread:number;page:number;pageSize:number;asOf:string;since:string};
async function request(path:string,signal?:AbortSignal,read=false) {
  const response=await fetch(`/api/notifications${path}`,{credentials:'include',cache:'no-store',signal,...(read?{method:'POST',headers:{'content-type':'application/json'},body:'{}'}:{})});
  if(!response.ok)throw Error('Notifications unavailable. Refresh to check the current status.');
  return response.json();
}
export function Notifications({refresh,navigate,timezone}:{refresh:number;navigate:(path:string)=>void;timezone?:string}) {
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[tick,setTick]=useState(0);
  const [data,setData]=useState<Page|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const flight=useRef(false),live=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setData(null);setError('');
    void request(`?${new URLSearchParams({status,page:String(page),pageSize:'20'})}`,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(()=>{if(!controller.signal.aborted)setError('Notifications could not be refreshed. No read status is confirmed.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[status,page,tick,refresh]);
  const markRead=async(item:Item)=>{
    if(flight.current || item.readAt)return;
    flight.current=true;setBusy(item.id);setError('');
    try {
      const receipt=await request(`/${encodeURIComponent(item.id)}/read`,undefined,true) as Item;
      if(receipt.id!==item.id || receipt.kind!==item.kind || !receipt.readAt || !Number.isFinite(Date.parse(receipt.readAt)))throw Error('Unverified receipt');
      if(live.current)setTick(value=>value+1);
    }catch {if(live.current)setError('Read status is unconfirmed. Refresh before retrying; an accepted read keeps its original timestamp.');}
    finally {flight.current=false;if(live.current)setBusy('');}
  };
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  const date=(value:string)=>new Intl.DateTimeFormat('en',{timeZone:timezone || 'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  return <>
    <div className="page-header"><div><h1>Notifications</h1><p>Recent activity for this site.</p></div><button className="icon-button" aria-label="Refresh notifications" title="Refresh notifications" disabled={loading || !!busy} onClick={()=>setTick(value=>value+1)}><RefreshCw size={20}/></button></div>
    <div className="filters"><label className="select-label">Status<select value={status} disabled={!!busy} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">All</option><option value="unread">Unread</option></select></label>{data && <p role="status">{data.unread} unread</p>}</div>
    {error && <p role="alert" className="record-error">{error}</p>}
    <section className="notification-list" aria-label="Site notifications" aria-busy={loading}>
      {loading ? <p role="status">Loading notifications...</p> : data?.items.length ? data.items.map(item=><article className="notification-row" key={item.id}>
        <Bell size={20} aria-hidden="true"/><div className="item-main"><strong>{item.label}</strong><small><time dateTime={item.occurredAt}>{date(item.occurredAt)}</time> · {item.readAt?'Read':'Unread'}</small>{item.readAt && <small>Marked read <time dateTime={item.readAt}>{date(item.readAt)}</time></small>}</div>
        <div className="actions"><button className="icon-button" title={`Open ${item.label}`} aria-label={`Open ${item.label}`} disabled={!!busy} onClick={()=>{if(['briefings','clarifications','reports'].includes(item.destination))navigate(item.destination);}}><ExternalLink size={18}/></button>
          <button className="icon-button" title={`Mark read: ${item.label}`} aria-label={`Mark read: ${item.label}`} disabled={loading || !!busy || !!item.readAt} onClick={()=>void markRead(item)}><Check size={18}/></button></div>
      </article>) : !error && <p>{page>pages?'This page is no longer available.':'No notifications match this filter.'}</p>}
    </section>
    {data && !loading && <div className="audit-pagination"><span>Page {page} of {pages} · {data.total} notifications</span><div className="actions"><button className="icon-button" aria-label="Previous notification page" title="Previous notification page" disabled={!!busy || page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next notification page" title="Next notification page" disabled={!!busy || page>=pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button>{page>pages && <button className="button outline" onClick={()=>setPage(1)}>First page</button>}</div></div>}
    <p className="muted">Last 90 days. Marking read does not confirm delivery, follow-up or understanding. Email, push and scheduled reminders are not connected.</p>
  </>;
}
