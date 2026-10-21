import { useEffect,useRef,useState } from 'react';
import { CheckCircle2,Clock3,TriangleAlert,ChevronLeft,ChevronRight,RefreshCw } from 'lucide-react';
import {readWorkerSubmissions,workerSubmissionState,WorkerSubmissionsError,type SubmissionScope,type WorkerSubmissionPage} from './worker-submissions';
import {validWorkerSession,type PageSession} from './session-state';
const copy={
  en:{title:'My submitted answers',refresh:'Refresh submitted answers',loading:'Loading answers...',failed:'Answers could not be loaded.',empty:'No submitted answers yet.',audio:'Recorded answer',typed:'Typed answer',latest:'Latest',pending:'Check pending',matched:'Matched key facts',clarification:'Needs clarification',unassessable:'Could not assess',audioFailed:'Audio check failed',previous:'Previous answers',next:'Next answers',count:'answers'},
  ar:{title:'إجاباتي المرسلة',refresh:'تحديث الإجابات المرسلة',loading:'جار تحميل الإجابات...',failed:'تعذر تحميل الإجابات.',empty:'لا توجد إجابات مرسلة بعد.',audio:'إجابة صوتية',typed:'إجابة مكتوبة',latest:'الأحدث',pending:'التحقق قيد الانتظار',matched:'طابقت المعلومات المطلوبة',clarification:'تحتاج إلى توضيح',unassessable:'تعذر التقييم',audioFailed:'تعذر التحقق من الصوت',previous:'الإجابات السابقة',next:'الإجابات التالية',count:'إجابات'},
  ur:{title:'میرے بھیجے گئے جواب',refresh:'بھیجے گئے جواب تازہ کریں',loading:'جواب لوڈ ہو رہے ہیں...',failed:'جواب لوڈ نہیں ہو سکے۔',empty:'ابھی کوئی جواب نہیں بھیجا گیا۔',audio:'ریکارڈ کیا گیا جواب',typed:'لکھا ہوا جواب',latest:'تازہ ترین',pending:'جانچ زیر التوا',matched:'اہم حقائق درست ہیں',clarification:'وضاحت درکار ہے',unassessable:'جانچ ممکن نہیں',audioFailed:'آواز کی جانچ ناکام ہوئی',previous:'پچھلے جواب',next:'اگلے جواب',count:'جواب'},
};

const statusCopy={
  en:{received:'Received',paused:'Check paused',unavailable:'Recording no longer available',version:'Briefing',limits:'A match is not proof of understanding or permission to begin work.'},
  ar:{received:'تم الاستلام',paused:'التحقق متوقف مؤقتاً',unavailable:'التسجيل لم يعد متاحاً',version:'التعليمات',limits:'تطابق الإجابة ليس دليلاً على الفهم أو إذناً ببدء العمل.'},
  ur:{received:'موصول ہو گیا',paused:'جانچ رکی ہوئی ہے',unavailable:'ریکارڈنگ اب دستیاب نہیں',version:'ہدایت',limits:'جواب کا درست ہونا سمجھ کا ثبوت یا کام شروع کرنے کی اجازت نہیں۔'},
};
export function WorkerSubmissions({assignmentId,version,contentLanguage,session,language,refresh,current,onSessionLost,timezone}:{assignmentId:string;version:number;contentLanguage:SubmissionScope['language'];session:PageSession;language:'en'|'ar'|'ur';refresh:number;current:()=>boolean;onSessionLost:()=>void;timezone?:string}) {
  const t=copy[language as keyof typeof copy] || copy.en;
  const states=statusCopy[language];
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const key=JSON.stringify([session.clientContext,session.expiresAt,assignmentId,version,contentLanguage,page]);
  const selected=useRef(key);selected.current=key;
  const [read,setRead]=useState<{key:string;data:WorkerSubmissionPage|null;failed:boolean}>({key:'',data:null,failed:false});
  const data=read.key===key?read.data:null,failed=read.key===key&&read.failed;
  useEffect(() => {
    const controller=new AbortController();let alive=true,timedOut=false;
    const isCurrent=()=>alive&&selected.current===key&&current()&&validWorkerSession(session);
    setRead({key,data:null,failed:false});
    const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},15000);
    readWorkerSubmissions(fetch,session,{assignmentId,version,language:contentLanguage},page,controller.signal,isCurrent)
      .then(value=>{if(isCurrent())setRead({key,data:value,failed:false});}).catch(error=>{
        if(!alive||selected.current!==key||controller.signal.aborted&&!timedOut)return;
        setRead({key,data:null,failed:true});
        if(error instanceof WorkerSubmissionsError&&error.code==='session')onSessionLost();
      }).finally(()=>window.clearTimeout(timeout));
    return()=>{alive=false;controller.abort();window.clearTimeout(timeout);};
  },[key,refresh,retry]);
  return <section className="worker-card worker-submissions"><div className="worker-card-head"><h2>{t.title}</h2><button className="icon-button" aria-label={t.refresh} title={t.refresh} onClick={() => setRetry((value) => value+1)}><RefreshCw size={20} /></button></div>
    <div role={failed ? 'alert' : 'status'}>{failed ? t.failed : data===null ? t.loading : !data.total ? t.empty : null}</div>
    {data?.receipts.map((receipt) => <article className="worker-help-entry" key={receipt.id}>
      <div className="worker-card-head"><strong>{receipt.kind==='audio' ? t.audio : t.typed}{receipt.isLatest ? ` · ${t.latest}` : ''}</strong><time dateTime={receipt.receivedAt}>{new Date(receipt.receivedAt).toLocaleString(language,{timeZone:timezone})}</time></div>
      <p className="muted">{states.version} v{data.assignment.version} · <bdi>{data.assignment.language.toUpperCase()}</bdi></p>
      <ol className="worker-submission-steps"><li><CheckCircle2 size={20} aria-hidden="true"/><span>{states.received}</span></li><li data-state={workerSubmissionState(receipt)}>{receipt.outcome==='matched'?<CheckCircle2 size={20} aria-hidden="true"/>:workerSubmissionState(receipt)==='pending'||workerSubmissionState(receipt)==='paused'?<Clock3 size={20} aria-hidden="true"/>:<TriangleAlert size={20} aria-hidden="true"/>}<span>{workerSubmissionState(receipt)==='paused'?states.paused:workerSubmissionState(receipt)==='unavailable'?states.unavailable:t[workerSubmissionState(receipt) as 'pending'|'audioFailed'|'matched'|'clarification'|'unassessable']}</span></li></ol>
      {receipt.answerText!==null && <p dir="auto">{receipt.answerText}</p>}
      {receipt.recordingId && <audio controls preload="none" aria-label={t.audio} src={`/api/recordings/${encodeURIComponent(receipt.recordingId)}/audio`} />}
    </article>)}
    {data && data.total>0 && <><p className="muted">{states.limits}</p><div className="audit-pagination"><span>{page} / {Math.max(1,Math.ceil(data.total/5))} · {data.total} {t.count}</span><div className="actions"><button className="icon-button" aria-label={t.previous} title={t.previous} disabled={page<=1} onClick={() => setPage((value) => value-1)}>{language==='en' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</button><button className="icon-button" aria-label={t.next} title={t.next} disabled={page>=Math.ceil(data.total/5)||page>=5000} onClick={() => setPage((value) => value+1)}>{language==='en' ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</button></div></div></>}
  </section>;
}
