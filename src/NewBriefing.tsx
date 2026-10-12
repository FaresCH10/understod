import {useEffect,useRef,useState,type RefObject} from 'react';
import {ArrowLeft,FileText,RefreshCw} from 'lucide-react';
import {request,BriefingRequestError} from './BriefingControls';
import {readPendingDraftCreation,savePendingDraftCreation,clearPendingDraftCreation,checkedDraftCreationResult,checkedDraftCreationReceipt,type PendingDraftCreation} from './draft-creation-recovery';
import SourceAudio from './SourceAudio';
import type {PreparedSourceAudio} from './source-audio';
import SourceUploadRecovery from './SourceUploadRecovery';
import DraftSteps from './DraftSteps';
import {prepareSourceUpload,readPendingSourceUpload,savePendingSourceUpload,clearPendingSourceUpload,sendSourceUpload,type PendingSourceUpload,type SourceUploadSession} from './source-audio-upload';

export default function NewBriefing({scope,uploadSession,navigate,navigationGuard}:{scope?:string|null;uploadSession:SourceUploadSession;navigate:(path:string)=>void;navigationGuard:RefObject<((next:string,resume?:()=>void)=>boolean)|null>}) {
  const [recovery,setRecovery]=useState<{pending:PendingDraftCreation|null;error:string}>(()=>{
    try {return {pending:scope?readPendingDraftCreation(sessionStorage,scope):null,error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}
  });
  const [uploadRecovery,setUploadRecovery]=useState<{pending:PendingSourceUpload|null;error:string}>(()=>{
    try {return {pending:readPendingSourceUpload(sessionStorage,uploadSession),error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}
  });
  const [audioAccepted,setAudioAccepted]=useState(false);
  const [title,setTitle]=useState('Shelf colour handover'),[source,setSource]=useState('Put finished items on the blue shelf. Put unfinished items on the yellow shelf. Leave the walkway clear.');
  const [siteDefaults,setSiteDefaults]=useState(true),[languages,setLanguages]=useState(['en','ar','ur']);
  const [sourceMode,setSourceMode]=useState<'text'|'audio'>('text'),[sourceAudio,setSourceAudio]=useState<PreparedSourceAudio|null>(null);
  const [audioActive,setAudioActive]=useState(false),approvedRoute=useRef<string|null>(null);
  const leaveDialog=useRef<HTMLDialogElement>(null),leaveAction=useRef<(()=>void)|null>(null),leaveTrigger=useRef<HTMLElement|null>(null);
  function askLeave(action:()=>void) {
    leaveAction.current=action;leaveTrigger.current=document.activeElement as HTMLElement;leaveDialog.current?.showModal();
  }
  function cancelLeave(){leaveAction.current=null;leaveDialog.current?.close();leaveTrigger.current?.focus();}
  const unsavedAudio=!audioAccepted && (audioActive || Boolean(sourceAudio));
  useEffect(()=>{
    const guard=(next:string,resume?:()=>void)=>{
      if(next==='briefings/new' || approvedRoute.current===next)return true;
      if(sending.current){setError('Wait for the save outcome before leaving.');return false;}
      if(!unsavedAudio)return true;
      if(location.hash!=='#briefings/new')history.replaceState(null,'',`${location.pathname}${location.search}#briefings/new`);
      askLeave(()=>{approvedRoute.current=next;if(resume)resume();else navigate(next);});
      return false;
    };
    navigationGuard.current=guard;return()=>{if(navigationGuard.current===guard)navigationGuard.current=null;};
  },[unsavedAudio,navigationGuard]);
  useEffect(()=>{
    if(!unsavedAudio)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[unsavedAudio]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const sending=useRef(false),requestId=useRef(crypto.randomUUID());
  const leavePrompt=<dialog ref={leaveDialog} className="withdraw-dialog" aria-labelledby="source-audio-leave-title" onCancel={event=>{event.preventDefault();cancelLeave();}}><h2 id="source-audio-leave-title">Discard source audio from this tab?</h2><p>Audio bytes retained in memory will be lost. Any saved upload receipt reference will remain in this tab.</p><div className="actions"><button className="button outline" onClick={cancelLeave}>Keep audio</button><button className="button danger" onClick={()=>{const action=leaveAction.current;leaveAction.current=null;leaveDialog.current?.close();action?.();}}>Discard and continue</button></div></dialog>;
  if(uploadRecovery.error)return <section role="alert"><h1>Source audio recovery</h1><p>{uploadRecovery.error}</p></section>;
  if(uploadRecovery.pending)return <><SourceUploadRecovery pending={uploadRecovery.pending} audio={sourceAudio} onAudio={setSourceAudio} onActivity={setAudioActive} onAccepted={setAudioAccepted} navigate={navigate} onResolved={id=>{
    clearPendingSourceUpload(sessionStorage,uploadSession,uploadRecovery.pending!);setAudioAccepted(true);approvedRoute.current=`briefings/${id}`;navigate(`briefings/${id}`);
  }} onContinue={()=>{
    clearPendingSourceUpload(sessionStorage,uploadSession,uploadRecovery.pending!);setSourceAudio(null);setAudioActive(false);setAudioAccepted(false);setUploadRecovery({pending:null,error:''});setSourceMode('text');setError('');requestId.current=crypto.randomUUID();
  }}/>{leavePrompt}</>;
  if(recovery.error)return <section role="alert"><h1>Draft recovery</h1><p>{recovery.error}</p></section>;
  if(recovery.pending && scope)return <CreationRecovery pending={recovery.pending} scope={scope} onResolved={id=>{setRecovery({pending:null,error:''});navigate(`briefings/${id}`);}} onRejected={()=>{const old=recovery.pending!;clearPendingDraftCreation(sessionStorage,scope,old);setTitle(old.title);setSource(old.source);setSiteDefaults(!old.generationLanguages);setLanguages(old.generationLanguages || ['en','ar','ur']);requestId.current=crypto.randomUUID();setRecovery({pending:null,error:''});}}/>;
  async function save() {
    if(sending.current)return;sending.current=true;setBusy(true);setError('');
    if(sourceMode==='audio') {
      let pending:PendingSourceUpload|null=null;
      try {
        if(!sourceAudio)throw Error('Choose or record source audio first.');
        pending=await prepareSourceUpload(sourceAudio,{requestId:requestId.current,title,...(!siteDefaults?{generationLanguages:languages}:{})},uploadSession);
        savePendingSourceUpload(sessionStorage,uploadSession,pending);
        try {await sendSourceUpload(pending,sourceAudio,undefined,AbortSignal.timeout(45000));}finally {setUploadRecovery({pending,error:''});}
      }catch(reason){setError((reason as Error).message);}
      finally {sending.current=false;setBusy(false);}
      return;
    }
    const pending={requestId:requestId.current,title,source,...(!siteDefaults?{generationLanguages:languages}:{})};let retained=false;
    try {
      if(!scope)throw Error('Draft recovery identity is unavailable. No request was sent.');
      savePendingDraftCreation(sessionStorage,scope,pending);retained=true;
      const result=await request('/briefings','POST',pending);
      const id=await checkedDraftCreationResult(result,pending);clearPendingDraftCreation(sessionStorage,scope,pending);approvedRoute.current=`briefings/${id}`;navigate(`briefings/${id}`);
    }catch(reason) {
      if(retained && scope) {
        if(reason instanceof BriefingRequestError && [400,409,413,422].includes(reason.status || 0)) {
          try {clearPendingDraftCreation(sessionStorage,scope,pending);setError(reason.message);}catch(failure){setRecovery({pending,error:''});setError((failure as Error).message);}
        }else setRecovery({pending,error:''});
      }else setError((reason as Error).message);
    }finally {sending.current=false;setBusy(false);}
  }
  return <><button className="back-link" onClick={()=>navigate('briefings')}><ArrowLeft size={18}/>Back to briefings</button><div className="page-header"><div><h1>New briefing</h1></div></div><DraftSteps draft={null} active="source"/>
    <section className="panel"><h2>Source</h2><form onSubmit={event=>{event.preventDefault();void save();}}>
      <label className="field">Title<input value={title} disabled={busy} onChange={event=>{requestId.current=crypto.randomUUID();setTitle(event.target.value);}} required minLength={3} maxLength={120}/></label>
      <div role="group" aria-label="Source format" className="segmented"><button type="button" aria-pressed={sourceMode==='text'} className={sourceMode==='text'?'selected':''} disabled={busy} onClick={()=>{const change=()=>{setSourceAudio(null);setSourceMode('text');};if(audioActive)askLeave(change);else change();}}>Text</button><button type="button" aria-pressed={sourceMode==='audio'} className={sourceMode==='audio'?'selected':''} disabled={busy} onClick={()=>setSourceMode('audio')}>Audio</button></div>
      {sourceMode==='text'?<label className="field">Briefing text<textarea value={source} disabled={busy} onChange={event=>{requestId.current=crypto.randomUUID();setSource(event.target.value);}} required minLength={10} maxLength={4000} rows={7}/></label>:<><SourceAudio disabled={busy} onChange={setSourceAudio} onActivityChange={setAudioActive}/><p role="status" className="notice amber">{sourceAudio?'Source audio is retained in memory until uploaded.':'No source audio has been sent.'} Transcription requires a permitted provider.</p></>}
      <fieldset className="generation-language-options"><legend>Preparation languages</legend><label className="billing-confirm"><input type="checkbox" disabled={busy} checked={siteDefaults} onChange={event=>{requestId.current=crypto.randomUUID();setSiteDefaults(event.target.checked);}}/><span>Use site generation defaults</span></label>
        {!siteDefaults && ['en','ar','ur'].map(code=><label className="billing-confirm" key={code}><input type="checkbox" disabled={busy || code==='en'} checked={languages.includes(code)} onChange={event=>{requestId.current=crypto.randomUUID();setLanguages(old=>['en','ar','ur'].filter(language=>language===code?event.target.checked:old.includes(language)));}}/><span>{code==='en'?'English (source)':code==='ar'?'Arabic':'Urdu'}</span></label>)}
      </fieldset>
      {error && <p role="alert" className="record-error">{error}</p>}<button className="button primary" disabled={busy || (sourceMode==='audio' && !sourceAudio)}><FileText size={18}/>{busy?'Saving...':sourceMode==='audio'?'Upload source audio':'Save draft'}</button>
    </form></section>{leavePrompt}</>;
}

function CreationRecovery({pending,scope,onResolved,onRejected}:{pending:PendingDraftCreation;scope:string;onResolved:(id:string)=>void;onRejected:()=>void}) {
  const [busy,setBusy]=useState(false),[absent,setAbsent]=useState(false),[rejected,setRejected]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const sending=useRef(false),heading=useRef<HTMLHeadingElement>(null),callback=useRef(onResolved);callback.current=onResolved;
  useEffect(()=>{heading.current?.focus();},[]);
  const finish=(id:string)=>{clearPendingDraftCreation(sessionStorage,scope,pending);callback.current(id);};
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setAbsent(false);setRejected(false);setError('');
    request(`/draft-creation-receipts/${pending.requestId}`,'GET',undefined,controller.signal)
      .then(async value=>{const id=await checkedDraftCreationReceipt(value,pending);if(controller.signal.aborted)return;if(id)finish(id);else setAbsent(true);})
      .catch(reason=>{if(!controller.signal.aborted)setError((reason as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[pending,scope,refresh]);
  async function retry() {
    if(sending.current || !absent)return;sending.current=true;setBusy(true);setAbsent(false);setError('');
    try {const result=await request('/briefings','POST',pending);finish(await checkedDraftCreationResult(result,pending));}
    catch(reason){setError((reason as Error).message);if(reason instanceof BriefingRequestError && [400,409,413,422].includes(reason.status || 0))setRejected(true);}
    finally {sending.current=false;setBusy(false);}
  }
  return <section className="panel draft-creation-recovery"><h1 ref={heading} tabIndex={-1}>Draft receipt</h1><p>{pending.title}</p><p>Preparation languages: {pending.generationLanguages?.map(code=>code==='en'?'English':code==='ar'?'Arabic':'Urdu').join(', ') || 'Site generation defaults'}</p><p className="staff-recovery-request">Request {pending.requestId}</p>
    {busy && <p role="status">Checking saved outcome...</p>}{error && <p role="alert" className="record-error">{error}</p>}{absent && <p>No accepted receipt was found. The outcome is not confirmed.</p>}
    <div className="actions"><button className="button outline" disabled={busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={18}/>Check receipt</button>
      {absent && <button className="button primary" disabled={busy} onClick={()=>void retry()}><FileText size={18}/>Retry unchanged request</button>}
      {rejected && <button className="button outline" disabled={busy} onClick={()=>{try {onRejected();}catch(reason){setError((reason as Error).message);}}}><RefreshCw size={18}/>Return to form</button>}
    </div></section>;
}
