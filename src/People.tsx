import React, { lazy,Suspense,useEffect, useRef, useState } from 'react';
import { Archive,ArchiveRestore, Check, ChevronLeft, ChevronRight, Pencil, Plus, Search, Upload, UserRound,UserCheck, UserX, Users, X } from 'lucide-react';
import { WorkerAssignments } from './PublicationResponses';
import { WorkerAccess } from './WorkerAccess';
const WorkerDeletion=lazy(()=>import('./WorkerDeletion').then(module=>({default:module.WorkerDeletion})));
import { keepDialogFocus } from './dialog-focus';

type Worker = {
  id: string; code: string; language: 'en' | 'ar' | 'ur'; active: boolean;
  crew_id: string | null; crew_name: string | null;
};
type Crew = { id: string; name: string; active: boolean; member_count: number };
type CrewPage = {items:Crew[];total:number;page:number;pageSize:number};
type WorkerPage = { items: Worker[]; total: number; page: number; pageSize: number };
type Props = { refresh?: number; onImport: () => void;canManage:boolean;canDelete:boolean;credentialAccess:boolean;navigate:(path:string)=>void;initialWorkerId?:string;initialCrewId?:string };

const languages = { en: 'English', ar: 'Arabic', ur: 'Urdu' };

async function peopleApi<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api/people${path}`, {
    method, credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

function CrewActions({crew,disabled,onChanged}:{crew:Crew;disabled:boolean;onChanged:(message:string,updated:Crew)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),requestId=useRef('');
  const [mode,setMode]=useState<'rename'|'archive'|'restore'>('rename'),[crewName,setCrewName]=useState(crew.name);
  const [expectedName,setExpectedName]=useState(crew.name),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  function open(nextMode:'rename'|'archive'|'restore') {
    requestId.current=crypto.randomUUID();setMode(nextMode);setCrewName(crew.name);setExpectedName(crew.name);setConfirmed(false);setError('');
    dialog.current?.showModal();
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(inFlight.current || (mode!=='rename' && !confirmed)) return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const updated=await peopleApi<Crew>(`/crews/${encodeURIComponent(crew.id)}${mode==='rename' ? '' : `/${mode}`}`,
        mode==='rename' ? 'PATCH' : 'POST',mode==='rename' ? {expectedName,name:crewName} : {expectedName,confirmed:true,...(mode==='restore' ? {requestId:requestId.current} : {})});
      dialog.current?.close();onChanged(mode==='restore' ? updated.active ? 'Crew restored. Worker access and past assignments are unchanged.' : 'The restore request was already recorded. This crew is now archived.' : mode==='archive' ? 'Crew archived. Worker access and past assignments are unchanged.' : 'Crew renamed. Past assignments are unchanged.',updated);
    } catch(reason) {setError((reason as Error).message);} finally {inFlight.current=false;setBusy(false);}
  }
  return <div className="crew-controls">
    {crew.active && <><button type="button" className="icon-button" disabled={disabled} title={`Rename ${crew.name}`} aria-label={`Rename ${crew.name}`} onClick={() => open('rename')}><Pencil size={18}/></button>
    <button type="button" className="icon-button" disabled={disabled} title={`Archive ${crew.name}`} aria-label={`Archive ${crew.name}`} onClick={() => open('archive')}><Archive size={18}/></button></>}
    {!crew.active && <button type="button" className="icon-button" disabled={disabled} title={`Restore ${crew.name}`} aria-label={`Restore ${crew.name}`} onClick={() => open('restore')}><ArchiveRestore size={18}/></button>}
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby={`crew-title-${crew.id}`} aria-describedby={`crew-impact-${crew.id}`} onKeyDown={keepDialogFocus} onCancel={(event) => {if(inFlight.current) event.preventDefault();}} onClose={() => setConfirmed(false)}>
      <form onSubmit={(event) => void save(event)}>
        <div className="withdraw-heading"><h2 id={`crew-title-${crew.id}`}>{mode==='restore' ? 'Restore crew?' : mode==='archive' ? 'Archive crew?' : 'Rename crew'}</h2><button autoFocus type="button" className="icon-button" title="Close crew dialog" aria-label="Close crew dialog" disabled={busy} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
        <p id={`crew-impact-${crew.id}`} className="crew-impact">{mode==='restore' ? <><strong>{expectedName}</strong> will accept new membership moves again. Retained memberships stay in place. Disabled workers stay disabled, and no access links or new assignments are issued.</> : mode==='archive' ? <><strong>{expectedName}</strong> will no longer accept new membership moves. Its {crew.member_count} active {crew.member_count===1 ? 'worker keeps' : 'workers keep'} their access and current memberships. Existing assignments and responses remain unchanged.</> : <>Changing the name of <strong>{expectedName}</strong> keeps the same crew, memberships, assignments, and responses.</>}</p>
        {mode==='rename' ? <label className="field">Crew name<input value={crewName} disabled={busy} minLength={2} maxLength={80} required onChange={(event) => setCrewName(event.target.value)}/></label> : <label className="recipient-row publish-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)}/><span>{mode==='restore' ? `Restore ${expectedName} without enabling workers` : `Archive ${expectedName} without disabling workers`}</span></label>}
        {error && <p role="alert" className="record-error">{error}</p>}
        <div className="actions"><button type="button" className="button outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className={`button ${mode==='archive' ? 'danger' : 'primary'}`} disabled={busy || (mode!=='rename' ? !confirmed : crewName.trim()===expectedName || crewName.trim().length<2)}>{mode==='restore' ? <ArchiveRestore size={18}/> : mode==='archive' ? <Archive size={18}/> : <Check size={18}/>} {busy ? 'Saving...' : mode==='restore' ? 'Restore crew' : mode==='archive' ? 'Archive crew' : 'Save name'}</button></div>
      </form>
    </dialog>
  </div>;
}

function WorkerReenable({worker,onChanged}:{worker:Worker;onChanged:(updated:Worker)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),requestId=useRef('');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expectedCode,setExpectedCode]=useState(worker.code);
  return <><button className="button outline full" onClick={() => {requestId.current=crypto.randomUUID();setExpectedCode(worker.code);setConfirmed(false);setError('');dialog.current?.showModal();}}><UserCheck size={18}/>Re-enable worker</button>
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby="reenable-title" aria-describedby="reenable-impact" onKeyDown={keepDialogFocus} onCancel={(event) => {if(inFlight.current) event.preventDefault();}} onClose={() => setConfirmed(false)}>
      <form onSubmit={async (event) => {
        event.preventDefault();if(!confirmed || inFlight.current) return;
        inFlight.current=true;setBusy(true);setError('');
        try {const updated=await peopleApi<Worker>(`/workers/${encodeURIComponent(worker.id)}/reenable`,'POST',{requestId:requestId.current,expectedCode,confirmed:true});dialog.current?.close();onChanged(updated);}
        catch(reason) {setError((reason as Error).message);} finally {inFlight.current=false;setBusy(false);}
      }}>
        <div className="withdraw-heading"><h2 id="reenable-title">Re-enable worker?</h2><button autoFocus type="button" className="icon-button" title="Close re-enable dialog" aria-label="Close re-enable dialog" disabled={busy} onClick={() => dialog.current?.close()}><X size={20}/></button></div>
        <p id="reenable-impact" className="crew-impact"><strong>{expectedCode}</strong> will be active in this site again. Old sessions and access links stay revoked. A separate new access link is required to sign in. Past assignments, responses and crew membership are unchanged.</p>
        <label className="recipient-row publish-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)}/><span>Re-enable {expectedCode} without restoring old access links</span></label>
        {error && <p role="alert" className="record-error">{error}</p>}
        <div className="actions"><button type="button" className="button outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button className="button primary" disabled={busy || !confirmed}><UserCheck size={18}/>{busy ? 'Saving...' : 'Re-enable worker'}</button></div>
      </form>
    </dialog>
  </>;
}

function CrewMembership({worker,refresh,disabled,onSave}:{worker:Worker;refresh:number;disabled:boolean;onSave:(crewId:string|null)=>Promise<Worker|null>}) {
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<CrewPage|null>(null);
  const [choice,setChoice]=useState({id:worker.crew_id || '',name:worker.crew_name || 'No crew'});
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const inFlight=useRef(false),searchInput=useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current=true;setLoading(true);
    const query=new URLSearchParams({search,status:'active',page:String(page),pageSize:'5'});
    peopleApi<CrewPage>(`/crews?${query}`).then((result) => {if(current) {setData(result);setError('');}})
      .catch((reason:Error) => {if(current) setError(reason.message);}).finally(() => {if(current) setLoading(false);});
    return () => {current=false;};
  },[search,page,refresh]);
  const pages=Math.max(1,Math.ceil((data?.total || 0)/5));
  return <div className="crew-membership">
    <label className="field">Find destination crew<input ref={searchInput} value={search} maxLength={80} disabled={disabled || saving} onChange={(event) => {setSearch(event.target.value);setPage(1);}} type="search"/></label>
    <label className="field">Move to crew<select value={choice.id} disabled={disabled || saving || loading || !!error} onChange={(event) => {
      const next=data?.items.find((crew) => crew.id===event.target.value);setChoice(next ? {id:next.id,name:next.name} : {id:'',name:'No crew'});
    }}><option value="">No crew</option>{choice.id && !data?.items.some((crew) => crew.id===choice.id) && <option value={choice.id}>{choice.name} (selected)</option>}{data?.items.map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select></label>
    {error && !loading && <p role="alert" className="record-error">{error}</p>}
    <div className="crew-pagination"><span role="status">{loading ? 'Loading destination crews...' : `Page ${page} of ${pages} · ${data?.total || 0} active crews`}</span><div className="actions"><button className="icon-button" title="Previous destination crews" aria-label="Previous destination crews" aria-disabled={disabled || saving || loading || !!error || page<=1} onClick={() => {if(!disabled && !saving && !loading && !error && page>1) setPage(page-1);}}><ChevronLeft size={18}/></button><button className="icon-button" title="Next destination crews" aria-label="Next destination crews" aria-disabled={disabled || saving || loading || !!error || page>=pages} onClick={() => {if(!disabled && !saving && !loading && !error && page<pages) setPage(page+1);}}><ChevronRight size={18}/></button>{!loading && !error && page>pages && <button className="button subtle" disabled={disabled || saving} onClick={() => setPage(1)}>First page</button>}</div></div>
    <button className="button outline full" disabled={disabled || saving || loading || !!error || choice.id===(worker.crew_id || '')} onClick={async () => {
      if(inFlight.current) return;inFlight.current=true;setSaving(true);
      try {await onSave(choice.id || null);} finally {inFlight.current=false;setSaving(false);}
    }}><Users size={18}/>{saving ? 'Saving...' : 'Save crew'}</button>
    {choice.id!==(worker.crew_id || '') && <button className="button subtle full" disabled={disabled || saving} onClick={() => {setChoice({id:worker.crew_id || '',name:worker.crew_name || 'No crew'});searchInput.current?.focus();}}>Cancel crew change</button>}
  </div>;
}

export function PeoplePage({ refresh = 0, onImport,canManage,canDelete,credentialAccess,navigate,initialWorkerId,initialCrewId }: Props) {
  const [workers, setWorkers] = useState<WorkerPage | null>(null);
  const [crews, setCrews] = useState<CrewPage|null>(null);
  const [crewSearch,setCrewSearch]=useState(''),[crewStatus,setCrewStatus]=useState('all'),[crewPage,setCrewPage]=useState(1);
  const [crewLoading,setCrewLoading]=useState(true),[crewError,setCrewError]=useState('');
  const [selected, setSelected] = useState<Worker | null>(null);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('all');
  const [status, setStatus] = useState(initialWorkerId || initialCrewId?'all':'active');
  const [workerCrew,setWorkerCrew]=useState({id:initialCrewId || 'all',name:initialCrewId?'Selected crew':'All crews'});
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<'add' | 'edit' | null>(null);
  const [code, setCode] = useState('');
  const [workerLanguage, setWorkerLanguage] = useState<Worker['language']>('en');
  const [crewName, setCrewName] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [deletionLocked,setDeletionLocked]=useState(true);
  const workerSearchInput=useRef<HTMLInputElement>(null),crewStatusInput=useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if(!canManage) return;
    let active = true;
    const query = new URLSearchParams({ search, language, status,crewId:workerCrew.id, page: String(page), pageSize: '5' });
    if(initialWorkerId)query.set('workerId',initialWorkerId);
    setLoading(true);
    peopleApi<WorkerPage>(`/workers?${query}`).then((nextWorkers) => {
      if (!active) return;
      setWorkers(nextWorkers);
      setSelected((current) => current && nextWorkers.items.find((worker) => worker.id === current.id) || nextWorkers.items[0] || null);
      setError('');
    }).catch((reason) => { if (active) setError((reason as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, revision, search, language, status,workerCrew.id,page,canManage,initialWorkerId]);

  useEffect(() => {
    if(!canManage) return;
    let current=true;setCrewLoading(true);
    const query=new URLSearchParams({search:crewSearch,status:crewStatus,page:String(crewPage),pageSize:'5'});
    const load=initialCrewId?peopleApi<Crew>(`/crews/${encodeURIComponent(initialCrewId)}`).then(crew=>({items:[crew],total:1,page:1,pageSize:5})):peopleApi<CrewPage>(`/crews?${query}`);
    load.then((result) => {if(current) {setCrews(result);setCrewError('');if(initialCrewId && result.items[0])setWorkerCrew(old=>old.id===initialCrewId?{id:initialCrewId,name:result.items[0].name}:old);}})
      .catch((reason:Error) => {if(current) setCrewError(reason.message);}).finally(() => {if(current) setCrewLoading(false);});
    return () => {current=false;};
  },[refresh,revision,crewSearch,crewStatus,crewPage,canManage,initialCrewId]);

  useEffect(() => { setConfirmDisable(false);setDeletionLocked(true); }, [selected?.id]);
  useEffect(() => { setConfirmDisable(false); }, [selected?.crew_id]);

  async function change<T>(action: () => Promise<T>, success: string): Promise<T | null> {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      setMessage(success);
      setRevision((n) => n + 1);
      return result;
    } catch (reason) { setError((reason as Error).message); return null; }
    finally { setBusy(false); }
  }

  function startAdd() { setCode(''); setWorkerLanguage('en'); setForm('add'); setConfirmDisable(false); }
  function startEdit() {
    if (!selected) return;
    setCode(selected.code); setWorkerLanguage(selected.language); setForm('edit'); setConfirmDisable(false);
  }

  async function saveWorker(event: React.FormEvent) {
    event.preventDefault();
    const worker = form === 'add'
      ? await change(() => peopleApi<Worker>('/workers', 'POST', { code, language: workerLanguage }), 'Worker added.')
      : selected && await change(() => peopleApi<Worker>(`/workers/${encodeURIComponent(selected.id)}`, 'PATCH', { code, language: workerLanguage }), 'Worker updated.');
    if (worker) {
      setSelected(worker);
      setForm(null);
      setSearch(worker.code); setPage(1);
      if(form==='add') setWorkerCrew({id:'all',name:'All crews'});
      if (status === 'inactive') setStatus('all');
    }
  }

  async function addCrew(event: React.FormEvent) {
    event.preventDefault();
    const crew = await change(() => peopleApi<Crew>('/crews', 'POST', { name: crewName }), 'Crew created.');
    if (crew) {setCrewName('');if(initialCrewId || initialWorkerId)navigate(`people/crew/${crew.id}`);else{setCrewSearch(crew.name);setCrewStatus('all');setCrewPage(1);}}
  }

  async function moveCrew(crewId:string|null) {
    if (!selected) return null;
    const worker = await change(() => peopleApi<Worker>(`/workers/${encodeURIComponent(selected.id)}/crew`, 'POST', { crewId }), 'Crew membership updated.');
    if (worker) setSelected(worker);
    return worker;
  }

  async function disable() {
    if (!selected) return;
    const worker = await change(() => peopleApi<Worker>(`/workers/${encodeURIComponent(selected.id)}/disable`, 'POST'), 'Worker disabled. Access revoked; past responses retained.');
    if (worker) { setSelected(worker); setStatus('all'); setConfirmDisable(false); }
  }

  const pages = workers ? Math.max(1, Math.ceil(workers.total / workers.pageSize)) : 1;
  const crewPages=Math.max(1,Math.ceil((crews?.total || 0)/5));
  if(!canManage) return <p className="notice notice-blue" role="status">Worker directory access is limited to owners and supervisors.</p>;
  return <>
    <div className="page-header"><div><h1>Workers</h1><p>Manage workers and crews at this site.</p></div>
      <div className="actions people-header-actions"><button className="button outline" onClick={onImport}><Upload size={19} />Import CSV</button><button className="button primary" onClick={startAdd}><Plus size={19} /> Add worker</button></div>
    </div>
    <div className="filters people-filters">
      {(initialWorkerId || initialCrewId) && <button className="button outline" onClick={()=>navigate('people')}><X size={18}/>Clear result filter</button>}
      <label className="search-box"><Search size={18} /><span className="sr-only">Search workers</span><input ref={workerSearchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by worker ID" /></label>
      <label className="select-label">Language<select value={language} onChange={(event) => { setLanguage(event.target.value); setPage(1); }}><option value="all">All languages</option><option value="en">English</option><option value="ar">Arabic</option><option value="ur">Urdu</option></select></label>
      <label className="select-label">Access<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">Active</option><option value="inactive">Disabled</option><option value="all">All statuses</option></select></label>
      <label className="select-label">Membership<select value={workerCrew.id} onChange={(event) => {setWorkerCrew({id:event.target.value,name:event.target.value==='all' ? 'All crews' : 'No crew'});setPage(1);}}><option value="all">All crews</option><option value="none">No crew</option>{!['all','none'].includes(workerCrew.id) && <option value={workerCrew.id}>{workerCrew.name}</option>}</select></label>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {message && <p className="notice notice-green" role="status">{message}</p>}
    <div className="people-layout">
      <section className="panel people-directory" aria-label="Worker directory">
        <h2>Workers ({workers?.total ?? 0})</h2>
        {loading && !workers ? <p>Loading workers...</p> : workers?.items.length ? <div className="table-wrap"><table className="people-table">
          <thead><tr><th>Worker ID</th><th>Language</th><th>Access status</th><th>Crew</th><th><span className="sr-only">Open details</span></th></tr></thead>
          <tbody>{workers.items.map((worker) => <tr key={worker.id} className={selected?.id === worker.id ? 'people-selection' : ''}>
            <td><button className="people-row-button" onClick={() => { setSelected(worker); setForm(null); }}><UserRound size={18} /> <strong>{worker.code}</strong></button></td>
            <td>{languages[worker.language]}</td><td><span className={`status ${worker.active ? 'status-green' : 'status-amber'}`}><span className="status-dot" />{worker.active ? 'Active' : 'Disabled'}</span></td>
            <td>{worker.crew_name || '—'}</td><td><button className="icon-button" aria-label={`Open ${worker.code}`} onClick={() => { setSelected(worker); setForm(null); }}><ChevronRight size={19} /></button></td>
          </tr>)}</tbody>
        </table></div> : <p className="empty-state">No workers match these filters.</p>}
        <div className="people-pagination"><span>Showing {workers?.items.length || 0} of {workers?.total || 0} workers</span><div>
          <button className="icon-button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={19} /></button>
          <span>Page {page} of {pages}</span>
          <button className="icon-button" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={19} /></button>
        </div></div>
      </section>
      <div className="people-side">
        {form ? <section className="panel people-form"><div className="people-panel-heading"><h2>{form === 'add' ? 'Add worker' : 'Edit worker'}</h2><button className="icon-button" aria-label="Close form" onClick={() => setForm(null)}><X size={19} /></button></div>
          <form onSubmit={saveWorker}><label className="field">Worker ID<input value={code} onChange={(event) => setCode(event.target.value)} minLength={2} maxLength={80} required /></label>
            <label className="field">Preferred language<select value={workerLanguage} onChange={(event) => setWorkerLanguage(event.target.value as Worker['language'])}><option value="en">English</option><option value="ar">Arabic</option><option value="ur">Urdu</option></select></label>
            <button className="button primary full" type="submit" disabled={busy}><Check size={18} /> Save worker</button></form>
        </section> : selected ? <section className="panel people-detail"><div className="people-panel-heading"><div className="people-detail-title"><span className="small-avatar"><UserRound size={23} /></span><div><h2>{selected.code}</h2><p>{selected.active ? 'Active' : 'Disabled'} · {languages[selected.language]}</p></div></div><button className="icon-button" aria-label="Close worker details" onClick={() => setSelected(null)}><X size={19} /></button></div>
          <dl className="people-facts"><dt>Preferred language</dt><dd>{languages[selected.language]}</dd><dt>Crew</dt><dd>{selected.crew_name || 'No crew'}</dd><dt>Access</dt><dd>{selected.active ? 'Active' : 'Disabled'}</dd></dl>
          {selected.active && <><CrewMembership key={`${selected.id}:${selected.crew_id}`} worker={selected} refresh={refresh+revision} disabled={busy || (canDelete && deletionLocked)} onSave={moveCrew}/>
            <div className="people-actions"><button className="button outline" disabled={canDelete && deletionLocked} onClick={startEdit}><Pencil size={18} /> Edit</button><button className="button subtle" disabled={canDelete && deletionLocked} onClick={() => setConfirmDisable(true)}><UserX size={18} /> Disable</button></div>
            {confirmDisable && <div className="notice people-confirm" role="alert"><p>Disable {selected.code}? Their sessions and access links will be revoked. Existing answers remain in history.</p><div className="actions"><button className="button outline" onClick={() => setConfirmDisable(false)}>Cancel</button><button className="button primary" disabled={busy} onClick={disable}>Disable worker</button></div></div>}</>}
          {!selected.active && (!canDelete || !deletionLocked) && <WorkerReenable key={selected.id} worker={selected} onChanged={(updated) => {setSelected(updated);setStatus('all');setSearch(updated.code);setPage(1);setRevision((n) => n+1);setMessage(updated.active ? 'Worker re-enabled. Old access stays revoked; issue a new link separately.' : 'The re-enable request was already recorded. This worker is now disabled.');workerSearchInput.current?.focus();}}/>}
        </section> : <section className="panel people-detail"><h2>Worker details</h2><p>Select a worker to view their site membership.</p></section>}
        {selected && !form && <WorkerAccess key={selected.id} workerId={selected.id} code={selected.code} active={selected.active} credentialAccess={credentialAccess}/>}
        {selected && !form && canDelete && <Suspense fallback={<p role="status">Loading worker data controls...</p>}><WorkerDeletion key={selected.id} workerId={selected.id} code={selected.code} onLocked={setDeletionLocked} onQueued={(status)=>{setSelected({...selected,active:false});setStatus('all');setMessage(status==='complete'?'Server cleanup complete. Retained history is pseudonymous.':'Deletion requested. Server access is revoked; cleanup is queued.');}}/></Suspense>}
        <section className="panel people-crews"><h2>{crewLoading ? 'Crews' : `Crews (${crews?.total ?? 0})`}</h2>
          {!initialCrewId && <><label className="field">Search crews<input type="search" value={crewSearch} maxLength={80} onChange={(event) => {setCrewSearch(event.target.value);setCrewPage(1);}}/></label>
          <label className="field">Crew status<select ref={crewStatusInput} value={crewStatus} onChange={(event) => {setCrewStatus(event.target.value);setCrewPage(1);}}><option value="all">All crews</option><option value="active">Active</option><option value="inactive">Archived</option></select></label></>}
          {crewLoading ? <p role="status">Loading crews...</p> : crewError ? <p role="alert" className="record-error">{crewError}</p> : crews?.items.length ? <ul>{crews.items.map((crew) => <li key={crew.id}><Users size={17} /><span><button className="people-row-button crew-member-link" title={`View members of ${crew.name}`} aria-label={`View members of ${crew.name}`} aria-pressed={workerCrew.id===crew.id} onClick={() => {setWorkerCrew({id:crew.id,name:crew.name});setSearch('');setLanguage('all');setStatus('active');setPage(1);}}><bdi>{crew.name}</bdi></button><small>{crew.member_count} {crew.member_count===1 ? 'worker' : 'workers'}{!crew.active ? ' · Archived' : ''}</small></span><CrewActions crew={crew} disabled={busy} onChanged={(success,updated) => {if(workerCrew.id===updated.id) setWorkerCrew({id:updated.id,name:updated.name});if(updated.active && crewStatus==='inactive') {setCrewStatus('all');setCrewSearch(updated.name);setCrewPage(1);}setMessage(success);setRevision((n) => n+1);crewStatusInput.current?.focus();}}/></li>)}</ul> : <p>No crews match these filters.</p>}
          <div className="crew-pagination"><span role="status">{crewLoading ? 'Loading crew page...' : `Page ${crewPage} of ${crewPages} · ${crews?.total || 0} crews`}</span><div className="actions"><button className="icon-button" title="Previous crews" aria-label="Previous crews" aria-disabled={crewLoading || !!crewError || crewPage<=1} onClick={() => {if(!crewLoading && !crewError && crewPage>1) setCrewPage(crewPage-1);}}><ChevronLeft size={18}/></button><button className="icon-button" title="Next crews" aria-label="Next crews" aria-disabled={crewLoading || !!crewError || crewPage>=crewPages} onClick={() => {if(!crewLoading && !crewError && crewPage<crewPages) setCrewPage(crewPage+1);}}><ChevronRight size={18}/></button>{!crewLoading && !crewError && crewPage>crewPages && <button className="button subtle" onClick={() => setCrewPage(1)}>First page</button>}</div></div>
          <form className="people-create-crew" onSubmit={addCrew}><label className="field">Crew name<input value={crewName} onChange={(event) => setCrewName(event.target.value)} minLength={2} maxLength={80} placeholder="e.g. Beirut Morning" required /></label><button className="button outline" type="submit" disabled={busy}><Plus size={18} /> Create crew</button></form>
        </section>
      </div>
    </div>
    {selected && !form && <WorkerAssignments key={selected.id} workerId={selected.id} refresh={refresh+revision} navigate={navigate} />}
  </>;
}
