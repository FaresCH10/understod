import { useEffect,useState } from 'react';
import { ChevronLeft,ChevronRight,RefreshCw } from 'lucide-react';

type Receipt={id:string;kind:string;receivedAt:string;isLatest:boolean;answerText:string|null;outcome:string|null;recordingId:string|null;audioStatus:string|null};
type History={receipts:Receipt[];total:number;page:number;pageSize:number};
const copy={
  en:{title:'My submitted answers',refresh:'Refresh submitted answers',loading:'Loading answers...',failed:'Answers could not be loaded.',empty:'No submitted answers yet.',audio:'Recorded answer',typed:'Typed answer',latest:'Latest',pending:'Check pending',matched:'Matched key facts',clarification:'Needs clarification',unassessable:'Could not assess',audioFailed:'Audio check failed',previous:'Previous answers',next:'Next answers',count:'answers'},
  ar:{title:'إجاباتي المرسلة',refresh:'تحديث الإجابات المرسلة',loading:'جار تحميل الإجابات...',failed:'تعذر تحميل الإجابات.',empty:'لا توجد إجابات مرسلة بعد.',audio:'إجابة صوتية',typed:'إجابة مكتوبة',latest:'الأحدث',pending:'التحقق قيد الانتظار',matched:'طابقت المعلومات المطلوبة',clarification:'تحتاج إلى توضيح',unassessable:'تعذر التقييم',audioFailed:'تعذر التحقق من الصوت',previous:'الإجابات السابقة',next:'الإجابات التالية',count:'إجابات'},
  ur:{title:'میرے بھیجے گئے جواب',refresh:'بھیجے گئے جواب تازہ کریں',loading:'جواب لوڈ ہو رہے ہیں...',failed:'جواب لوڈ نہیں ہو سکے۔',empty:'ابھی کوئی جواب نہیں بھیجا گیا۔',audio:'ریکارڈ کیا گیا جواب',typed:'لکھا ہوا جواب',latest:'تازہ ترین',pending:'جانچ زیر التوا',matched:'اہم حقائق درست ہیں',clarification:'وضاحت درکار ہے',unassessable:'جانچ ممکن نہیں',audioFailed:'آواز کی جانچ ناکام ہوئی',previous:'پچھلے جواب',next:'اگلے جواب',count:'جواب'},
};

export function WorkerSubmissions({assignmentId,language,refresh}:{assignmentId:string;language:string;refresh:number}) {
  const t=copy[language as keyof typeof copy] || copy.en;
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0),[data,setData]=useState<History|null>(null),[failed,setFailed]=useState(false);
  useEffect(() => {
    const controller=new AbortController();setData(null);setFailed(false);
    fetch(`/api/worker/briefings/${encodeURIComponent(assignmentId)}/submissions?page=${page}&pageSize=5`,{credentials:'include',signal:controller.signal})
      .then(async (response) => {if(!response.ok) throw new Error('Unavailable');return response.json() as Promise<History>;})
      .then((value) => {if(!controller.signal.aborted) setData(value);}).catch(() => {if(!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  },[assignmentId,page,refresh,retry]);
  return <section className="worker-card worker-submissions"><div className="worker-card-head"><h2>{t.title}</h2><button className="icon-button" aria-label={t.refresh} title={t.refresh} onClick={() => setRetry((value) => value+1)}><RefreshCw size={20} /></button></div>
    <div role={failed ? 'alert' : 'status'}>{failed ? t.failed : data===null ? t.loading : !data.total ? t.empty : null}</div>
    {data?.receipts.map((receipt) => <article className="worker-help-entry" key={receipt.id}>
      <div className="worker-card-head"><strong>{receipt.kind==='audio' ? t.audio : t.typed}{receipt.isLatest ? ` · ${t.latest}` : ''}</strong><time dateTime={receipt.receivedAt}>{new Date(receipt.receivedAt).toLocaleString(language)}</time></div>
      <p className="muted">{receipt.outcome==='matched' ? t.matched : receipt.outcome==='clarification' ? t.clarification : receipt.outcome==='unassessable' ? t.unassessable : receipt.audioStatus==='failed' ? t.audioFailed : t.pending}</p>
      {receipt.answerText!==null && <p dir="auto">{receipt.answerText}</p>}
      {receipt.recordingId && <audio controls preload="none" aria-label={t.audio} src={`/api/recordings/${encodeURIComponent(receipt.recordingId)}/audio`} />}
    </article>)}
    {data && data.total>0 && <div className="audit-pagination"><span>{page} / {Math.max(1,Math.ceil(data.total/5))} · {data.total} {t.count}</span><div className="actions"><button className="icon-button" aria-label={t.previous} title={t.previous} disabled={page<=1} onClick={() => setPage((value) => value-1)}>{language==='en' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</button><button className="icon-button" aria-label={t.next} title={t.next} disabled={page>=Math.ceil(data.total/5)} onClick={() => setPage((value) => value+1)}>{language==='en' ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</button></div></div>}
  </section>;
}
