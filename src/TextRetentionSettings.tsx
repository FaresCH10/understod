import {useEffect,useState} from 'react';
import {RefreshCw,Save} from 'lucide-react';
import {textRetentionDays,textRetentionInput} from '../server/text-retention-input.mjs';
import {readPendingTextRetention,storePendingTextRetention,clearPendingTextRetention,verifyTextRetentionReceipt,type TextRetentionChange} from './text-retention-recovery';

type Data={revision:number;days:number|null;canWrite:boolean;recoveryScope:string|null;options:number[];completed:Record<string,number>;limitations:string};
async function request(path:string,body?:TextRetentionChange,signal?:AbortSignal) {
  const response=await fetch(path,{credentials:'include',signal,method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const value=await response.json();
  if(!response.ok)throw Object.assign(Error(value.error || 'Text retention settings unavailable'),{status:response.status});
  return value;
}
export function TextRetentionSettings({category='response'}:{category?:'response'|'case'|'generated'|'activity'|'briefing'}) {
  const isCase=category==='case',isGenerated=category==='generated',isActivity=category==='activity',isBriefing=category==='briefing',endpoint=isBriefing?'/api/retention/briefings':isActivity?'/api/retention/activity':isGenerated?'/api/retention/generated':isCase?'/api/retention/cases':'/api/retention/text';
  const title=isBriefing?'Archived briefing content retention':isActivity?'Activity identity retention':isGenerated?'Generated briefing audio retention':isCase?'Resolved case retention':'Response text retention';
  const policyName=isBriefing?'briefing':isActivity?'activity':isGenerated?'generated audio':isCase?'case':'text';
  const confirmation=isActivity?'I understand that actor and item identifiers in expired activity will be permanently cleared. Minimal event IDs, actions, actor types and timestamps remain. Other operational ledgers, policy acceptance, backups and downloaded copies have separate lifecycles. Disabling cleanup cannot restore removed identifiers.':isGenerated?'I understand that generated briefing and question audio will expire from its verified storage date, including current published and draft versions. Playback and publishing expired bundles stop, and private objects are permanently removed through queued cleanup. Text, published snapshots and history remain. Disabling this policy cannot restore audio or cancel already queued cleanup.':isCase?'I understand that expired resolved case reasons, notes, help text, messages, follow-up translations and disagreement reasons will be permanently redacted. Voice playback stops and saved voice objects are queued for cleanup. Open cases and outcomes remain unchanged. Disabling cleanup cannot restore removed content.':'I understand that expired saved answers, assessment quotes and transcripts will be permanently redacted. Recording processing and playback stop; stored report exports expire. Outcomes remain unchanged. Disabling cleanup cannot restore removed content.';
  const [data,setData]=useState<Data|null>(null),[days,setDays]=useState<number|null>(null),[pending,setPending]=useState<TextRetentionChange|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[confirmed,setConfirmed]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setConfirmed(false);
    request(endpoint,undefined,controller.signal).then(async value=>{
      if(controller.signal.aborted)return;
      textRetentionInput({requestId:crypto.randomUUID(),revision:value.revision,days:value.days,confirmed:true});
      if(typeof value.canWrite!=='boolean' || JSON.stringify(value.options)!==JSON.stringify(textRetentionDays)
        || typeof value.limitations!=='string' || !value.completed || (value.canWrite && typeof value.recoveryScope!=='string'))throw Error('Text retention settings cannot be verified.');
      const restored=value.recoveryScope?readPendingTextRetention(sessionStorage,value.recoveryScope):null;
      setData(value);setPending(restored);setDays(restored?.days ?? value.days);
      if(restored) {
        setDays(restored.days);
        const receipt=await request(`${endpoint}/requests/${encodeURIComponent(restored.requestId)}`,undefined,controller.signal);
        if(controller.signal.aborted)return;
        if(receipt){verifyTextRetentionReceipt(receipt,restored);clearPendingTextRetention(sessionStorage,value.recoveryScope,restored.requestId);setPending(null);setDays(value.days);setSaved(true);}
      }
      setLoading(false);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[tick,endpoint]);
  async function save() {
    if(!data?.canWrite || !data.recoveryScope || loading || saving || !confirmed)return;
    const change=pending || {requestId:crypto.randomUUID(),revision:data.revision,days,confirmed:true as const};
    setSaving(true);setSaved(false);setError('');
    try {
      storePendingTextRetention(sessionStorage,data.recoveryScope,change);setPending(change);
      const result=await request(endpoint,change);
      if(result.revision!==change.revision+1 || typeof result.duplicate!=='boolean')throw Error('Text retention save acknowledgement cannot be verified.');
      verifyTextRetentionReceipt(await request(`${endpoint}/requests/${encodeURIComponent(change.requestId)}`),change);
      clearPendingTextRetention(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setSaved(true);setConfirmed(false);setTick(value=>value+1);
    }catch(reason) {
      setError((reason as Error).message);setConfirmed(false);setLoading(true);
      if([400,401,403,409].includes((reason as Error & {status?:number}).status || 0)) {
        try {if(readPendingTextRetention(sessionStorage,data.recoveryScope)?.requestId===change.requestId)clearPendingTextRetention(sessionStorage,data.recoveryScope,change.requestId);setPending(null);setTick(value=>value+1);}catch {/* Keep saving blocked when scoped storage cannot be verified. */}
      }
    }finally{setSaving(false);}
  }
  const displayedConfirmation=isBriefing?'I understand that archived briefing source, prepared content and publication copies will be permanently redacted after the archive and related answers/case resolutions have aged past this policy. Pending checks and open cases prevent cleanup. Generated audio must finish its separate cleanup first. Version identities, audiences, outcomes and hashes remain; disabling cleanup cannot restore content.':confirmation;
  return <section className="panel content-retention" aria-label={title}>
    <div className="people-panel-heading"><h2>{title}</h2><button className="icon-button" title={`Refresh ${policyName} retention`} aria-label={`Refresh ${policyName} retention`} disabled={saving} onClick={()=>{setError('');setTick(value=>value+1);}}><RefreshCw size={18}/></button></div>
    {error&&<p role="alert" className="record-error">{error}</p>}{saved&&<p role="status">{isBriefing?'Briefing':isActivity?'Activity':isGenerated?'Generated audio':isCase?'Case':'Text'} retention policy save confirmed.</p>}
    {data?<>
      <p className="muted">Current policy: {data.days===null?'Disabled':`${data.days} days`}</p>
      <label className="field"><span>{isBriefing?'Keep archived briefing content for':isActivity?'Keep activity actor and item identifiers for':isGenerated?'Keep generated briefing audio for':isCase?'Keep resolved case content for':'Keep worker answer text and transcripts for'}</span><select value={days===null?'disabled':days} disabled={!data.canWrite || loading || saving || !!pending} onChange={event=>{setDays(event.target.value==='disabled'?null:Number(event.target.value));setConfirmed(false);setSaved(false);}}><option value="disabled">Disabled</option>{data.options.map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
      {pending&&<p role="status">The original policy save is unconfirmed. Refresh checks its receipt without resending.</p>}
      {data.canWrite&&<><label className="retention-confirm"><input type="checkbox" checked={confirmed} disabled={loading || saving} onChange={event=>setConfirmed(event.target.checked)}/>{displayedConfirmation}</label><button className="button primary" disabled={loading || saving || !confirmed} onClick={()=>void save()}><Save size={18}/>{saving?'Saving...':pending?`Retry ${policyName} policy save`:`Save ${policyName} policy`}</button></>}
      <dl className="retention-jobs">{isBriefing?<div><dt>Briefings Redacted</dt><dd>{data.completed.briefing || 0}</dd></div>:isActivity?<div><dt>Activity Identities Cleared</dt><dd>{data.completed.activity || 0}</dd></div>:isGenerated?<><div><dt>Bundles Retired</dt><dd>{data.completed.retired || 0}</dd></div><div><dt>Bundles Removed</dt><dd>{data.completed.removed || 0}</dd></div></>:isCase?<div><dt>Cases Redacted</dt><dd>{data.completed.case || 0}</dd></div>:<><div><dt>Answers Redacted</dt><dd>{data.completed.attempt || 0}</dd></div><div><dt>Transcripts Cleared</dt><dd>{data.completed.recording || 0}</dd></div></>}</dl>
      <p className="muted">{data.limitations}</p>
    </>:<p role="status">Loading {policyName} retention settings...</p>}
  </section>;
}
