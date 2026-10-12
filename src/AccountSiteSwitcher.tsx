import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,ChevronLeft,ChevronRight,MapPin,RefreshCw,X} from 'lucide-react';
type Site={staffId:string;organization:string;site:string;role:string;current:boolean};
type Sites={items:Site[];total:number;page:number;pageSize:number};
const roles:Record<string,string>={owner:'Owner',administrator:'Administrator',supervisor:'Supervisor',auditor:'Read-only auditor'};

export function AccountSiteSwitcher({organization,site,disabled,onSelect}:{organization?:string;site?:string;disabled:boolean;onSelect:(staffId:string)=>Promise<boolean>}) {
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),sending=useRef(false),restoreFocus=useRef(false);
  const [open,setOpen]=useState(false),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[data,setData]=useState<Sites|null>(null),[selected,setSelected]=useState<Site|null>(null),[confirmed,setConfirmed]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!open && !disabled && restoreFocus.current) {restoreFocus.current=false;trigger.current?.focus();}},[open,disabled]);
  useEffect(()=>{if(!open) return;dialog.current?.showModal();return()=>dialog.current?.close();},[open]);
  useEffect(()=>{
    if(!open) return;let current=true;setLoading(true);setData(null);setError('');
    fetch(`/api/account/sites?page=${page}&pageSize=10`,{credentials:'include'}).then(async response=>{
      const value=await response.json();if(!response.ok) throw new Error(value.error || 'Sites unavailable.');
      if(current) setData(value);
    }).catch(err=>{if(current) setError(err.message);}).finally(()=>{if(current) setLoading(false);});
    return()=>{current=false;};
  },[open,page,refresh]);
  function close() {if(sending.current) return;restoreFocus.current=true;dialog.current?.close();setOpen(false);}
  async function submit() {
    if(sending.current || !selected || !confirmed || disabled) return;
    sending.current=true;setBusy(true);setError('');
    try {if(await onSelect(selected.staffId)) {restoreFocus.current=true;dialog.current?.close();setOpen(false);}else {setSelected(null);setConfirmed(false);setPage(1);setRefresh(n=>n+1);setError('Site selection was not confirmed. Your current session was refreshed.');}}
    catch {setError('Site session unavailable. Close this dialog and recheck your session.');}
    finally {sending.current=false;setBusy(false);}
  }
  return <><button ref={trigger} className="site-label account-site-trigger" aria-label={`Change site: ${organization}, ${site}`} disabled={disabled} onClick={()=>{setPage(1);setSelected(null);setConfirmed(false);setError('');setOpen(true);}}><MapPin size={18}/><span>{organization} · {site}</span><ChevronDown size={17}/></button>
    {open && <dialog ref={dialog} className="withdraw-dialog account-site-dialog" aria-labelledby="account-sites-title" onCancel={event=>{event.preventDefault();close();}}>
      <div className="page-header"><h2 id="account-sites-title">Choose site</h2><div className="actions"><button className="icon-button" title="Refresh sites" aria-label="Refresh sites" disabled={busy || disabled || loading} onClick={()=>{setSelected(null);setConfirmed(false);setPage(1);setRefresh(n=>n+1);}}><RefreshCw size={18}/></button><button autoFocus className="icon-button" title="Close site selection" aria-label="Close site selection" disabled={busy} onClick={close}><X size={20}/></button></div></div>
      {loading && <p role="status">Loading sites...</p>}{error && <p role="alert" className="record-error">{error}</p>}
      {data && <><div className="account-site-list">{data.items.map(item=><label key={item.staffId} className="account-site-option"><input type="radio" name="account-site" value={item.staffId} checked={selected?.staffId===item.staffId} disabled={busy || disabled || item.current} onChange={()=>{setSelected(item);setConfirmed(false);}}/><span><strong dir="auto">{item.organization} · {item.site}</strong><small>{roles[item.role] || item.role}</small></span>{item.current && <span className="account-current"><Check size={17}/>Current</span>}</label>)}</div>
        {!data.total && <p>No active sites are available.</p>}<div className="audit-pagination"><span>Page {page} of {Math.max(1,Math.ceil(data.total/10))}</span><div className="actions"><button className="icon-button" aria-label="Previous sites" title="Previous sites" disabled={busy || disabled || page<=1} onClick={()=>{setPage(n=>n-1);setSelected(null);setConfirmed(false);}}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next sites" title="Next sites" disabled={busy || disabled || page*10>=data.total} onClick={()=>{setPage(n=>n+1);setSelected(null);setConfirmed(false);}}><ChevronRight size={18}/></button></div></div>
      </>}
      {selected && <><p>Switch to <strong dir="auto">{selected.organization} · {selected.site}</strong> as {roles[selected.role] || selected.role}?</p><label className="billing-confirm"><input type="checkbox" checked={confirmed} disabled={busy || disabled} onChange={event=>setConfirmed(event.target.checked)}/><span>I am ready to leave this site. Unsaved edits will close.</span></label></>}
      <div className="actions"><button className="button outline" disabled={busy} onClick={close}>Cancel</button><button className="button primary" disabled={busy || disabled || loading || !selected || !confirmed} onClick={()=>void submit()}><MapPin size={18}/>{busy ? 'Switching...' : 'Switch site'}</button></div>
    </dialog>}
  </>;
}
