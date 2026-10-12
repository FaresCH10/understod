import {useEffect,useState} from 'react';
import {RefreshCw,Save} from 'lucide-react';
import {recordingNoticeInput,noticeLanguages} from '../server/recording-notice-input.mjs';
import {readPendingNotice,storePendingNotice,clearPendingNotice,verifyNoticeReceipt,type NoticeChange} from './notice-recovery';
type Notices=NoticeChange['notices'];
type Data={revision:number;configured:boolean;notices:Notices;canWrite:boolean;recoveryScope:string|null};
const endpoint='/api/privacy/recording-notice';
async function request(path=endpoint,body?:NoticeChange,signal?:AbortSignal){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'include',signal,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error || 'Recording notice unavailable'),{status:response.status});return data;
}
export function RecordingNoticeSettings(){
  const [data,setData]=useState<Data|null>(null),[notices,setNotices]=useState<Notices>({en:'',ar:'',ur:''}),[pending,setPending]=useState<NoticeChange|null>(null);
  const [error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[tick,setTick]=useState(0),[saved,setSaved]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setConfirmed(false);
    request(endpoint,undefined,controller.signal).then(async value=>{
      if(controller.signal.aborted)return;
      if(typeof value.canWrite!=='boolean' || !Number.isSafeInteger(value.revision) || value.revision<0)throw Error('Recording notice settings cannot be verified.');
      recordingNoticeInput({requestId:crypto.randomUUID(),revision:value.revision,notices:value.notices,confirmed:true,scope:value.recoveryScope || JSON.stringify(['read','only','notice'])});
      if(value.canWrite && !value.recoveryScope)throw Error('Notice save recovery is unavailable.');
      setData(value);
      const restored=value.recoveryScope?readPendingNotice(sessionStorage,value.recoveryScope):null;
      setPending(restored);setNotices(restored?.notices || value.notices);
      if(restored){
        const receipt=await request(`${endpoint}/requests/${encodeURIComponent(restored.requestId)}`,undefined,controller.signal);
        if(controller.signal.aborted)return;
        if(receipt){verifyNoticeReceipt(receipt,restored);clearPendingNotice(sessionStorage,value.recoveryScope,restored.requestId);setPending(null);setNotices(value.notices);setSaved(true);}
      }
      setLoading(false);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[tick]);
  async function save(){
    if(!data?.recoveryScope || loading || saving || !confirmed)return;
    const change=pending || {requestId:crypto.randomUUID(),revision:data.revision,notices,confirmed:true as const,scope:data.recoveryScope};
    try{recordingNoticeInput(change);}catch(reason){setError((reason as Error).message);return;}
    setSaving(true);setError('');setSaved(false);
    try{
      storePendingNotice(sessionStorage,data.recoveryScope,change);setPending(change);
      const result=await request(endpoint,change);
      if(result.requestId!==change.requestId || result.revision!==change.revision+1 || typeof result.duplicate!=='boolean')throw Error('Notice save acknowledgement cannot be verified.');
      const receipt=await request(`${endpoint}/requests/${encodeURIComponent(change.requestId)}`);verifyNoticeReceipt(receipt,change);
      clearPendingNotice(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setSaved(true);setConfirmed(false);setTick(value=>value+1);
    }catch(reason){
      setError((reason as Error).message);setConfirmed(false);
      if([400,401,403,409].includes((reason as Error & {status?:number}).status || 0)){
        try{if(readPendingNotice(sessionStorage,data.recoveryScope)?.requestId===change.requestId)clearPendingNotice(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setTick(value=>value+1);}catch{setLoading(true);}
      }else setLoading(true);
    }finally{setSaving(false);}
  }
  return <section className="panel" aria-label="Recording notice settings">
    <div className="people-panel-heading"><h2>Recording notice</h2><button className="icon-button" title="Refresh recording notice" aria-label="Refresh recording notice" disabled={saving} onClick={()=>{setError('');setTick(value=>value+1);}}><RefreshCw size={18}/></button></div>
    {error&&<p role="alert" className="record-error">{error}</p>}{saved&&<p role="status">Recording notice saved.</p>}
    <p className="muted">Site wording supplements the standard recording information. It is not legal-consent certification.</p>
    {data? <>{noticeLanguages.map(language=><label className="field" key={language}><span>{({en:'English',ar:'Arabic',ur:'Urdu'} as const)[language as keyof Notices]}</span><textarea rows={4} lang={language} dir={language==='en'?'ltr':'rtl'} maxLength={2000} value={notices[language as keyof Notices]} disabled={!data.canWrite || saving || !!pending || loading} onChange={event=>{setNotices({...notices,[language]:event.target.value});setConfirmed(false);setSaved(false);}}/></label>)}
      {pending&&<p role="status">The original notice save is pending. Refresh checks its receipt without resending.</p>}
      {data.canWrite&&<><label className="retention-confirm"><input type="checkbox" checked={confirmed} disabled={saving || loading} onChange={event=>setConfirmed(event.target.checked)}/>I have reviewed all three languages for this site. Empty text in all three languages removes the custom notice.</label><button className="button primary" disabled={!confirmed || saving || loading} onClick={()=>void save()}><Save size={18}/>{saving?'Saving...':pending?'Retry notice save':'Save notice'}</button></>}
    </>:<p role="status">Loading recording notice...</p>}
  </section>;
}
