import {useEffect,useRef,useState} from 'react';
import {RefreshCw,Send,CalendarClock} from 'lucide-react';
import {request,BriefingRequestError} from './BriefingControls';
import {clearPendingPublication,checkedPublicationReceipt,checkedPublicationResult,type PendingPublication} from './publication-recovery';

export default function PublicationRecovery({pending,scope,onResolved}:{pending:PendingPublication;scope:string;onResolved:(id:string)=>void}) {
  const [busy,setBusy]=useState(false),[absent,setAbsent]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const sending=useRef(false),callback=useRef(onResolved);callback.current=onResolved;
  const [rejected,setRejected]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  const finish=()=>{clearPendingPublication(sessionStorage,scope,pending);callback.current(pending.briefingId);};
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setAbsent(false);setRejected(false);setError('');
    request(`/briefings/${encodeURIComponent(pending.briefingId)}/publication-receipts/${pending.kind}/${pending.body.requestId}`,'GET',undefined,controller.signal)
      .then(value=>{if(controller.signal.aborted)return;if(checkedPublicationReceipt(value,pending))finish();else setAbsent(true);})
      .catch(reason=>{if(!controller.signal.aborted)setError((reason as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[pending,scope,refresh]);
  async function retry() {
    if(sending.current || !absent)return;sending.current=true;setBusy(true);setAbsent(false);setError('');
    try {
      const result=await request(`/briefings/${encodeURIComponent(pending.briefingId)}/${pending.kind==='schedule'?'schedules':'publish'}`,'POST',pending.body);
      checkedPublicationResult(result,pending);finish();
    }catch(reason){setError((reason as Error).message);if(reason instanceof BriefingRequestError && [400,409,413,422].includes(reason.status || 0))setRejected(true);}
    finally {sending.current=false;setBusy(false);}
  }
  return <section className="panel publication-recovery"><h1 ref={heading} tabIndex={-1}>Publication receipt</h1>
    <p>{pending.kind==='schedule'?'Schedule':'Publish'} v{pending.body.nextVersion} · {pending.body.workerIds.length} selected {pending.body.workerIds.length===1?'worker':'workers'}</p>
    <p className="staff-recovery-request">Request {pending.body.requestId}</p>
    {busy && <p role="status">Checking saved outcome...</p>}{error && <p role="alert" className="record-error">{error}</p>}
    {absent && <p>No accepted receipt was found. The outcome is not confirmed.</p>}
    <div className="actions"><button className="button outline" disabled={busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={18}/>Check receipt</button>
      {absent && <button className="button primary" disabled={busy} onClick={()=>void retry()}>{pending.kind==='schedule'?<CalendarClock size={18}/>:<Send size={18}/>}Retry unchanged request</button>}
      {rejected && <button className="button outline" disabled={busy} onClick={finish}><RefreshCw size={18}/>Return to draft</button>}
    </div>
  </section>;
}
