import {lazy,Suspense,useEffect,useState} from 'react';
import {RefreshCw,Save,TriangleAlert} from 'lucide-react';
import {readPendingRetention,storePendingRetention,clearPendingRetention,verifyRetentionReceipt,type RetentionChange} from './retention-recovery';
const PrivacyWorkers=lazy(()=>import('./PrivacyWorkers').then(module=>({default:module.PrivacyWorkers})));
const RecordingNoticeSettings=lazy(()=>import('./RecordingNoticeSettings').then(module=>({default:module.RecordingNoticeSettings})));
const TextRetentionSettings=lazy(()=>import('./TextRetentionSettings').then(module=>({default:module.TextRetentionSettings})));

type Retention={revision:number;audioDays:number|null;canWrite:boolean;recoveryScope:string|null;audioOptions:number[];jobs:Record<string,number>;sourceJobs?:Record<string,number>;textRetentionAvailable?:boolean;caseRetentionAvailable?:boolean;generatedRetentionAvailable?:boolean;activityRetentionAvailable?:boolean;briefingRetentionAvailable?:boolean;limitations:string};
type Change=RetentionChange;
async function request(body?:Change,signal?:AbortSignal){
  const response=await fetch('/api/retention',{method:body?'POST':'GET',credentials:'include',signal,
    ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error || 'Retention settings unavailable'),{status:response.status});
  return data;
}
export function RetentionSettings(){
  const [data,setData]=useState<Retention|null>(null),[days,setDays]=useState(30),[error,setError]=useState('');
  const [pending,setPending]=useState<Change|null>(null),[saving,setSaving]=useState(false),[tick,setTick]=useState(0);
  const [confirmed,setConfirmed]=useState(false),[saved,setSaved]=useState(false);
  const [recoveryBlocked,setRecoveryBlocked]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    setRecoveryBlocked(true);
    request(undefined,controller.signal).then(async value=>{
      if(controller.signal.aborted)return;
      setData(value);
      if(value.canWrite&&!value.recoveryScope)throw new Error('Retention save recovery is unavailable. Refresh after checking the service.');
      const restored=value.recoveryScope?readPendingRetention(sessionStorage,value.recoveryScope):null;
      if(restored){
        setPending(restored);setDays(restored.audioDays);setConfirmed(false);
        const response=await fetch(`/api/retention/requests/${encodeURIComponent(restored.requestId)}`,{credentials:'include',signal:controller.signal});
        const receipt=await response.json();
        if(!response.ok)throw new Error(receipt.error || 'Retention receipt unavailable');
        if(controller.signal.aborted)return;
        if(receipt){verifyRetentionReceipt(receipt,restored);clearPendingRetention(sessionStorage,value.recoveryScope,restored.requestId);setPending(null);setSaved(true);setDays(value.audioDays ?? 30);}
        else setError('The policy save is not confirmed. You can explicitly retry the original request.');
      }else{setPending(null);setDays(value.audioDays ?? 30);}
      setRecoveryBlocked(false);
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return ()=>controller.abort();
  },[tick]);
  async function save(){
    if(!data?.recoveryScope || saving || !confirmed || recoveryBlocked)return;
    const change=pending || {requestId:crypto.randomUUID(),revision:data.revision,audioDays:days,confirmed:true as const};
    setPending(change);setSaving(true);setError('');setSaved(false);
    try{storePendingRetention(sessionStorage,data.recoveryScope,change);const result=await request(change);if(result.revision!==change.revision+1)throw new Error('Retention save response cannot be verified.');clearPendingRetention(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setConfirmed(false);setSaved(true);setTick(value=>value+1);}
    catch(error){setError((error as Error).message);if([400,401,403,409].includes((error as Error & {status?:number}).status || 0)){try{clearPendingRetention(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setConfirmed(false);setTick(value=>value+1);}catch{setRecoveryBlocked(true);}}}
    finally{setSaving(false);}
  }
  return <>
    <div className="page-header"><div><h1>Privacy &amp; retention</h1><p>Manage server data retention for this site.</p></div><button className="icon-button" title="Refresh retention status" aria-label="Refresh retention status" disabled={saving} onClick={()=>{setError('');setTick(value=>value+1);}}><RefreshCw size={20}/></button></div>
    {error&&<p className="record-error" role="alert">{error}</p>}
    {saved&&<p role="status">Audio retention policy saved. Cleanup runs through scheduled jobs.</p>}
    {!data?<p role="status">Loading retention settings...</p>:<>
      <section className="panel"><h2>Audio retention</h2><p className="muted">Current policy: {data.audioDays===null?'Not configured':`${data.audioDays} days`}</p>
        <label className="field"><span>Keep server audio for</span><select value={days} disabled={!data.canWrite || saving || !!pending} onChange={event=>{setDays(Number(event.target.value));setConfirmed(false);setSaved(false);}}>{data.audioOptions.map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
        {data.canWrite&&<><label className="retention-confirm"><input type="checkbox" checked={confirmed} disabled={saving || recoveryBlocked} onChange={event=>setConfirmed(event.target.checked)}/>I understand that expired server worker recordings and supervisor source audio will be permanently removed, including existing audio.</label><button className="button primary" disabled={saving || !confirmed || recoveryBlocked} onClick={()=>void save()}><Save size={18}/>{saving?'Saving...':pending?'Retry policy save':'Save policy'}</button></>}
      </section>
      <section className="panel"><h2>Audio cleanup jobs</h2><dl className="retention-jobs"><div><dt>Queued</dt><dd>{data.jobs.queued || 0}</dd></div><div><dt>Processing</dt><dd>{data.jobs.processing || 0}</dd></div><div><dt>Completed</dt><dd>{data.jobs.complete || 0}</dd></div></dl></section>
      <section className="panel"><h2>Source audio cleanup jobs</h2><dl className="retention-jobs"><div><dt>Queued</dt><dd>{data.sourceJobs?.queued || 0}</dd></div><div><dt>Processing</dt><dd>{data.sourceJobs?.processing || 0}</dd></div><div><dt>Completed</dt><dd>{data.sourceJobs?.complete || 0}</dd></div></dl></section>
      {data.textRetentionAvailable&&<Suspense fallback={<p role="status">Loading text retention settings...</p>}><TextRetentionSettings/></Suspense>}
      {data.caseRetentionAvailable&&<Suspense fallback={<p role="status">Loading case retention settings...</p>}><TextRetentionSettings category="case"/></Suspense>}
      {data.generatedRetentionAvailable&&<Suspense fallback={<p role="status">Loading generated audio retention settings...</p>}><TextRetentionSettings category="generated"/></Suspense>}
      {data.activityRetentionAvailable&&<Suspense fallback={<p role="status">Loading activity retention settings...</p>}><TextRetentionSettings category="activity"/></Suspense>}
      {data.briefingRetentionAvailable&&<Suspense fallback={<p role="status">Loading briefing retention settings...</p>}><TextRetentionSettings category="briefing"/></Suspense>}
      <Suspense fallback={<p role="status">Loading recording notice...</p>}><RecordingNoticeSettings/></Suspense>
      {data.canWrite&&<Suspense fallback={<p role="status">Loading worker data requests...</p>}><PrivacyWorkers/></Suspense>}
      <div className="notice notice-amber"><TriangleAlert size={22}/><span>{data.limitations}</span></div>
    </>}
  </>;
}
