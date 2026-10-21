import { useEffect,useRef,useState } from 'react';
import { MessageCircle,RefreshCw,ChevronLeft,ChevronRight } from 'lucide-react';
import {CaseConversation} from './CaseConversation';
import {validWorkerSession,type PageSession} from './session-state';
import {readWorkerHelpHistory,WorkerHelpHistoryError,type HelpHistoryScope,type WorkerHelpPage} from './worker-help-history';

export const workerVersionText = { en: 'History', ar: 'السجل', ur: 'تاریخ' };
export const workerStatusText = {
  en: { sent: 'Sent answers', emptySent: 'No sent answers yet.', check: 'Refresh answer status', pending: 'Answer received. The check is pending.', closed: 'This assignment is closed for new answers and help requests.', history: 'Help requests and follow-up', refresh: 'Refresh requests', empty: 'No help requests or follow-up yet.', open: 'Open', resolved: 'Resolved', followup: 'Response follow-up', unassigned: 'No supervisor assigned yet.', loading: 'Loading requests...', failed: 'Requests could not be loaded.' },
  ar: { sent: 'الإجابات المرسلة', emptySent: 'لا توجد إجابات مرسلة بعد.', check: 'تحديث حالة الإجابة', pending: 'تم استلام الإجابة. التحقق قيد الانتظار.', closed: 'هذه المهمة مغلقة أمام الإجابات وطلبات المساعدة الجديدة.', history: 'طلبات المساعدة والمتابعة', refresh: 'تحديث الطلبات', empty: 'لا توجد طلبات مساعدة أو متابعة بعد.', open: 'مفتوح', resolved: 'تم الحل', followup: 'متابعة الإجابة', unassigned: 'لم يتم تعيين مشرف بعد.', loading: 'جار تحميل الطلبات...', failed: 'تعذر تحميل الطلبات.' },
  ur: { sent: 'بھیجے گئے جواب', emptySent: 'ابھی کوئی جواب نہیں بھیجا گیا۔', check: 'جواب کی حالت تازہ کریں', pending: 'جواب موصول ہو گیا۔ جانچ زیر التوا ہے۔', closed: 'اس کام کے لیے نئے جواب اور مدد کی درخواستیں بند ہیں۔', history: 'مدد کی درخواستیں اور رابطہ', refresh: 'درخواستیں تازہ کریں', empty: 'ابھی مدد کی درخواست یا رابطہ نہیں۔', open: 'کھلی', resolved: 'حل ہو گئی', followup: 'جواب پر رابطہ', unassigned: 'ابھی سپروائزر مقرر نہیں ہوا۔', loading: 'درخواستیں لوڈ ہو رہی ہیں...', failed: 'درخواستیں لوڈ نہیں ہو سکیں۔' },
};

