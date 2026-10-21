import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight,RefreshCw,Send,Trash2} from 'lucide-react';
import {clearPendingMessage,readPendingMessage,retainMessage,type MessageSession,type PendingMessage} from './case-message-recovery';
import {CaseVoiceRecorder} from './CaseVoiceRecorder';
import {conversationComposerPolicy,requestConversation,ConversationRequestError,validConversationSession,type ConversationOperation,type ConversationPage,type ConversationReceipt,type ConversationFailure} from './conversation-request';
import {keepDialogFocus} from './dialog-focus';

const copy={
  en:{title:'Follow-up conversation',refresh:'Refresh conversation',loading:'Loading conversation...',empty:'No follow-up messages yet.',reply:'Message',send:'Send message',retry:'Retry same message',check:'Check receipt',unknown:'Delivery is unknown. Check the receipt before retrying. Only the exact original message can be resent.',received:'Message saved.',closed:'This conversation is closed for new messages.',translation:'Follow-up translation is not connected for this language.',failed:'Conversation unavailable.',previous:'Newer messages',next:'Older messages',worker:'Worker',supervisor:'Supervisor'},
  ar:{title:'محادثة المتابعة',refresh:'تحديث المحادثة',loading:'جار تحميل المحادثة...',empty:'لا توجد رسائل متابعة بعد.',reply:'رسالة',send:'إرسال الرسالة',retry:'إعادة إرسال الرسالة نفسها',check:'التحقق من الاستلام',unknown:'الإرسال غير مؤكد. تحقق من الاستلام قبل المحاولة. لا يمكن إعادة إرسال إلا الرسالة الأصلية نفسها.',received:'تم حفظ الرسالة.',closed:'هذه المحادثة مغلقة أمام الرسائل الجديدة.',translation:'ترجمة المتابعة غير متصلة لهذه اللغة.',failed:'المحادثة غير متاحة.',previous:'الرسائل الأحدث',next:'الرسائل الأقدم',worker:'العامل',supervisor:'المشرف'},
  ur:{title:'رابطے کی گفتگو',refresh:'گفتگو تازہ کریں',loading:'گفتگو لوڈ ہو رہی ہے...',empty:'ابھی کوئی پیغام نہیں۔',reply:'پیغام',send:'پیغام بھیجیں',retry:'وہی پیغام دوبارہ بھیجیں',check:'وصولی چیک کریں',unknown:'ترسیل نامعلوم ہے۔ دوبارہ کوشش سے پہلے وصولی چیک کریں۔ صرف اصل پیغام دوبارہ بھیجا جا سکتا ہے۔',received:'پیغام محفوظ ہو گیا۔',closed:'یہ گفتگو نئے پیغامات کے لیے بند ہے۔',translation:'اس زبان کے لیے ترجمہ منسلک نہیں۔',failed:'گفتگو دستیاب نہیں۔',previous:'نئے پیغامات',next:'پرانے پیغامات',worker:'کارکن',supervisor:'سپروائزر'},
};
const generationCopy={en:{send:'Generate and send follow-up',audio:'Include generated audio',queued:'Follow-up generation is queued.',processing:'Follow-up translation and audio are processing.',failed:'Follow-up generation failed. No message was delivered.',play:'Follow-up audio'},ar:{send:'إنشاء المتابعة وإرسالها',audio:'تضمين صوت مولد',queued:'المتابعة في قائمة الإنشاء.',processing:'جار إنشاء ترجمة المتابعة والصوت.',failed:'فشل إنشاء المتابعة. لم يتم إرسال رسالة.',play:'صوت المتابعة'},ur:{send:'رابطہ تیار کر کے بھیجیں',audio:'تیار کردہ آڈیو شامل کریں',queued:'رابطہ تیاری کی قطار میں ہے۔',processing:'ترجمہ اور آڈیو تیار ہو رہی ہے۔',failed:'رابطہ تیار نہیں ہوا۔ کوئی پیغام نہیں بھیجا گیا۔',play:'رابطے کی آڈیو'}};
const limitCopy={en:'This draft exceeds the current send limit. Shorten it before sending. Your text has not been changed.',ar:'تتجاوز هذه المسودة حد الإرسال الحالي. اختصرها قبل الإرسال. لم يتغير النص.',ur:'یہ مسودہ بھیجنے کی موجودہ حد سے زیادہ ہے۔ بھیجنے سے پہلے اسے مختصر کریں۔ آپ کا متن تبدیل نہیں ہوا۔'};
const stateCopy={
  en:{invalid:'The conversation response could not be verified. Refresh to try again.',blocked:'Sending is temporarily unavailable.',recovery:'Local message recovery could not be verified. Check any pending receipt before retrying.',clear:'Clear unsent text',clearTitle:'Clear this unsent text?',clearImpact:'This only clears text on this screen. It does not cancel a pending request or delete a sent message.',cancel:'Cancel',confirm:'Clear text',draft:'Your unsent text is still here. Sending is unavailable until the conversation is available again.'},
  ar:{invalid:'تعذر التحقق من بيانات المحادثة. حدّث للمحاولة مجددًا.',blocked:'الإرسال غير متاح مؤقتًا.',recovery:'تعذر التحقق من استعادة الرسالة المحلية. تحقق من أي استلام معلق قبل المحاولة.',clear:'مسح النص غير المرسل',clearTitle:'مسح هذا النص غير المرسل؟',clearImpact:'سيُمسح النص من هذه الشاشة فقط. لن يُلغى طلب معلق ولن تُحذف رسالة مرسلة.',cancel:'إلغاء',confirm:'مسح النص',draft:'النص غير المرسل ما زال هنا. الإرسال غير متاح حتى تعود المحادثة.'},
  ur:{invalid:'گفتگو کی معلومات کی تصدیق نہیں ہو سکی۔ دوبارہ تازہ کریں۔',blocked:'فی الحال پیغام بھیجنا دستیاب نہیں۔',recovery:'مقامی پیغام کی بازیابی کی تصدیق نہیں ہو سکی۔ دوبارہ کوشش سے پہلے زیر التوا وصولی چیک کریں۔',clear:'بھیجا نہ گیا متن صاف کریں',clearTitle:'بھیجا نہ گیا متن صاف کریں؟',clearImpact:'صرف اس سکرین کا متن صاف ہوگا۔ زیر التوا درخواست منسوخ یا بھیجا گیا پیغام حذف نہیں ہوگا۔',cancel:'منسوخ کریں',confirm:'متن صاف کریں',draft:'آپ کا نہ بھیجا گیا متن یہیں ہے۔ گفتگو دستیاب ہونے تک بھیجنا ممکن نہیں۔'},
};
type Props={caseId:string;assignmentId?:string;session:MessageSession;language?:string;worker?:boolean;canWrite?:boolean;current?:()=>boolean;canMutate?:()=>boolean;timezone?:string;onDirtyChange?:(value:boolean)=>void;onSessionLost?:()=>void;afterComposer?:ReactNode};
export function CaseConversation(props:Props){
  return <ConversationContent key={JSON.stringify([props.caseId,props.session.clientContext,props.session.expiresAt,!!props.worker])} {...props}/>;
}
function ConversationContent({caseId,assignmentId,session,language='en',worker=false,canWrite=true,current=()=>true,canMutate=()=>true,timezone,onDirtyChange,onSessionLost,afterComposer}:Props){
  const locale=language==='ar'||language==='ur'?language:'en',t=copy[locale],g=generationCopy[locale],s=stateCopy[locale];
  const composerId=useId(),composerCountId=useId(),composerLimitId=useId();
  const [page,setPage]=useState(1),[tick,setTick]=useState(0),[text,setText]=useState(''),[failure,setFailure]=useState<ConversationFailure|null>(null),[notice,setNotice]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<PendingMessage|null>(null),[recoveryFailed,setRecoveryFailed]=useState(false);
  const [voiceDirty,setVoiceDirty]=useState(false),[includeAudio,setIncludeAudio]=useState(true),[generationStatus,setGenerationStatus]=useState<ConversationReceipt['status']|null>(null);
  const readKey=JSON.stringify([page,tick]);
  const [read,setRead]=useState<{key:string;data:ConversationPage|null;loading:boolean;failure:ConversationFailure|null}>({key:'',data:null,loading:true,failure:null});
  const mounted=useRef(false),inFlight=useRef(false),command=useRef<AbortController|null>(null),callbacks=useRef({current,canWrite,canMutate,onDirtyChange,onSessionLost});callbacks.current={current,canWrite,canMutate,onDirtyChange,onSessionLost};
  const dialog=useRef<HTMLDialogElement>(null),clearTrigger=useRef<HTMLElement|null>(null),clearIntent=useRef<string|null>(null);
  const composer=useRef<HTMLTextAreaElement>(null),refreshButton=useRef<HTMLButtonElement>(null);
  const draft=useRef(text);draft.current=text;
  const isCurrent=()=>mounted.current&&callbacks.current.current()&&validConversationSession(session);
  const canSend=()=>isCurrent()&&callbacks.current.canWrite&&callbacks.current.canMutate();
  const data=read.key===readKey&&current()&&validConversationSession(session)?read.data:null;
  const loading=read.key!==readKey||read.loading;
  const composerPolicy=conversationComposerPolicy({worker,pendingKind:pending?pending.kind==='followup'?'followup':'message':null,canGenerate:!!data?.canGenerate,language:data?.language,includeAudio});
  const overLimit=text.length>composerPolicy.limit;
  useEffect(()=>{mounted.current=true;try{setPending(readPendingMessage(sessionStorage,session,caseId));}catch{setFailure('recovery');setRecoveryFailed(true);}return()=>{mounted.current=false;command.current?.abort();callbacks.current.onDirtyChange?.(false);};},[]);
  useEffect(()=>{callbacks.current.onDirtyChange?.(!!text || busy || voiceDirty);if(!text&&!busy&&!voiceDirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[text,busy,voiceDirty]);
  function report(reason:unknown){
    if(!mounted.current||!callbacks.current.current())return;
    const code=reason instanceof ConversationRequestError?reason.code:'recovery';setFailure(code);
    if(code==='session')callbacks.current.onSessionLost?.();
  }
  async function request(operation:ConversationOperation,signal:AbortSignal){
    return requestConversation(fetch,session,caseId,worker,operation,signal,isCurrent,canSend);
  }
  useEffect(()=>{
    let alive=true;const controller=new AbortController();setRead({key:readKey,data:null,loading:true,failure:null});
    request({kind:'page',page},controller.signal).then(value=>{if(alive&&isCurrent())setRead({key:readKey,data:value as ConversationPage,loading:false,failure:null});}).catch(reason=>{
      if(!alive||!mounted.current||!callbacks.current.current())return;
      const code=reason instanceof ConversationRequestError?reason.code:'unavailable';setRead({key:readKey,data:null,loading:false,failure:code});if(code==='session')callbacks.current.onSessionLost?.();
    });return()=>{alive=false;controller.abort();};
  },[page,tick]);
  async function accept(value:ConversationReceipt,id:string){
    if(!isCurrent())throw new ConversationRequestError('session');
    // Receipt recovery must not erase a different draft typed after the uncertain command.
    const candidate=draft.current,retained=readPendingMessage(sessionStorage,session,caseId);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(candidate.trim()))),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!isCurrent())throw new ConversationRequestError('session');
    const clearDraft=retained?.id===id&&retained.hash===hash&&draft.current===candidate;
    if(value.status==='queued'||value.status==='processing'){setGenerationStatus(value.status);if(clearDraft)setText('');setFailure(null);return;}
    try{clearPendingMessage(sessionStorage,session,caseId,id);}catch{throw new ConversationRequestError('recovery');}
    setPending(null);setGenerationStatus(value.status==='failed'?'failed':null);setFailure(null);
    if(value.status==='failed')return;
    if(clearDraft)setText('');setNotice(true);setPage(1);setTick(value=>value+1);
  }
  async function send(){
    if(inFlight.current||voiceDirty||!data||!replyAvailable||!canSend()||loading||recoveryFailed||overLimit||!text.trim()||generationStatus==='queued'||generationStatus==='processing')return;
    inFlight.current=true;setBusy(true);setFailure(null);setNotice(false);const controller=new AbortController();command.current=controller;
    try{
      const kind=composerPolicy.kind;
      const retained=await retainMessage(sessionStorage,session,caseId,text,kind,'message',canSend);
      if(!isCurrent())return;setPending(retained);
      await accept(await request({kind,requestId:retained.id,text},controller.signal) as ConversationReceipt,retained.id);
    }catch(reason){report(reason);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function check(){
    if(inFlight.current||!pending||!isCurrent())return;
    inFlight.current=true;setBusy(true);setFailure(null);const controller=new AbortController();command.current=controller;
    try{await accept(await request({kind:pending.kind==='followup'?'followup':'message',requestId:pending.id},controller.signal) as ConversationReceipt,pending.id);}catch(reason){report(reason);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  const unavailable=!!data&&!worker&&data.language!=='en'&&!data.canGenerate;
  const replyAvailable=!!data?.canReply&&!unavailable&&!loading&&canWrite&&canMutate();
  const error=failure==='closed'?t.closed:failure==='translation'?t.translation:failure==='blocked'?s.blocked:failure==='recovery'?s.recovery:failure==='conflict'?t.unknown:failure==='invalid'?s.invalid:failure?t.failed:null;
  function askClear(){if(busy||voiceDirty||!text||!isCurrent())return;clearIntent.current=text;clearTrigger.current=document.activeElement as HTMLElement;dialog.current?.showModal();}
  function confirmClear(){if(!busy&&!voiceDirty&&isCurrent()&&text===clearIntent.current){setText('');setFailure(null);}dialog.current?.close();}
  if(!current()||!validConversationSession(session))return <section className={worker?'worker-card':'panel'}><p role="alert">{t.failed}</p></section>;
  return <section className={worker?'worker-card':'panel'} lang={locale} dir={locale==='en'?'ltr':'rtl'}>
    <div className="worker-card-head"><h2>{t.title}</h2><button ref={refreshButton} className="icon-button" title={t.refresh} aria-label={t.refresh} disabled={busy||voiceDirty} onClick={()=>{setFailure(null);setTick(value=>value+1);}}><RefreshCw size={18}/></button></div>
    {error&&<p role="alert" className="record-error">{error}</p>}{notice&&<p role="status">{t.received}</p>}{generationStatus==='failed'&&<p role="alert" className="record-error">{g.failed}</p>}
    {read.key===readKey&&read.failure?<p role="alert">{read.failure==='invalid'?s.invalid:t.failed}</p>:loading?<p role="status">{t.loading}</p>:!data?null:!data.items.length?<p>{t.empty}</p>:<div className="row-list">{data.items.map(item=><article className="worker-help-entry" key={item.id}><div className="worker-card-head"><strong><bdi>{item.author==='worker'?t.worker:item.authorName==='Supervisor'?t.supervisor:item.authorName}</bdi></strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale,{timeZone:timezone})}</time></div><p lang={item.language} dir={item.language==='en'?'ltr':'rtl'}>{item.text}</p>{item.audioUrl&&<audio controls preload="none" src={item.audioUrl} aria-label={g.play}/>}</article>)}</div>}
    {data&&data.total>20&&<div className="actions"><button className="icon-button" title={t.previous} aria-label={t.previous} disabled={busy||voiceDirty||!!text||page<=1} onClick={()=>setPage(value=>value-1)}>{locale==='en'?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button><span>{page} / {Math.ceil(data.total/20)}</span><button className="icon-button" title={t.next} aria-label={t.next} disabled={busy||voiceDirty||!!text||page*20>=data.total||page>=5000} onClick={()=>setPage(value=>value+1)}>{locale==='en'?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}</button></div>}
    {pending&&<div className="notice notice-amber"><p role="status">{generationStatus==='queued'?g.queued:generationStatus==='processing'?g.processing:t.unknown}</p><button className="button outline" disabled={busy||recoveryFailed} onClick={()=>void check()}><RefreshCw size={18}/>{t.check}</button></div>}
    {data&&!data.canReply&&<p>{t.closed}</p>}{unavailable&&<p role="status">{t.translation}</p>}
    {(replyAvailable||!!text)&&<form id={composerId} onSubmit={event=>{event.preventDefault();void send();}}>
      {!!text&&!replyAvailable&&<p role="status">{s.draft}</p>}
      <label className="field">{t.reply}<textarea ref={composer} aria-describedby={`${composerCountId}${overLimit?` ${composerLimitId}`:''}`} aria-invalid={overLimit} maxLength={composerPolicy.limit} rows={3} value={text} readOnly={!replyAvailable||busy||voiceDirty||recoveryFailed||generationStatus==='queued'||generationStatus==='processing'} onChange={event=>setText(event.target.value)}/></label>
      <p id={composerCountId} className="case-message-count" dir="ltr">{text.length} / {composerPolicy.limit}</p>
      {overLimit&&<p id={composerLimitId} role="alert" className="record-error">{limitCopy[locale]}</p>}
      {!worker&&data?.canGenerate&&data.language==='en'&&<label><input type="checkbox" checked={includeAudio} disabled={busy||!!pending} onChange={event=>setIncludeAudio(event.target.checked)}/>{g.audio}</label>}
    </form>}
    <div className="case-conversation-actions">
      {(replyAvailable||!!text)&&<div className="actions"><button type="submit" form={composerId} className="button primary" disabled={!replyAvailable||busy||voiceDirty||recoveryFailed||overLimit||generationStatus==='queued'||generationStatus==='processing'||!text.trim()}><Send size={18}/>{pending?t.retry:composerPolicy.kind==='followup'?g.send:t.send}</button>{!!text&&<button type="button" className="icon-button" title={s.clear} aria-label={s.clear} disabled={busy||voiceDirty} onClick={askClear}><Trash2 size={18}/></button>}</div>}
      {!worker&&afterComposer}
    </div>
    {worker&&!canWrite&&<p role="status">{s.blocked}</p>}
    {worker&&assignmentId&&<CaseVoiceRecorder scope={{kind:'reply',id:caseId,assignmentId}} session={session} language={locale} current={isCurrent} canMutate={canSend} available={!!data?.canVoice&&canWrite} disabled={!replyAvailable||busy||!!text||!!pending||recoveryFailed} onDirtyChange={setVoiceDirty} onSessionLost={onSessionLost} onReceived={()=>{if(isCurrent()){setPage(1);setTick(value=>value+1);}}}/>}
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby="conversation-clear-title" aria-describedby="conversation-clear-impact" onKeyDown={keepDialogFocus} onClose={()=>{clearIntent.current=null;if(clearTrigger.current?.isConnected)clearTrigger.current.focus();else(composer.current||refreshButton.current)?.focus();}}><h2 id="conversation-clear-title">{s.clearTitle}</h2><p id="conversation-clear-impact">{s.clearImpact}</p><div className="actions"><button className="button outline" autoFocus onClick={()=>dialog.current?.close()}>{s.cancel}</button><button className="button danger" onClick={confirmClear}>{s.confirm}</button></div></dialog>
  </section>;
}
