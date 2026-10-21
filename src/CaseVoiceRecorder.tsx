import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {RefreshCw,Trash2} from 'lucide-react';
import {WorkerRecorderView} from './WorkerRecorderView';
import type {MessageSession} from './case-message-recovery';
import {readVoicePending,retainVoice,clearVoicePending,type VoicePending,type VoiceScope} from './case-voice-recovery';
import {requestCaseVoice,VoiceRequestError,type VoiceFailure,type VoiceHttpReceipt,type VoiceOperation} from './case-voice-request';
import {validConversationSession} from './conversation-request';
import {keepDialogFocus} from './dialog-focus';
import {readWorkerRecordingNotice,WorkerRecordingNoticeError} from './worker-recording-notice';

const copy={en:{unknown:'Voice delivery is unconfirmed. Check the receipt before retrying the same recording.',check:'Check voice receipt',received:'Voice message received.',failed:'Voice recording was not received. Record a new message.',unavailable:'Voice receipt could not be verified.'},
  ar:{unknown:'لم يتأكد إرسال الصوت. تحقق من الاستلام قبل إعادة إرسال التسجيل نفسه.',check:'تحقق من استلام الصوت',received:'تم استلام الرسالة الصوتية.',failed:'لم يتم استلام التسجيل. سجّل رسالة جديدة.',unavailable:'تعذر التحقق من استلام الصوت.'},
  ur:{unknown:'صوتی پیغام کی ترسیل غیر مصدقہ ہے۔ وہی ریکارڈنگ دوبارہ بھیجنے سے پہلے وصولی چیک کریں۔',check:'صوتی پیغام کی وصولی چیک کریں',received:'صوتی پیغام موصول ہو گیا۔',failed:'ریکارڈنگ موصول نہیں ہوئی۔ نیا پیغام ریکارڈ کریں۔',unavailable:'صوتی پیغام کی وصولی کی تصدیق نہیں ہو سکی۔'}};
