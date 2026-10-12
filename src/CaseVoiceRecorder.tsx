import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {WorkerRecorderView} from './WorkerRecorderView';
import type {MessageSession} from './case-message-recovery';
import {readVoicePending,retainVoice,checkedVoiceReceipt,clearVoicePending,type VoicePending,type VoiceScope} from './case-voice-recovery';

const copy={en:{unknown:'Voice delivery is unconfirmed. Check the receipt before retrying the same recording.',check:'Check voice receipt',received:'Voice message received.',failed:'Voice recording was not received. Record a new message.',unavailable:'Voice receipt could not be verified.'},
  ar:{unknown:'لم يتأكد إرسال الصوت. تحقق من الاستلام قبل إعادة إرسال التسجيل نفسه.',check:'تحقق من استلام الصوت',received:'تم استلام الرسالة الصوتية.',failed:'لم يتم استلام التسجيل. سجّل رسالة جديدة.',unavailable:'تعذر التحقق من استلام الصوت.'},
  ur:{unknown:'صوتی پیغام کی ترسیل غیر مصدقہ ہے۔ وہی ریکارڈنگ دوبارہ بھیجنے سے پہلے وصولی چیک کریں۔',check:'صوتی پیغام کی وصولی چیک کریں',received:'صوتی پیغام موصول ہو گیا۔',failed:'ریکارڈنگ موصول نہیں ہوئی۔ نیا پیغام ریکارڈ کریں۔',unavailable:'صوتی پیغام کی وصولی کی تصدیق نہیں ہو سکی۔'}};
export function CaseVoiceRecorder({scope,session,language,noticeLanguage=language,disabled=false,onDirtyChange,onReceived,onSessionLost}:{scope:VoiceScope;session:MessageSession;language:'en'|'ar'|'ur';noticeLanguage?:'en'|'ar'|'ur';disabled?:boolean;onDirtyChange:(value:boolean)=>void;onReceived:()=>void;onSessionLost?:()=>void}) {
  const t=copy[language],url=scope.kind==='help'?`/api/worker/briefings/${encodeURIComponent(scope.id)}/help-audio`:`/api/clarifications/${encodeURIComponent(scope.id)}/voice`;
  const [pending,setPending]=useState<VoicePending|null>(null),[busy,setBusy]=useState(false),[unsaved,setUnsaved]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[blocked,setBlocked]=useState(false),[generation,setGeneration]=useState(0);
  const mounted=useRef(false),flight=useRef(false),callbacks=useRef({onDirtyChange,onReceived,onSessionLost});callbacks.current={onDirtyChange,onReceived,onSessionLost};
  useEffect(()=>{mounted.current=true;try{setPending(readVoicePending(sessionStorage,session,scope));}catch{setBlocked(true);setError(t.unavailable);}return()=>{mounted.current=false;callbacks.current.onDirtyChange(false);};},[scope.kind,scope.id,session.clientContext]);
  useEffect(()=>{callbacks.current.onDirtyChange(unsaved || busy);},[unsaved,busy]);
  async function request(id:string,bytes?:Uint8Array) {
    if(Date.parse(session.expiresAt)<=Date.now())throw Error(t.unavailable);
    const response=await fetch(`${url}/${encodeURIComponent(id)}`,{credentials:'include',headers:{'x-client-session-context':session.clientContext,...(bytes?{'content-type':'audio/wav'}:{})},...(bytes?{method:'POST',body:new Uint8Array(bytes)}:{})});
    const value=await response.json();if(response.status===401 || value.error==='Session context changed'){callbacks.current.onSessionLost?.();throw Error(t.unavailable);}if(!response.ok)throw Error(t.unavailable);return value;
  }
  function accept(value:unknown,retained:VoicePending) {
    const row=checkedVoiceReceipt(value,scope,retained);
    if(row.status==='storing')throw Error(t.unknown);
    clearVoicePending(sessionStorage,session,scope,retained.id);setPending(null);setError('');
    if(row.status==='failed'){setGeneration(value=>value+1);setNotice(t.failed);return false;}
    setNotice(t.received);callbacks.current.onReceived();return true;
  }
  async function send(bytes:Uint8Array,id:string) {
    if(disabled || blocked || flight.current)throw Error(t.unavailable);flight.current=true;setBusy(true);setError('');setNotice('');
    try {
      const retained=await retainVoice(sessionStorage,session,scope,id,bytes);if(!mounted.current)throw Error(t.unavailable);setPending(retained);
      const value=await request(id,bytes);if(!mounted.current)throw Error(t.unavailable);if(!accept(value,retained))throw Error(t.failed);
    }catch(reason){if(mounted.current)setError((reason as Error).message);throw reason;}finally{flight.current=false;if(mounted.current)setBusy(false);}
  }
  async function check() {
    if(!pending || flight.current)return;flight.current=true;setBusy(true);setError('');
    try{const value=await request(pending.id);if(mounted.current){const received=accept(value,pending);if(received)setGeneration(value=>value+1);}}
    catch{if(mounted.current)setError(t.unavailable);}finally{flight.current=false;if(mounted.current)setBusy(false);}
  }
  return <div className="case-voice-recorder">
    {pending && <div className="notice notice-amber"><p role="status">{t.unknown}</p><button className="button outline" disabled={busy || blocked} onClick={()=>void check()}><RefreshCw size={18}/>{t.check}</button></div>}
    {error && <p role="alert" className="record-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <WorkerRecorderView key={generation} language={language} noticeLanguage={noticeLanguage} purpose={scope.kind} retryOnly={!!pending} synthetic={false} disabled={disabled || busy || blocked || (!!pending && !unsaved)} saveAllowed={false} onSave={async()=>{throw Error(t.unavailable);}} onSend={send} onUnsavedChange={setUnsaved}/>
  </div>;
}
