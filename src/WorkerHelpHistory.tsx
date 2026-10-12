import { useEffect, useState } from 'react';
import { MessageCircle,RefreshCw } from 'lucide-react';
import {CaseConversation} from './CaseConversation';
import type {MessageSession} from './case-message-recovery';

type HelpCase = { id: string; status: string; createdAt: string; helpText: string | null; owner: string | null };
export const workerVersionText = { en: 'History', ar: 'السجل', ur: 'تاریخ' };
export const workerStatusText = {
  en: { sent: 'Sent answers', emptySent: 'No sent answers yet.', check: 'Refresh answer status', pending: 'Answer received. The check is pending.', closed: 'This assignment is closed for new answers and help requests.', history: 'Help requests and follow-up', refresh: 'Refresh requests', empty: 'No help requests or follow-up yet.', open: 'Open', resolved: 'Resolved', followup: 'Response follow-up', unassigned: 'No supervisor assigned yet.', loading: 'Loading requests...', failed: 'Requests could not be loaded.' },
  ar: { sent: 'الإجابات المرسلة', emptySent: 'لا توجد إجابات مرسلة بعد.', check: 'تحديث حالة الإجابة', pending: 'تم استلام الإجابة. التحقق قيد الانتظار.', closed: 'هذه المهمة مغلقة أمام الإجابات وطلبات المساعدة الجديدة.', history: 'طلبات المساعدة والمتابعة', refresh: 'تحديث الطلبات', empty: 'لا توجد طلبات مساعدة أو متابعة بعد.', open: 'مفتوح', resolved: 'تم الحل', followup: 'متابعة الإجابة', unassigned: 'لم يتم تعيين مشرف بعد.', loading: 'جار تحميل الطلبات...', failed: 'تعذر تحميل الطلبات.' },
  ur: { sent: 'بھیجے گئے جواب', emptySent: 'ابھی کوئی جواب نہیں بھیجا گیا۔', check: 'جواب کی حالت تازہ کریں', pending: 'جواب موصول ہو گیا۔ جانچ زیر التوا ہے۔', closed: 'اس کام کے لیے نئے جواب اور مدد کی درخواستیں بند ہیں۔', history: 'مدد کی درخواستیں اور رابطہ', refresh: 'درخواستیں تازہ کریں', empty: 'ابھی مدد کی درخواست یا رابطہ نہیں۔', open: 'کھلی', resolved: 'حل ہو گئی', followup: 'جواب پر رابطہ', unassigned: 'ابھی سپروائزر مقرر نہیں ہوا۔', loading: 'درخواستیں لوڈ ہو رہی ہیں...', failed: 'درخواستیں لوڈ نہیں ہو سکیں۔' },
};

export function WorkerHelpHistory({ assignmentId, language, refresh,session,onDirtyChange,onSessionLost }: { assignmentId: string; language: string; refresh: number;session:MessageSession;onDirtyChange:(value:boolean)=>void;onSessionLost:()=>void }) {
  const copy = workerStatusText[language as keyof typeof workerStatusText] || workerStatusText.en;
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<HelpCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [caseId,setCaseId]=useState<string|null>(null),[dirty,setDirty]=useState(false);
  const conversationLabel=language==='ar'?'فتح المحادثة':language==='ur'?'گفتگو کھولیں':'Open conversation';
  function open(id:string){if(dirty)return;setCaseId(id);}
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailed(false);
    fetch(`/api/worker/briefings/${encodeURIComponent(assignmentId)}/help`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('Unavailable'); return response.json() as Promise<HelpCase[]>; })
      .then((result) => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [assignmentId, refresh, retry]);
  return <><section className="worker-card">
    <div className="worker-card-head"><h2>{copy.history}</h2><button className="icon-button" aria-label={copy.refresh} title={copy.refresh} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={20} /></button></div>
    <div role="status">{failed ? copy.failed : data === null ? copy.loading : !data.length ? copy.empty : null}</div>
    {data?.map((item) => <article className="worker-help-entry" key={item.id}>
      <div className="worker-card-head"><strong>{item.status === 'resolved' ? copy.resolved : copy.open}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language)}</time></div>
      <p>{item.helpText || copy.followup}</p><small>{item.owner || copy.unassigned}</small>
      <button className="button outline" disabled={dirty && caseId!==item.id} onClick={()=>open(item.id)}><MessageCircle size={18}/>{conversationLabel}</button>
    </article>)}
  </section>{caseId && <CaseConversation key={`${caseId}:${session.clientContext}`} caseId={caseId} session={session} language={language} worker onDirtyChange={value=>{setDirty(value);onDirtyChange(value);}} onSessionLost={onSessionLost}/>}</>;
}