const clearCopy={
  en:{action:'Clear local recording preview',title:'Clear this local recording?',impact:'This removes only the recording preview on this page. A pending upload is not cancelled, sent audio is not deleted, and you can still check its receipt.',cancel:'Cancel',confirm:'Clear local preview'},
  ar:{action:'مسح معاينة التسجيل المحلية',title:'مسح هذا التسجيل المحلي؟',impact:'ستُمسح معاينة التسجيل من هذه الصفحة فقط. لن يُلغى رفع معلق ولن يُحذف صوت مرسل، ويمكنك الاستمرار في التحقق من الاستلام.',cancel:'إلغاء',confirm:'مسح المعاينة المحلية'},
  ur:{action:'مقامی ریکارڈنگ کا پیش نظارہ صاف کریں',title:'یہ مقامی ریکارڈنگ صاف کریں؟',impact:'صرف اس صفحے کا ریکارڈنگ پیش نظارہ صاف ہوگا۔ زیر التوا اپ لوڈ منسوخ یا بھیجی گئی آڈیو حذف نہیں ہوگی۔ آپ وصولی اب بھی چیک کر سکتے ہیں۔',cancel:'منسوخ کریں',confirm:'مقامی پیش نظارہ صاف کریں'},
};
type Props={scope:VoiceScope;session:MessageSession;language:'en'|'ar'|'ur';noticeLanguage?:'en'|'ar'|'ur';available?:boolean;disabled?:boolean;current?:()=>boolean;canMutate?:()=>boolean;onDirtyChange:(value:boolean)=>void;onReceived:()=>void;onSessionLost?:()=>void};
export function CaseVoiceRecorder(props:Props){
  return <VoiceContent key={JSON.stringify([props.session.clientContext,props.session.expiresAt,props.scope])} {...props}/>;
}
function VoiceContent({scope,session,language,noticeLanguage=language,available=true,disabled=false,current=()=>true,canMutate=()=>true,onDirtyChange,onReceived,onSessionLost}:Props){
  const t=copy[language],clearText=clearCopy[language],dialogId=useId();
  const [pending,setPending]=useState<VoicePending|null>(null),[busy,setBusy]=useState(false),[unsaved,setUnsaved]=useState(false),[failure,setFailure]=useState<VoiceFailure|null>(null),[notice,setNotice]=useState<'received'|'failed'|null>(null),[blocked,setBlocked]=useState(false),[generation,setGeneration]=useState(0);
  const mounted=useRef(false),flight=useRef(false),controller=useRef<AbortController|null>(null),callbacks=useRef({current,canMutate,disabled,available,onDirtyChange,onReceived,onSessionLost});callbacks.current={current,canMutate,disabled,available,onDirtyChange,onReceived,onSessionLost};
  const dialog=useRef<HTMLDialogElement>(null),clearTrigger=useRef<HTMLElement|null>(null),checkButton=useRef<HTMLButtonElement>(null),clearIntent=useRef<{id:string;generation:number}|null>(null);
  const isCurrent=()=>mounted.current&&callbacks.current.current()&&validConversationSession(session);
  const maySend=()=>isCurrent()&&callbacks.current.available&&!callbacks.current.disabled&&callbacks.current.canMutate();
  const loadSiteNotice=useMemo(()=>async(selected:'en'|'ar'|'ur',signal:AbortSignal)=>{
    try{return await readWorkerRecordingNotice(fetch,session,selected,signal,()=>!signal.aborted&&callbacks.current.current());}
    catch(reason){if(!signal.aborted&&callbacks.current.current()&&reason instanceof WorkerRecordingNoticeError&&reason.code==='session')callbacks.current.onSessionLost?.();throw reason;}
  },[session.clientContext,session.expiresAt]);
  useEffect(()=>{mounted.current=true;try{setPending(readVoicePending(sessionStorage,session,scope));}catch{setBlocked(true);setFailure('recovery');}return()=>{mounted.current=false;controller.current?.abort();callbacks.current.onDirtyChange(false);};},[]);
  useEffect(()=>{callbacks.current.onDirtyChange(unsaved||busy);},[unsaved,busy]);
  function report(error:unknown){
    if(!mounted.current||!callbacks.current.current())return;
    const code=error instanceof VoiceRequestError?error.code:'recovery';setFailure(code);
    if(code==='session')callbacks.current.onSessionLost?.();
  }
  async function request(retained:VoicePending,operation:VoiceOperation){
    const command=new AbortController();controller.current=command;
    return requestCaseVoice(fetch,session,scope,retained,operation,command.signal,isCurrent,maySend);
  }
  function accept(value:VoiceHttpReceipt,retained:VoicePending){
    if(!isCurrent())throw new VoiceRequestError('session');
    if(value.status==='storing')throw new VoiceRequestError('conflict');
    try{clearVoicePending(sessionStorage,session,scope,retained.id);}catch{throw new VoiceRequestError('recovery');}
    setPending(null);setFailure(null);setNotice(value.status);
    if(value.status==='failed'){setGeneration(value=>value+1);return false;}
    callbacks.current.onReceived();return true;
  }
  async function send(bytes:Uint8Array,id:string){
    if(!maySend()||blocked||flight.current)throw Error(t.unavailable);
    flight.current=true;setBusy(true);setFailure(null);setNotice(null);
    const recording=new Uint8Array(bytes);let rejected=false;
    try{
      const retained=await retainVoice(sessionStorage,session,scope,id,recording,maySend);
      if(!isCurrent())throw new VoiceRequestError('session');setPending(retained);
      if(!accept(await request(retained,{kind:'send',bytes:recording}),retained)){rejected=true;throw Error(t.failed);}
    }catch(error){if(!rejected)report(error);throw Error(rejected?t.failed:t.unavailable);}finally{flight.current=false;if(mounted.current)setBusy(false);}
  }
  async function check(){
    if(!pending||flight.current||!isCurrent())return;flight.current=true;setBusy(true);setFailure(null);
    try{if(accept(await request(pending,{kind:'receipt'}),pending))setGeneration(value=>value+1);}catch(error){report(error);}finally{flight.current=false;if(mounted.current)setBusy(false);}
  }
  function askClear(){if(busy||flight.current||!unsaved||!pending||!isCurrent())return;clearIntent.current={id:pending.id,generation};clearTrigger.current=document.activeElement as HTMLElement;dialog.current?.showModal();}
  function confirmClear(){
    if(!busy&&!flight.current&&isCurrent()&&unsaved&&pending?.id===clearIntent.current?.id&&generation===clearIntent.current?.generation){setGeneration(value=>value+1);setUnsaved(false);setFailure(null);setNotice(null);}
    dialog.current?.close();
  }
  if(!current()||!validConversationSession(session))return <p role="alert">{t.unavailable}</p>;
  if(!available&&!pending&&!unsaved&&!busy&&!notice)return null;
  return <div className="case-voice-recorder">
    {pending&&<div className="notice notice-amber"><p role="status">{t.unknown}</p><div className="actions"><button ref={checkButton} className="button outline" disabled={busy||blocked} onClick={()=>void check()}><RefreshCw size={18}/>{t.check}</button>{unsaved&&<button type="button" className="icon-button" title={clearText.action} aria-label={clearText.action} disabled={busy} onClick={askClear}><Trash2 size={18}/></button>}</div></div>}
    {failure&&<p role="alert" className="record-error">{failure==='conflict'?t.unknown:t.unavailable}</p>}{notice&&<p role="status">{t[notice]}</p>}
    <WorkerRecorderView key={generation} language={language} noticeLanguage={noticeLanguage} loadSiteNotice={loadSiteNotice} purpose={scope.kind} retryOnly={!!pending} synthetic={false} disabled={!available||disabled||busy||blocked||!canMutate()||(!!pending&&!unsaved)} saveAllowed={false} onSave={async()=>{throw Error(t.unavailable);}} onSend={send} onUnsavedChange={setUnsaved}/>
    <dialog ref={dialog} className="withdraw-dialog" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-impact`} onKeyDown={keepDialogFocus} onClose={()=>{clearIntent.current=null;if(clearTrigger.current?.isConnected)clearTrigger.current.focus();else checkButton.current?.focus();}}><h2 id={`${dialogId}-title`}>{clearText.title}</h2><p id={`${dialogId}-impact`}>{clearText.impact}</p><div className="actions"><button className="button outline" autoFocus onClick={()=>dialog.current?.close()}>{clearText.cancel}</button><button className="button danger" onClick={confirmClear}>{clearText.confirm}</button></div></dialog>
  </div>;
}