export function WorkerHelpHistory({assignmentId,version,contentLanguage,language,refresh,session,current,onDirtyChange,onSessionLost,timezone,canWrite=true}:{assignmentId:string;version:number;contentLanguage:HelpHistoryScope['language'];language:'en'|'ar'|'ur';refresh:number;session:PageSession;current:()=>boolean;onDirtyChange:(value:boolean)=>void;onSessionLost:()=>void;timezone?:string;canWrite?:boolean}) {
  const copy = workerStatusText[language as keyof typeof workerStatusText] || workerStatusText.en;
  const [retry, setRetry] = useState(0);
  const scopeKey=JSON.stringify([session.clientContext,session.expiresAt,assignmentId,version,contentLanguage]);
  const [paging,setPaging]=useState({scope:scopeKey,page:1});const page=paging.scope===scopeKey?paging.page:1,key=JSON.stringify([scopeKey,page]);
  const selected=useRef(key);selected.current=key;
  const callbacks=useRef({current,onSessionLost,onDirtyChange});callbacks.current={current,onSessionLost,onDirtyChange};
  const [read,setRead]=useState<{key:string;data:WorkerHelpPage|null;failed:boolean}>({key:'',data:null,failed:false});
  const data=read.key===key?read.data:null,failed=read.key===key&&read.failed;
  const [conversation,setConversation]=useState<{scope:string;id:string}|null>(null),[dirty,setDirty]=useState(false);
  const caseId=conversation?.scope===scopeKey&&current()&&validWorkerSession(session)?conversation.id:null;
  const conversationRef=useRef<HTMLDivElement>(null);
  const pagingCopy={en:{previous:'Newer help requests',next:'Older help requests',count:'requests'},ar:{previous:'طلبات المساعدة الأحدث',next:'طلبات المساعدة الأقدم',count:'طلبات'},ur:{previous:'مدد کی نئی درخواستیں',next:'مدد کی پرانی درخواستیں',count:'درخواستیں'}}[language];
  const conversationLabel=language==='ar'?'فتح المحادثة':language==='ur'?'گفتگو کھولیں':'Open conversation';
  function open(id:string){if(dirty||!callbacks.current.current()||!validWorkerSession(session))return;if(caseId===id)conversationRef.current?.focus();else setConversation({scope:scopeKey,id});}
  useEffect(()=>{if(caseId)conversationRef.current?.focus();},[caseId]);
  useEffect(() => {
    const controller=new AbortController();let alive=true,timedOut=false;
    const isCurrent=()=>alive&&selected.current===key&&callbacks.current.current()&&validWorkerSession(session);
    setRead({key,data:null,failed:false});
    const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},15000);
    readWorkerHelpHistory(fetch,session,{assignmentId,version,language:contentLanguage},page,controller.signal,isCurrent)
      .then(value=>{if(isCurrent())setRead({key,data:value,failed:false});}).catch(error=>{
        if(!alive||selected.current!==key||controller.signal.aborted&&!timedOut)return;
        setRead({key,data:null,failed:true});
        if(error instanceof WorkerHelpHistoryError&&error.code==='session')callbacks.current.onSessionLost();
      }).finally(()=>window.clearTimeout(timeout));
    return()=>{alive=false;controller.abort();window.clearTimeout(timeout);};
  },[key,refresh,retry]);
  return <><section className="worker-card">
    <div className="worker-card-head"><h2>{copy.history}</h2><button className="icon-button" aria-label={copy.refresh} title={copy.refresh} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={20} /></button></div>
    <div role={failed?'alert':'status'}>{failed ? copy.failed : data === null ? copy.loading : !data.total ? copy.empty : null}</div>
    {data?.cases.map((item) => <article className="worker-help-entry" key={item.id}>
      <div className="worker-card-head"><strong>{item.status === 'resolved' ? copy.resolved : copy.open}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language,{timeZone:timezone})}</time></div>
      <p dir="auto">{item.helpText || copy.followup}</p><small><bdi>{item.owner || copy.unassigned}</bdi></small>
      <button className="button outline" aria-expanded={caseId===item.id} aria-controls={caseId===item.id?'worker-help-conversation':undefined} disabled={dirty && caseId!==item.id} onClick={()=>open(item.id)}><MessageCircle size={18} aria-hidden="true"/>{conversationLabel}</button>
    </article>)}
    {data&&data.total>0&&<div className="audit-pagination"><span>{page} / {Math.max(1,Math.ceil(data.total/5))} · {data.total} {pagingCopy.count}</span><div className="actions"><button className="icon-button" aria-label={pagingCopy.previous} title={pagingCopy.previous} disabled={dirty||page<=1} onClick={()=>setPaging({scope:scopeKey,page:page-1})}>{language==='en'?<ChevronLeft size={20}/>:<ChevronRight size={20}/>}</button><button className="icon-button" aria-label={pagingCopy.next} title={pagingCopy.next} disabled={dirty||page>=Math.ceil(data.total/5)||page>=5000} onClick={()=>setPaging({scope:scopeKey,page:page+1})}>{language==='en'?<ChevronRight size={20}/>:<ChevronLeft size={20}/>}</button></div></div>}
  </section>{caseId && <div id="worker-help-conversation" ref={conversationRef} tabIndex={-1} role="region" aria-label={conversationLabel}><CaseConversation key={`${caseId}:${scopeKey}`} caseId={caseId} assignmentId={assignmentId} session={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} language={language} timezone={timezone} current={()=>callbacks.current.current()&&validWorkerSession(session)} worker canWrite={canWrite} onDirtyChange={value=>{setDirty(value);callbacks.current.onDirtyChange(value);}} onSessionLost={onSessionLost}/></div>}</>;
}
