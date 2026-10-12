import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,RefreshCw,Send} from 'lucide-react';
import {checkedMessageReceipt,clearPendingMessage,readPendingMessage,retainMessage,type MessageSession,type PendingMessage} from './case-message-recovery';
import {CaseVoiceRecorder} from './CaseVoiceRecorder';

const copy={
  en:{title:'Follow-up conversation',refresh:'Refresh conversation',loading:'Loading conversation...',empty:'No follow-up messages yet.',reply:'Message',send:'Send message',retry:'Retry same message',check:'Check receipt',unknown:'Delivery is unknown. Check the receipt before retrying. Only the exact original message can be resent.',received:'Message saved.',closed:'This conversation is closed for new messages.',translation:'Follow-up translation is not connected for this language.',failed:'Conversation unavailable.',previous:'Newer messages',next:'Older messages',worker:'Worker',supervisor:'Supervisor'},
  ar:{title:'محادثة المتابعة',refresh:'تحديث المحادثة',loading:'جار تحميل المحادثة...',empty:'لا توجد رسائل متابعة بعد.',reply:'رسالة',send:'إرسال الرسالة',retry:'إعادة إرسال الرسالة نفسها',check:'التحقق من الاستلام',unknown:'الإرسال غير مؤكد. تحقق من الاستلام قبل المحاولة. لا يمكن إعادة إرسال إلا الرسالة الأصلية نفسها.',received:'تم حفظ الرسالة.',closed:'هذه المحادثة مغلقة أمام الرسائل الجديدة.',translation:'ترجمة المتابعة غير متصلة لهذه اللغة.',failed:'المحادثة غير متاحة.',previous:'الرسائل الأحدث',next:'الرسائل الأقدم',worker:'العامل',supervisor:'المشرف'},
  ur:{title:'رابطے کی گفتگو',refresh:'گفتگو تازہ کریں',loading:'گفتگو لوڈ ہو رہی ہے...',empty:'ابھی کوئی پیغام نہیں۔',reply:'پیغام',send:'پیغام بھیجیں',retry:'وہی پیغام دوبارہ بھیجیں',check:'وصولی چیک کریں',unknown:'ترسیل نامعلوم ہے۔ دوبارہ کوشش سے پہلے وصولی چیک کریں۔ صرف اصل پیغام دوبارہ بھیجا جا سکتا ہے۔',received:'پیغام محفوظ ہو گیا۔',closed:'یہ گفتگو نئے پیغامات کے لیے بند ہے۔',translation:'اس زبان کے لیے ترجمہ منسلک نہیں۔',failed:'گفتگو دستیاب نہیں۔',previous:'نئے پیغامات',next:'پرانے پیغامات',worker:'کارکن',supervisor:'سپروائزر'},
};
type Thread={items:{id:string;text:string;language:string;createdAt:string;author:string;authorName:string;audioUrl?:string;kind?:string}[];total:number;page:number;pageSize:number;canReply:boolean;canGenerate?:boolean;canVoice?:boolean;language:string};
const generationCopy={en:{send:'Generate and send follow-up',audio:'Include generated audio',queued:'Follow-up generation is queued.',processing:'Follow-up translation and audio are processing.',failed:'Follow-up generation failed. No message was delivered.',play:'Follow-up audio'},ar:{send:'إنشاء المتابعة وإرسالها',audio:'تضمين صوت مولد',queued:'المتابعة في قائمة الإنشاء.',processing:'جار إنشاء ترجمة المتابعة والصوت.',failed:'فشل إنشاء المتابعة. لم يتم إرسال رسالة.',play:'صوت المتابعة'},ur:{send:'رابطہ تیار کر کے بھیجیں',audio:'تیار کردہ آڈیو شامل کریں',queued:'رابطہ تیاری کی قطار میں ہے۔',processing:'ترجمہ اور آڈیو تیار ہو رہی ہے۔',failed:'رابطہ تیار نہیں ہوا۔ کوئی پیغام نہیں بھیجا گیا۔',play:'رابطے کی آڈیو'}};
export function CaseConversation({caseId,session,language='en',worker=false,canWrite=true,onDirtyChange,onSessionLost}:{caseId:string;session:MessageSession;language?:string;worker?:boolean;canWrite?:boolean;onDirtyChange?:(value:boolean)=>void;onSessionLost?:()=>void}) {
  const t=copy[language as keyof typeof copy] || copy.en;
  const g=generationCopy[language as keyof typeof generationCopy] || generationCopy.en;
  const [data,setData]=useState<Thread|null>(null),[page,setPage]=useState(1),[tick,setTick]=useState(0),[text,setText]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<PendingMessage|null>(null),[recoveryFailed,setRecoveryFailed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [voiceDirty,setVoiceDirty]=useState(false);
  const [includeAudio,setIncludeAudio]=useState(true),[generationStatus,setGenerationStatus]=useState<string|null>(null);
  const mounted=useRef(true),inFlight=useRef(false),callbacks=useRef({onDirtyChange,onSessionLost});callbacks.current={onDirtyChange,onSessionLost};
  const path=`/api/clarifications/${encodeURIComponent(caseId)}/messages`;
  useEffect(()=>{mounted.current=true;try{setPending(readPendingMessage(sessionStorage,session,caseId));}catch{setError(t.failed);setRecoveryFailed(true);}return()=>{mounted.current=false;callbacks.current.onDirtyChange?.(false);};},[caseId,session.clientContext]);
  useEffect(()=>{callbacks.current.onDirtyChange?.(!!text.trim() || busy || voiceDirty);if(!text.trim() && !busy && !voiceDirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[text,busy,voiceDirty]);
  async function request(url:string,body?:unknown) {
    const response=await fetch(url,{credentials:'include',headers:{'x-client-session-context':session.clientContext,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
    const value=await response.json();
    if(response.status===401 || value.error==='Session context changed'){callbacks.current.onSessionLost?.();throw Error(t.failed);}
    if(!response.ok)throw Error(value.error || t.failed);return value;
  }
  useEffect(()=>{let current=true;setData(null);setLoading(true);request(`${path}?page=${page}&pageSize=20`).then(value=>{if(current)setData(value);}).catch(()=>{if(current)setError(t.failed);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[path,page,tick,session.clientContext]);
  function finish(value:unknown,id:string) {
    checkedMessageReceipt(value,caseId,id);clearPendingMessage(sessionStorage,session,caseId,id);
    if(mounted.current){setPending(null);setText('');setNotice(t.received);setError('');setPage(1);setTick(value=>value+1);}
  }
  function generated(value:unknown,id:string) {
    const row=checkedMessageReceipt(value,caseId,id) as ReturnType<typeof checkedMessageReceipt> & {status:string};
    if(!['queued','processing','delivered','failed'].includes(row.status))throw Error(t.failed);
    if(row.status==='delivered'){finish(value,id);setGenerationStatus(null);return;}
    if(row.status==='failed'){clearPendingMessage(sessionStorage,session,caseId,id);setPending(null);setGenerationStatus(null);setError(g.failed);return;}
    setGenerationStatus(row.status);setText('');setError('');
  }
  async function send() {
    if(inFlight.current || voiceDirty || !data?.canReply || !canWrite || recoveryFailed)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
    try {const kind=pending?.kind || (!worker && data.canGenerate && (data.language!=='en' || includeAudio)?'followup':'message');
      const retained=await retainMessage(sessionStorage,session,caseId,text,kind);if(!mounted.current)return;setPending(retained);
      const value=await request(kind==='followup'?path.replace(/\/messages$/,'/followups'):path,{requestId:retained.id,text});
      if(!mounted.current)return;if(kind==='followup')generated(value,retained.id);else finish(value,retained.id);
    }catch(reason){if(mounted.current)setError((reason as Error).message);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function check() {
    if(inFlight.current || !pending)return;inFlight.current=true;setBusy(true);setError('');
    try{const value=await request(`${pending.kind==='followup'?path.replace(/\/messages$/,'/followups'):path}/${encodeURIComponent(pending.id)}`);
      if(!mounted.current)return;if(pending.kind==='followup')generated(value,pending.id);else finish(value,pending.id);
    }catch{if(mounted.current)setError(t.unknown);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  const unavailable=!worker && data?.language!=='en' && !data?.canGenerate;
  return <section className={worker?'worker-card':'panel'}>
    <div className="worker-card-head"><h2>{t.title}</h2><button className="icon-button" title={t.refresh} aria-label={t.refresh} disabled={busy || voiceDirty} onClick={()=>{setError('');setTick(value=>value+1);}}><RefreshCw size={18}/></button></div>
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading?<p role="status">{t.loading}</p>:!data?null:!data.items.length?<p>{t.empty}</p>:<div className="row-list">{data.items.map(item=><article className="worker-help-entry" key={item.id}><div className="worker-card-head"><strong>{item.author==='worker'?t.worker:item.authorName || t.supervisor}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language)}</time></div><p lang={item.language} dir={item.language==='en'?'ltr':'rtl'}>{item.text}</p>{item.audioUrl && <audio controls preload="none" src={item.audioUrl} aria-label={g.play}/>}</article>)}</div>}
    {data && data.total>20 && <div className="actions"><button className="icon-button" title={t.previous} aria-label={t.previous} disabled={busy || voiceDirty || page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><span>{page} / {Math.ceil(data.total/20)}</span><button className="icon-button" title={t.next} aria-label={t.next} disabled={busy || voiceDirty || page*20>=data.total} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button></div>}
    {pending && <div className="notice notice-amber"><p role="status">{generationStatus==='queued'?g.queued:generationStatus==='processing'?g.processing:t.unknown}</p><button className="button outline" disabled={busy} onClick={()=>void check()}><RefreshCw size={18}/>{t.check}</button></div>}
    {data && (!data.canReply?<p>{t.closed}</p>:unavailable?<p role="status">{t.translation}</p>:canWrite?<form onSubmit={event=>{event.preventDefault();void send();}}><label className="field">{t.reply}<textarea maxLength={1000} rows={3} value={text} disabled={busy || voiceDirty || recoveryFailed || !!generationStatus} onChange={event=>setText(event.target.value)}/></label>{!worker && data.canGenerate && data.language==='en' && <label><input type="checkbox" checked={includeAudio} disabled={busy || !!pending} onChange={event=>setIncludeAudio(event.target.checked)}/>{g.audio}</label>}<button className="button primary" disabled={busy || voiceDirty || recoveryFailed || !!generationStatus || !text.trim()}><Send size={18}/>{pending?t.retry:!worker && data.canGenerate && (data.language!=='en' || includeAudio)?g.send:t.send}</button></form>:null)}
    {worker && data?.canVoice && canWrite && <CaseVoiceRecorder scope={{kind:'reply',id:caseId}} session={session} language={language==='ar' || language==='ur'?language:'en'} disabled={busy || !!text.trim() || !!pending || recoveryFailed} onDirtyChange={setVoiceDirty} onSessionLost={onSessionLost} onReceived={()=>{setPage(1);setTick(value=>value+1);}}/>}
  </section>;
}
