import { useEffect,useRef,useState } from 'react';
import { Check,ChevronLeft,ChevronRight,Copy,Eye,EyeOff,Link,RefreshCw,ShieldOff,X } from 'lucide-react';
import { keepDialogFocus } from './dialog-focus';
import { workerAccessLink } from './worker-access';

type Grant={id:string;workerId:string;createdAt:string;expiresAt:string;redeemedAt:string|null;revokedAt:string|null;status:'available'|'redeemed'|'expired'|'revoked'};
type GrantPage={items:Grant[];total:number;page:number;pageSize:number;asOf:string;workerActive:boolean};
const statusText={available:'Not yet used',redeemed:'Used to sign in',expired:'Expired',revoked:'Revoked'};
async function accessApi<T>(path:string,method='GET',body?:object):Promise<T> {
  const response=await fetch(`/api${path}`,{method,credentials:'include',headers:body ? {'content-type':'application/json'} : undefined,body:body ? JSON.stringify(body) : undefined});
  const data=await response.json();if(!response.ok) throw new Error(data.error || 'Request failed');return data;
}

export function WorkerAccess({workerId,code,active,credentialAccess}:{workerId:string;code:string;active:boolean;credentialAccess:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
  const [open,setOpen]=useState(false),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [data,setData]=useState<GrantPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[minutes,setMinutes]=useState(240),[confirmed,setConfirmed]=useState(false);
  const [action,setAction]=useState<'issue'|Grant|null>(null),[link,setLink]=useState(''),[visible,setVisible]=useState(false);
  useEffect(() => {if(open && !busy) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();},[busy,open]);
  useEffect(() => {
    if(!open || !credentialAccess) return;
    let current=true;setLoading(true);setData(null);
    accessApi<GrantPage>(`/people/workers/${encodeURIComponent(workerId)}/access?page=${page}&pageSize=5`)
      .then((result) => {if(current) {setData(result);setError('');}}).catch((reason:Error) => {if(current) setError(reason.message);})
      .finally(() => {if(current) setLoading(false);});
    return () => {current=false;};
  },[workerId,open,credentialAccess,page,revision]);
  function closeState() {setOpen(false);setLink('');setVisible(false);setAction(null);setConfirmed(false);setMessage('');setError('');}
  async function save(event:React.FormEvent) {
    event.preventDefault();if(inFlight.current || !confirmed || !action) return;
    inFlight.current=true;setBusy(true);setError('');setLink('');setMessage('');
    try {
      if(action==='issue') {
        const grant=await accessApi<{token:string;expiresAt:string}>('/worker-grants','POST',{workerId,expiresInMinutes:minutes});
        setLink(workerAccessLink(location.origin,grant.token));setVisible(false);
        setMessage(`Access link issued. Expires ${new Date(grant.expiresAt).toLocaleString()}.`);
      } else {
        await accessApi(`/worker-grants/${encodeURIComponent(action.id)}/revoke`,'POST',{});setMessage('Access link and its sessions revoked.');
      }
      setAction(null);setConfirmed(false);setPage(1);setRevision((n) => n+1);
    } catch(reason) {setError(action==='issue' ? `${(reason as Error).message}. No link was returned. Refresh status before explicitly issuing a replacement; it will revoke earlier access.` : (reason as Error).message);setAction(null);setConfirmed(false);}
    finally {inFlight.current=false;setBusy(false);}
  }
  const pages=Math.max(1,Math.ceil((data?.total || 0)/5));
  return <section className="panel worker-access-panel"><h2>Worker access</h2>
    {credentialAccess ? <button className="button outline full" onClick={() => {setOpen(true);setPage(1);dialog.current?.showModal();}}><Link size={18}/>Manage access links</button> : <p>Private access links are unavailable in profile-demo mode.</p>}
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby={`access-title-${workerId}`} onKeyDown={keepDialogFocus} onCancel={(event) => {if(inFlight.current) event.preventDefault();}} onClose={closeState}>
      <div className="withdraw-heading"><h2 id={`access-title-${workerId}`}>{code} · Access links</h2><button autoFocus className="icon-button" title="Close access links" aria-label="Close access links" disabled={busy} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
      {error && <p role="alert" className="record-error">{error}</p>}{message && <p role="status" className="notice notice-green">{message}</p>}
      {link && <div className="access-link-result"><label className="field">Private one-time link<input type={visible ? 'text' : 'password'} readOnly value={link} autoComplete="off" spellCheck={false}/></label><div className="actions"><button className="icon-button" title={visible ? 'Hide link' : 'Show link'} aria-label={visible ? 'Hide link' : 'Show link'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19}/> : <Eye size={19}/>}</button><button className="button outline" onClick={() => {void navigator.clipboard.writeText(link).then(() => setMessage('Private link copied.')).catch(() => setError('Could not copy the link. Select it from the field.'));}}><Copy size={18}/>Copy link</button><button className="button subtle" onClick={() => {setLink('');setVisible(false);dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();}}>Dismiss link</button></div><p>The link is shown only in this session. Anyone holding it can sign in once as {code}. Share it privately.</p></div>}
      {loading ? <p role="status">Loading access status...</p> : data && <><ul className="access-grant-list">{data.items.map((grant) => <li key={grant.id}><div><strong>{statusText[grant.status]}</strong><p>Issued {new Date(grant.createdAt).toLocaleString()}<br/>Expires {new Date(grant.expiresAt).toLocaleString()}</p></div>{grant.status!=='revoked' && <button className="icon-button" title="Revoke this access link" aria-label={`Revoke link issued ${new Date(grant.createdAt).toLocaleString()}`} disabled={busy} onClick={() => {setAction(grant);setConfirmed(false);setLink('');setMessage('');}}><ShieldOff size={19}/></button>}</li>)}</ul>{!data.items.length && <p>No access links on this page.</p>}<div className="access-pagination"><span>Page {page} of {pages} · {data.total} links</span><div className="actions"><button className="icon-button" title="Previous access links" aria-label="Previous access links" disabled={busy || page<=1} onClick={() => {setAction(null);setConfirmed(false);setPage(page-1);}}><ChevronLeft size={18}/></button><button className="icon-button" title="Next access links" aria-label="Next access links" disabled={busy || page>=pages} onClick={() => {setAction(null);setConfirmed(false);setPage(page+1);}}><ChevronRight size={18}/></button></div></div></>}
      <div className="actions"><button className="button outline" disabled={busy || loading} onClick={() => {setAction(null);setConfirmed(false);setRevision((n) => n+1);}}><RefreshCw size={18}/>Refresh status</button><button className="button primary" disabled={busy || loading || !data || !active || !data.workerActive} onClick={() => {setAction('issue');setConfirmed(false);setLink('');setMessage('');}}><Link size={18}/>Issue new link</button></div>
      {action && <form onSubmit={(event) => void save(event)}><p className="crew-impact">{action==='issue' ? `Issue a new link for ${code}? Existing links and active worker sessions will be revoked. Assignments and responses remain unchanged.` : 'Revoke this link and every session opened with it? Existing assignments and responses remain unchanged.'}</p>{action==='issue' && <label className="field">Link validity<select value={minutes} disabled={busy} onChange={(event) => {setMinutes(Number(event.target.value));setConfirmed(false);}}><option value={30}>30 minutes</option><option value={240}>4 hours</option><option value={1440}>24 hours</option></select></label>}<label className="recipient-row publish-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)}/><span>{action==='issue' ? `Issue private access for ${code} and replace existing access` : 'Revoke this link and its sessions'}</span></label><div className="actions"><button type="button" className="button outline" disabled={busy} onClick={() => {setAction(null);setConfirmed(false);dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();}}>Cancel</button><button type="submit" className={`button ${action==='issue' ? 'primary' : 'danger'}`} disabled={busy || !confirmed}><Check size={18}/>{busy ? 'Saving...' : action==='issue' ? 'Confirm issue' : 'Confirm revocation'}</button></div></form>}
    </dialog>
  </section>;
}
