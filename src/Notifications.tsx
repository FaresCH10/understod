import {useEffect,useState} from 'react';
import {Bell,Check,ChevronLeft,ChevronRight,ExternalLink,RefreshCw} from 'lucide-react';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';
import {useArtifactMutation} from './useArtifactMutation';
import type {ArtifactDefinition} from './useArtifactRequest';
import {checkedArtifactScope} from './artifact-request';
import {notificationRoles} from '../server/notification-input.mjs';
import {checkedNotificationPage,checkedNotificationResult,checkedNotificationReceipt,readPendingNotification,savePendingNotification,clearPendingNotification,type NotificationItem,type NotificationPage,type PendingNotification} from './notification-recovery';

const definition:ArtifactDefinition<PendingNotification,NotificationItem>={endpoint:'/api/notifications',roles:notificationRoles,
  path:value=>`/${encodeURIComponent(value.requestId)}/read`,receiptPath:value=>`/${encodeURIComponent(value.requestId)}/receipt`,payload:()=>({}),
  result:checkedNotificationResult,receipt:checkedNotificationReceipt,clear:clearPendingNotification};
export function Notifications({refresh,navigate,timezone,authority}:{refresh:number;navigate:(path:string)=>void;timezone?:string;authority:StaffRequestAuthority}) {
  const {request,current}=useStaffRequest(authority),scope=authority.session.staffScope;
  const [recovery]=useState(()=>{try{return {pending:readPendingNotification(sessionStorage,checkedArtifactScope(scope,authority.session,notificationRoles)),error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}});
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[tick,setTick]=useState(0);
  const [data,setData]=useState<NotificationPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const operation=useArtifactMutation(authority,scope,definition,savePendingNotification,notificationRoles.includes(authority.session.staffRole || ''),result=>{
    setMessage(`Read status verified: ${result.label}.`);setTick(value=>value+1);
  },recovery.pending);
  const {busy}=operation,blocked=busy || !!operation.pending.current || !!recovery.error;
  useEffect(()=>{
    if(!recovery.pending)return;
    const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void operation.check(controller.signal);});
    return()=>controller.abort();
  },[operation.api,recovery.pending]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setData(null);setError('');
    const live=()=>current() && !controller.signal.aborted;
    void request(`/api/notifications?${new URLSearchParams({status,page:String(page),pageSize:'20'})}`,undefined,controller.signal)
      .then(value=>{const verified=checkedNotificationPage(value,page,status);if(live())setData(verified);})
      .catch(reason=>{if(live())setError(reason.message);}).finally(()=>{if(live())setLoading(false);});
    return()=>controller.abort();
  },[status,page,tick,refresh,request,current]);
  const markRead=async(item:NotificationItem)=>{
    if(blocked || item.readAt || !current())return;
    setMessage('');await operation.write({requestId:item.id,body:{},item:structuredClone(item)});
  };
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  const date=(value:string)=>new Intl.DateTimeFormat('en',{timeZone:timezone || 'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  return <>
    <div className="page-header"><div><h1>Notifications</h1><p>Recent activity for this site.</p></div><button className="icon-button" aria-label="Refresh notifications" title="Refresh notifications" disabled={loading || !!busy} onClick={()=>setTick(value=>value+1)}><RefreshCw size={20}/></button></div>
    <div className="filters"><label className="select-label">Status<select value={status} disabled={!!busy} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">All</option><option value="unread">Unread</option></select></label>{data && <p role="status">{data.unread} unread</p>}</div>
    {error && <p role="alert" className="record-error">{error}</p>}
    {recovery.error && <p role="alert" className="record-error">{recovery.error}</p>}
    {operation.error && <p role="alert" className="record-error">{operation.error}</p>}
    {message && <p role="status">{message}</p>}
    {operation.pending.current && <section className="notification-recovery" aria-label="Saved notification read"><h2>Recover read status</h2><p>{operation.pending.current.item.label}</p><p><time dateTime={operation.pending.current.item.occurredAt}>{date(operation.pending.current.item.occurredAt)}</time></p><div className="actions"><button className="button outline" disabled={busy} onClick={()=>void operation.check()}><RefreshCw size={18}/>Check read status</button>{operation.checked && <button className="button primary" disabled={busy} onClick={()=>void operation.write(operation.pending.current!)}><Check size={18}/>Retry original mark read</button>}</div></section>}
    <section className="notification-list" aria-label="Site notifications" aria-busy={loading}>
      {loading ? <p role="status">Loading notifications...</p> : data?.items.length ? data.items.map(item=><article className="notification-row" key={item.id}>
        <Bell size={20} aria-hidden="true"/><div className="item-main"><strong>{item.label}</strong><small><time dateTime={item.occurredAt}>{date(item.occurredAt)}</time> · {item.readAt?'Read':'Unread'}</small>{item.readAt && <small>Marked read <time dateTime={item.readAt}>{date(item.readAt)}</time></small>}</div>
        <div className="actions"><button className="icon-button" title={`Open ${item.label}`} aria-label={`Open ${item.label}`} disabled={!!busy} onClick={()=>{if(current() && ['briefings','clarifications','reports'].includes(item.destination))navigate(item.destination);}}><ExternalLink size={18}/></button>
          <button className="icon-button" title={`Mark read: ${item.label}`} aria-label={`Mark read: ${item.label}`} disabled={loading || blocked || !!item.readAt} onClick={()=>void markRead(item)}><Check size={18}/></button></div>
      </article>) : !error && <p>{page>pages?'This page is no longer available.':'No notifications match this filter.'}</p>}
    </section>
    {data && !loading && <div className="audit-pagination"><span>Page {page} of {pages} · {data.total} notifications</span><div className="actions"><button className="icon-button" aria-label="Previous notification page" title="Previous notification page" disabled={!!busy || page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next notification page" title="Next notification page" disabled={!!busy || page>=pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button>{page>pages && <button className="button outline" onClick={()=>setPage(1)}>First page</button>}</div></div>}
    <p className="muted">Last 90 days. Marking read does not confirm delivery, follow-up or understanding. Email, push and scheduled reminders are not connected.</p>
  </>;
}
