import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown, ChevronLeft,ChevronRight, Clock3,
  FileText, HelpCircle, Home, Languages, LogOut, MessageCircle, Plus,
  Search, Send, Settings, Sparkles, TriangleAlert, Users, Volume2,
  BarChart3, Download, Play, RefreshCw, ShieldCheck,KeyRound,Smartphone,
} from 'lucide-react';
import './styles.css';
import { WorkerRecorderView } from './WorkerRecorderView';
import {WorkerDeviceView} from './WorkerDeviceView';
import {WorkerAccessEntry} from './WorkerAccessEntry';
import {WorkerHelpHub} from './WorkerHelpHub';
import {WorkerAudioPlayer} from './WorkerAudioPlayer';
import {workerInboxPath,workerNavigationText,type WorkerInboxTab} from './worker-navigation';
import {readWorkerUiLanguage,readWorkerLockLanguage,saveWorkerUiLanguage,workerUiLanguageText,type WorkerUiLanguage} from './worker-ui-language';
import {workerLeaveRequired,workerLeaveText,workerNavigationDecision,retainWorkerDetail,workerRefreshText,workerInputAvailability,type WorkerLeaveAction} from './worker-unsent';
import {keepDialogFocus} from './dialog-focus';
import {useWorkerSessionGuard} from './useWorkerSessionGuard';
import {workerSessionText,sessionLoadText,validWorkerSession,validStaffSession,sameStaffSession,validPageSession,type PageSession} from './session-state';
import {StaffSessionLock} from './StaffSessionLock';
import {workerRequestId,WorkerRequestError,workerRequestText,checkedWorkerReceipt,readWorkerRequestReceipt,workerReceiptCheckText} from './worker-request';
import {WorkerTextDraftView} from './WorkerTextDraftView';
import {WorkerAudioDraftView} from './WorkerAudioDraftView';
import {BootstrapSessionError,fetchBootstrapSession,reconcileOfflineSession} from './worker-offline';
import {WorkerOfflineEntryView,WorkerOfflineSaveView} from './WorkerOfflineView';
import {clearWorkerLocalData,localCleanupText} from './worker-local-data';
import {usePrivateDevice} from './usePrivateDevice';
import {sendWorkerRecording,WorkerAudioRetryError,workerAudioRetryText} from './worker-audio-retry';
import { PeoplePage } from './People';
import SiteCrews from './SiteCrews';
import {peopleRouteLocale,peopleShellText,type PeopleLocale} from './people-locale';
import {clarificationRoute,caseText,type CaseLocale} from './clarification-locale';
import {reportsRoute,reportText,type ReportLocale} from './report-locale';
import {staffIdentityLabel} from './session-state';
import {StaffSearchBox} from './StaffSearchBox';
import DraftSteps from './DraftSteps';
import {draftSteps,type DraftStep} from './draft-flow';
const StaffSearch=lazy(()=>import('./StaffSearch'));
const BillingPage=lazy(()=>import('./Billing').then(module=>({default:module.BillingPage})));
import {WorkspaceSettings} from './WorkspaceSettings';
const AuditPage=lazy(()=>import('./Audit').then(module=>({default:module.AuditPage})));
import { WorkerImportPage } from './WorkerImport';
const ClarificationsPage=lazy(()=>import('./Clarifications').then(module=>({default:module.ClarificationsPage})));
const ClarificationPage=lazy(()=>import('./Clarifications').then(module=>({default:module.ClarificationPage})));
const ClarificationCreate=lazy(()=>import('./ClarificationCreate'));
import {DraftEditor,CopyDraftControl,ArchiveBriefingControl,useBriefingRequest} from './BriefingControls';
import {PreparationRequest} from './PreparationRequest';
import type {StaffRequestAuthority} from './useStaffRequest';
import {staffRequestBinding} from './staff-request';
import {useArtifactRead} from './useArtifactRead';
import {appStaffAction,checkedPreparationAcknowledgement} from './app-staff-action';
const PublishForm=lazy(()=>import('./PublishForm'));
const NewBriefing=lazy(()=>import('./NewBriefing'));
const PublicProduct=lazy(()=>import('./PublicProduct'));
const Onboarding=lazy(()=>import('./Onboarding'));
const Operations=lazy(()=>import('./Operations'));
const SourceAudioUploads=lazy(()=>import('./SourceAudioUploads'));
const PublicationRecovery=lazy(()=>import('./PublicationRecovery'));
const PublicationSchedules=lazy(()=>import('./PublicationSchedules'));
import { PublicationResponses,ResponseDetail } from './PublicationResponses';
import {checkedProcessingJob,checkedProcessingPage,processingKinds,processingKindLabels,type ProcessingJob,type ProcessingPage,type ProcessingProgress} from './processing-state';
import {ProcessingRetry} from './ProcessingRetry';
import {ProcessingProvenance} from './ProcessingProvenance';
import {ProcessingSourceRetry} from './ProcessingSourceRetry';
import {PublicationHistory} from './PublicationHistory';
import type {PublicationSummary} from './publication-history';
import { WorkerSubmissions } from './WorkerSubmissions';
import {WorkerSubmissionReceipt} from './WorkerSubmissionReceipt';
import { canManageStaff,staffDate,staffGreeting } from './staff-policy';
import { WorkerHelpHistory, workerStatusText, workerVersionText } from './WorkerHelpHistory';
import {CaseVoiceRecorder} from './CaseVoiceRecorder';
import {readWorkerRecordingNotice,WorkerRecordingNoticeError} from './worker-recording-notice';
import { workerResponseState, type WorkerResponse } from './worker-state.ts';
import { workerAccessToken } from './worker-access';
import {prepareWorkerEntry,readPendingWorkerEntry,savePendingWorkerEntry,clearPendingWorkerEntry,recoverWorkerEntry,type PendingWorkerEntry} from './worker-entry-recovery';
import WorkerEntryRecovery from './WorkerEntryRecovery';
const LanguageArtifacts=lazy(()=>import('./LanguageArtifacts').then(module=>({default:module.LanguageArtifacts})));
const LanguageReadiness=lazy(()=>import('./LanguageReadiness').then(module=>({default:module.LanguageReadiness})));
const PlanUsage=lazy(()=>import('./PlanUsage').then(module=>({default:module.PlanUsage})));
const Notifications=lazy(()=>import('./Notifications').then(module=>({default:module.Notifications})));
const ReportsPage=lazy(()=>import('./Reports').then(module=>({default:module.ReportsPage})));
const RetentionSettings=lazy(()=>import('./RetentionSettings').then(module=>({default:module.RetentionSettings})));
import {DraftReview,DraftReviewRecovery,useReviewRecovery} from './DraftReview';
import DraftLanguages from './DraftLanguages';
import type {LanguageSession} from './draft-languages-recovery';
import {readPendingRegeneration} from './regeneration-recovery';
import {readPendingPublication,type PendingPublication} from './publication-recovery';
const RegenerationRecovery=lazy(()=>import('./Regeneration').then(module=>({default:module.RegenerationRecovery})));
class BriefingView extends React.Component<{children:React.ReactNode;label?:string;language?:CaseLocale;fallbackCopy?:{loading:string;unavailable:string;reload:string}},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {
    const copy=this.props.fallbackCopy;
    if(copy)return this.state.failed?<section role="alert"><h2>{copy.unavailable}</h2><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{copy.reload}</button></section>:<Suspense fallback={<p role="status">{copy.loading}</p>}>{this.props.children}</Suspense>;
    if(this.props.language){const language=this.props.language;return this.state.failed?<section role="alert"><h2>{caseText(language,'Clarification page unavailable. Your saved requests are unchanged.')}</h2><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{caseText(language,'Reload')}</button></section>:<Suspense fallback={<p role="status">{caseText(language,'Loading clarification page...')}</p>}>{this.props.children}</Suspense>;}
    return this.state.failed ? <section role="alert"><h2>{this.props.label || 'Briefing view'} unavailable</h2><p>Reload to retry loading the view. Pending requests remain saved in this tab.</p><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>Reload</button></section> : <Suspense fallback={<p role="status">Loading {this.props.label || 'briefing view'}...</p>}>{this.props.children}</Suspense>;
  }
}
import {Templates} from './Templates';
import {Glossary} from './Glossary';
import {StaffAccess} from './StaffAccess';
import {AccountRecovery} from './AccountRecovery';
import {accountRecoveryToken} from './account-recovery-link';
import {AccountSiteSwitcher} from './AccountSiteSwitcher';
import {checkedSiteSession,selectAccountSite,type SiteSession} from './account-site';
import {invitationLinkToken} from './invitation-link';
const StaffInvitations=lazy(()=>import('./StaffInvitations').then(module=>({default:module.StaffInvitations})));
const AcceptInvitation=lazy(()=>import('./AcceptInvitation').then(module=>({default:module.AcceptInvitation})));
class InvitationView extends React.Component<{children:React.ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {return this.state.failed ? <section role="alert"><h1>Invitation view unavailable</h1><p>Reload this page to try again. For acceptance, reopen the original email link.</p><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>Reload</button></section> : <Suspense fallback={<p role="status">Loading invitation...</p>}>{this.props.children}</Suspense>;}
}

type Session = PageSession & { authenticated: boolean; mode: string; role?: 'staff' | 'worker'; staffRole?: 'owner' | 'administrator' | 'supervisor' | 'auditor' | null; name?: string; organization?: string; site?: string;siteState?:'active'|'archived';timezone?:string; language?: string;staffScope?:string|null;billingRecoveryScope?:string|null;templateRecoveryScope?:string|null;staffRecoveryScope?:string|null };
type Counts = { assigned: number; responses: number; matches: number; clarifications: number; unassessed: number; pending: number; completion: number };
type Case = { id: string; worker: string; language: string; title: string; reason: string; status: string; created_at: string };
type Briefing = { id: string; title: string; state: string; next_version: number; published_version: number | null;publication_state:string|null;archived_at:string|null; schedule_state:string|null;scheduled_for:string|null; updated_at: string };
type WorkerBriefing = WorkerResponse & { id: string; title: string; language: string; version: number; reminderAt?:string };
type WorkerBriefingPage={items:WorkerBriefing[];total:number;page:number;pageSize:number;counts:{todo:number;sent:number;history:number;followup:number};asOf:string};
const workerPagingText={
  en:{previous:'Previous briefings',next:'Next briefings',refresh:'Refresh briefings',first:'First page',emptyHistory:'No assigned briefing history yet.'},
  ar:{previous:'التعليمات السابقة',next:'التعليمات التالية',refresh:'تحديث التعليمات',first:'الصفحة الأولى',emptyHistory:'لا يوجد سجل تعليمات مسندة بعد.'},
  ur:{previous:'پچھلی ہدایات',next:'اگلی ہدایات',refresh:'ہدایات تازہ کریں',first:'پہلا صفحہ',emptyHistory:'ابھی کوئی تفویض کردہ ہدایات نہیں ہیں۔'},
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  let data;
  try {data=await response.json();}
  catch {throw Object.assign(new Error('Response could not be read'),{status:response.status});}
  if (!response.ok) throw Object.assign(new Error(data?.error || 'Request failed'),{status:response.status});
  return data as T;
}

function useApi<T>(path: string | null, refresh: number,clientContext?:string): { data: T | null; error: string; errorStatus:number|null; loading: boolean } {
  const key=JSON.stringify([path,clientContext || null]);
  const empty={key,data:null as T|null,error:'',errorStatus:null as number|null,loading:!!path};
  const [read,setRead]=useState(empty);
  useEffect(() => {
    if (!path){setRead(empty);return;}
    let current=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    setRead(previous=>({...empty,data:previous.key===key?previous.data:null,loading:true}));
    api<T>(path,{signal:controller.signal,...(clientContext?{headers:{'content-type':'application/json','x-client-session-context':clientContext}}:{})})
      .then(data=>{if(current)setRead({key,data,error:'',errorStatus:null,loading:false});})
      .catch(error=>{if(current)setRead(previous=>({key,data:previous.key===key?previous.data:null,error:error.message,errorStatus:Number.isInteger(error.status)?error.status:0,loading:false}));})
      .finally(()=>clearTimeout(timeout));
    return()=>{current=false;clearTimeout(timeout);controller.abort();};
  }, [path, refresh,clientContext]);
  return read.key===key?read:empty;
}

function Brand() {
  return <span className="brand">Understood <span className="brand-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span></span>;
}

function SyntheticNote() { return <span className="synthetic-note">Synthetic local demo</span>; }

function Status({ value }: { value: string }) {
  const tone = /match|ready|published|resolved/i.test(value) ? 'green' : /failed|error/i.test(value) ? 'red' : /clarification|processing|pending/i.test(value) ? 'amber' : 'blue';
  return <span className={`status status-${tone}`}><span className="status-dot" />{value.replaceAll('_', ' ')}</span>;
}

function Panel({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}

function Metric({ icon: Icon, value, label, warn = false }: { icon: React.ComponentType<{ size?: number }>; value: number | string; label: string; warn?: boolean }) {
  return <div className={`metric ${warn ? 'metric-warn' : ''}`}><div className="metric-icon"><Icon size={28} /></div><div><strong>{value}</strong><span>{label}</span></div></div>;
}

function Notice({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'blue' | 'green' }) {
  return <div className={`notice notice-${tone}`}><TriangleAlert size={22} /><span>{children}</span></div>;
}

const staffNavigation = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'briefings', label: 'Briefings', icon: FileText },
  { key: 'clarifications', label: 'Clarifications', icon: MessageCircle },
  { key: 'people', label: 'People', icon: Users },
  { key: 'processing', label: 'AI processing', icon: Sparkles },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

// The one-time mount lives in entry.tsx, outside the Fast Refresh boundary.
export default function App() {
  const navigationGuard=useRef<((next:string,resume?:()=>void)=>boolean)|null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoadError,setSessionLoadError]=useState(false),[sessionRetry,setSessionRetry]=useState(0);
  const [offlineAllowed,setOfflineAllowed]=useState(false),[offlineOpen,setOfflineOpen]=useState(false);
  const [view, setView] = useState(location.hash.slice(1) || 'overview');
  const [directoryLanguage,setDirectoryLanguage]=useState<PeopleLocale>('en');
  const [caseUiLanguage,setCaseUiLanguage]=useState<CaseLocale>('en');
  const [reportUiLanguage,setReportUiLanguage]=useState<ReportLocale>('en');
  const staffUiLanguage=reportsRoute(view)?reportUiLanguage:clarificationRoute(view)?caseUiLanguage:peopleRouteLocale(view,directoryLanguage),staffUi=peopleShellText[staffUiLanguage];
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workerToken, setWorkerToken] = useState(() => workerAccessToken(location.hash));
  const [workerEntryLanguage,setWorkerEntryLanguage]=useState<WorkerUiLanguage>(()=>navigator.language.startsWith('ar')?'ar':navigator.language.startsWith('ur')?'ur':'en');
  const [recoveryToken,setRecoveryToken]=useState(()=>accountRecoveryToken(location.hash));
  const [invitationToken,setInvitationToken]=useState(()=>invitationLinkToken(location.hash));
  const authInFlight=useRef(false);
  const [authBusy,setAuthBusy]=useState(false);
  const [localCleanupFailed,setLocalCleanupFailed]=useState(false);
  const [workerEntryRecovery,setWorkerEntryRecovery]=useState<{pending:PendingWorkerEntry|null;error:string}>(()=>{try{return {pending:readPendingWorkerEntry(sessionStorage),error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}});
  const [siteTransition,setSiteTransition]=useState(false),[siteTransitionError,setSiteTransitionError]=useState('');
  const selectingSite=useRef(false);
  const sessionGuard=useWorkerSessionGuard(session,authBusy || siteTransition || Boolean(workerEntryRecovery.pending || workerEntryRecovery.error));
  const activeSession=useRef(session);activeSession.current=session;
  const [clock,setClock]=useState(() => new Date());
  useEffect(() => {const timer=window.setInterval(() => setClock(new Date()),60000);return () => clearInterval(timer);},[]);
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timeout); }, [message]);
  useEffect(() => {
    const onHash = () => {
      if(navigationGuard.current && !navigationGuard.current(location.hash.slice(1) || 'overview'))return;
      if(location.hash.startsWith('#accept-invitation/')) {
        setInvitationToken(invitationLinkToken(location.hash));
        history.replaceState(null,'',`${location.pathname}${location.search}#accept-invitation`);setView('accept-invitation');
      } else if(location.hash.startsWith('#reset-password/')) {
        setRecoveryToken(accountRecoveryToken(location.hash));
        history.replaceState(null,'',`${location.pathname}${location.search}#reset-password`);setView('reset-password');
      } else if(location.hash.startsWith('#worker-access/')) {
        setWorkerToken(workerAccessToken(location.hash));
        history.replaceState(null,'',`${location.pathname}${location.search}#worker-access`);setView('worker-access');
      } else {
        if(location.hash!=='#worker-access') setWorkerToken('');
        if(location.hash!=='#reset-password') setRecoveryToken('');
        if(location.hash!=='#accept-invitation') setInvitationToken('');
        setView(location.hash.slice(1) || 'overview');
      }
    };
    onHash();
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(()=>{
    const controller=new AbortController();setSessionLoadError(false);setOfflineAllowed(false);setOfflineOpen(false);
    fetchBootstrapSession(fetch,controller.signal).then(async value=>{
      const checked=checkedSiteSession(value) as Session;
      if(controller.signal.aborted)return;
      try{await reconcileOfflineSession(checked);}catch{setLocalCleanupFailed(true);}
      if(!controller.signal.aborted)setSession(checked);
    }).catch(error=>{if(!controller.signal.aborted){setSessionLoadError(true);setOfflineAllowed(error instanceof BootstrapSessionError && error.offline);}});
    return()=>controller.abort();
  },[sessionRetry]);
  const navigate = (next: string) => {if(navigationGuard.current && !navigationGuard.current(next))return;location.hash = next; setView(next); window.scrollTo(0, 0); };
  useEffect(()=>{if(session?.authenticated && session.staffRole==='administrator' && !view.startsWith('settings') && !['operations','home','walkthrough','pilot','sign-in','account-recovery','reset-password','accept-invitation'].includes(view)) navigate('settings/staff');},[session?.authenticated,session?.staffRole,view]);
  const reload = () => setRefresh((n) => n + 1);
  const applySiteSession=(next:SiteSession)=>{
    setSession(next);navigate(!next.authenticated ? 'overview' : next.role==='worker' ? 'inbox' : 'overview');
    reload();setSiteTransition(false);setSiteTransitionError('');
  };
  const changeSite=async (staffId:string)=>{
    if(session?.role!=='worker' && navigationGuard.current && !navigationGuard.current('change-site',()=>void changeSite(staffId)))return false;
    if(selectingSite.current) return false;
    selectingSite.current=true;setSiteTransition(true);setSiteTransitionError('');
    try {
      const result=await selectAccountSite((path,body)=>api(path,body ? {method:'POST',body:JSON.stringify(body)} : {}),staffId);
      applySiteSession(result.session);return result.confirmed;
    } catch {
      setSiteTransitionError('The current site could not be verified. Recheck your session before continuing.');
      throw new Error('Site session unavailable');
    } finally {selectingSite.current=false;}
  };
  const recheckSite=async ()=>{
    if(selectingSite.current) return;
    selectingSite.current=true;setSiteTransitionError('');
    try {applySiteSession(checkedSiteSession(await api('/session')));}
    catch {setSiteTransitionError('The current site could not be verified. Recheck your session before continuing.');}
    finally {selectingSite.current=false;}
  };
  const act = async (path: string, body?: unknown) => {
    if(session?.role==='staff'){
      const current=()=>sameStaffSession(session,activeSession.current) && !sessionGuard.isInvalidated() && !selectingSite.current && (path==='/logout' || !authInFlight.current);
      try{return await appStaffAction(session,path,body || {},fetch,current,()=>!sessionGuard.isLocked(),sessionGuard.invalidate,()=>{setMessage(path==='/logout'?'Saved.':'Preparation requested.');reload();});}
      catch(reason){if(current())setMessage((reason as Error).message);return null;}
    }
    try {
      if(session?.authenticated && (sessionGuard.isLocked() || !validPageSession(session))){sessionGuard.invalidate();return null;}
      const result = await api<any>(path, { method: 'POST',headers:{'content-type':'application/json',...(session?.clientContext ? {'x-client-session-context':session.clientContext} : {})}, body: JSON.stringify(body || {}) });
      if(session?.authenticated && (session.clientContext!==activeSession.current?.clientContext || sessionGuard.isLocked()))throw new Error('Session context changed');
      if(session?.role==='worker' && /^\/worker\/briefings\/[^/]+\/(answers|help)$/.test(path)){
        const input=body as {submissionId?:string;requestId?:string};
        if(sessionGuard.isLocked() || !validWorkerSession(session))throw new WorkerRequestError('receipt');
        checkedWorkerReceipt(result,path.endsWith('/answers')?'answer':'help',{requestId:input.submissionId || input.requestId || '',assignmentId:path.split('/')[3],clientContext:session.clientContext || ''});
      }
      setMessage('Saved.'); reload(); return result;
    } catch (error) {if(error instanceof WorkerRequestError)throw error;if(['Session context changed','Sign in required'].includes((error as Error).message))sessionGuard.invalidate();setMessage((error as Error).message); return null; }
  };
  const signIn = async (principal: string) => {
    if(authInFlight.current || localCleanupFailed)return;
    authInFlight.current=true;setAuthBusy(true);
    try {
      if(!await clearWorkerLocalData()){setLocalCleanupFailed(true);return;}
      await api('/demo/session', { method: 'POST', body: JSON.stringify({ principal }) });
      setSession(await api<Session>('/session'));
      navigate(principal.startsWith('worker') ? 'inbox' : 'overview');
    } catch (error) { setMessage((error as Error).message); }
    finally {authInFlight.current=false;setAuthBusy(false);}
  };
  const signInCredential = async (kind: 'staff' | 'worker') => {
    if(authInFlight.current || localCleanupFailed || workerEntryRecovery.pending || workerEntryRecovery.error) return;
    authInFlight.current=true;setAuthBusy(true);setMessage('');
    try {
      if(!await clearWorkerLocalData()){setLocalCleanupFailed(true);return;}
      let entry:PendingWorkerEntry|null=null;
      if(kind==='worker'){
        entry=await prepareWorkerEntry(workerToken.trim(),workerEntryLanguage);savePendingWorkerEntry(sessionStorage,entry);
        setWorkerEntryRecovery({pending:entry,error:''});
      }
      if(kind==='worker' && session?.authenticated) {
        await api('/logout',{method:'POST',headers:{'content-type':'application/json',...(session.clientContext ? {'x-client-session-context':session.clientContext} : {})},body:'{}'});
        setSession({authenticated:false,mode:session.mode,language:session.language});
      }
      await api(kind === 'staff' ? '/auth/staff/login' : '/auth/worker/redeem', {
        method: 'POST', body: JSON.stringify(kind === 'staff' ? { email, password } : { token: workerToken.trim() }),
      });
      if(kind==='worker') {
        const recovered=await recoverWorkerEntry(entry!,api);if(!recovered)throw Error('Worker access could not be confirmed.');
        finishWorkerEntry(recovered,entry!);return;
      }
      const signedIn = checkedSiteSession(await api<Session>('/session')) as Session;
      setSession(signedIn);
      setPassword(''); setWorkerToken('');
      navigate(signedIn.role === 'worker' ? 'inbox' : 'overview');
    } catch (error) { setMessage((error as Error).message); }
    finally {authInFlight.current=false;setAuthBusy(false);}
  };
  function finishWorkerEntry(signedIn:PageSession,pending:PendingWorkerEntry){
    saveWorkerUiLanguage(sessionStorage,signedIn,pending.language);clearPendingWorkerEntry(sessionStorage,pending);
    setWorkerToken('');setWorkerEntryRecovery({pending:null,error:''});
    location.hash='inbox';location.reload();
  }
  async function anotherWorkerLink(){
    const current=checkedSiteSession(await api('/session',{cache:'no-store'}));
    if(!await clearWorkerLocalData()){
      if(workerEntryRecovery.pending)savePendingWorkerEntry(sessionStorage,workerEntryRecovery.pending);
      throw Error('Local saved data could not be cleared. No new link was opened.');
    }
    setSession(current);setWorkerToken('');setWorkerEntryRecovery({pending:null,error:''});
    location.hash='worker-access';location.reload();
  }
  const logout = async () => {
    if(session?.role!=='worker' && navigationGuard.current && !navigationGuard.current('sign-out',()=>void logout()))return false;
    if(authInFlight.current)return false;
    authInFlight.current=true;setAuthBusy(true);
    try {
      if (!await act('/logout')) return false;
      const cleared=await clearWorkerLocalData(session?.clientContext);
      setSession({ authenticated: false, mode: session?.mode || 'synthetic-demo',language:session?.language }); navigate('overview');
      setLocalCleanupFailed(!cleared);setMessage('');
      return true;
    } finally {authInFlight.current=false;setAuthBusy(false);}
  };

  if(workerEntryRecovery.pending || workerEntryRecovery.error)return <main className="entry-page"><Brand/><WorkerEntryRecovery pending={workerEntryRecovery.pending} storageError={workerEntryRecovery.error} paused={authBusy} request={api} onResolved={signedIn=>finishWorkerEntry(signedIn,workerEntryRecovery.pending!)} onAnother={anotherWorkerLink}/></main>;
  if(view==='operations')return <BriefingView label="Platform operations"><Operations/></BriefingView>;
  if(['home','walkthrough','pilot'].includes(view) || (session?.authenticated===false && view==='overview'))return <BriefingView label="public site"><PublicProduct view={view}/></BriefingView>;
  if (!session) {
    const language=navigator.language.startsWith('ar')?'ar':navigator.language.startsWith('ur')?'ur':'en';
    const text=sessionLoadText[language];
    if(offlineAllowed && offlineOpen)return <WorkerOfflineEntryView onBack={()=>{setOfflineOpen(false);setSessionRetry(value=>value+1);}}/>;
    return sessionLoadError ? <main className="entry-page" lang={language} dir={language==='en'?'ltr':'rtl'}><Brand/><section role="alert"><h1>{text.title}</h1><p>{text.body}</p><button className="button primary" onClick={()=>{setSessionLoadError(false);setSessionRetry(value=>value+1);}}><RefreshCw size={18}/>{text.retry}</button>{offlineAllowed && <button className="button outline" onClick={()=>setOfflineOpen(true)}><Download size={18}/>{language==='ar'?'افتح التعليمات المحفوظة':language==='ur'?'محفوظ ہدایات کھولیں':'Open saved briefings'}</button>}</section></main> : <div className="loading-page">Loading Understood...</div>;
  }
  if(session.authenticated && session.role==='staff' && (sessionGuard.locked || !validStaffSession(session)))return <StaffSessionLock key={session.clientContext} session={session} uiLanguage={staffUiLanguage} onVerified={verified=>{
    if(activeSession.current?.clientContext!==session.clientContext || verified.authenticated && !validStaffSession(verified))return;
    sessionGuard.resume();setSession(verified as Session);setPassword('');setWorkerToken('');setMessage('');navigationGuard.current=null;
    location.hash=verified.authenticated?'overview':'sign-in';setView(verified.authenticated?'overview':'sign-in');reload();window.scrollTo(0,0);
  }}/>;
  if(sessionGuard.locked || (session.authenticated && session.role==='worker' && !validWorkerSession(session))) {
    let language:WorkerUiLanguage=session.language==='ar'||session.language==='ur'?session.language:'en';
    try{language=readWorkerLockLanguage(sessionStorage,session);}catch{}
    const text=workerSessionText[language];
    return <main className="entry-page" lang={language} dir={language==='en' ? 'ltr' : 'rtl'}><Brand/><section role="alert"><h1>{text.title}</h1><p>{text.body}</p><p>{text.next}</p><button className="button primary" onClick={()=>location.reload()}><RefreshCw size={18}/>{text.reload}</button></section></main>;
  }
  if(view==='accept-invitation') return <main className="entry-page"><Brand/><InvitationView key={invitationToken}><AcceptInvitation token={invitationToken} identity={session} onBack={()=>{setInvitationToken('');navigate('overview');}} onIdentityChanged={async()=>{setSession(checkedSiteSession(await api('/session')));}} onOpenSite={changeSite}/></InvitationView></main>;
  if(['account-recovery','reset-password'].includes(view)) return <main className="entry-page"><Brand/><AccountRecovery key={view} reset={view==='reset-password'} token={recoveryToken} onBack={()=>{setRecoveryToken('');navigate('overview');}} onReset={()=>{setPassword('');setSession({authenticated:false,mode:session.mode});}}/></main>;
  if(view==='worker-access')return <WorkerAccessEntry language={workerEntryLanguage} onLanguage={setWorkerEntryLanguage} token={workerToken} onToken={setWorkerToken} busy={authBusy} blocked={localCleanupFailed} authenticated={session.authenticated} session={session} supported={session.mode!=='synthetic-demo'} failed={!!message} onSubmit={()=>void signInCredential('worker')} onCancel={()=>{setWorkerToken('');setMessage('');navigate('overview');}}><Brand/>{localCleanupFailed && <section role="alert"><p>{localCleanupText[workerEntryLanguage].failed}</p><button className="button outline" disabled={authBusy} onClick={async()=>{if(authInFlight.current)return;authInFlight.current=true;setAuthBusy(true);try{setLocalCleanupFailed(!await clearWorkerLocalData());}finally{authInFlight.current=false;setAuthBusy(false);}}}>{localCleanupText[workerEntryLanguage].remove}</button></section>}</WorkerAccessEntry>;
  if (!session.authenticated || view==='worker-access') return (
    <main className="entry-page">
      <Brand />
      <a className="button subtle" href="#home"><ArrowLeft size={18}/>About Understood</a>
      <div className="entry-inner">
        {localCleanupFailed && <section role="alert" lang={session.language==='ar' || session.language==='ur'?session.language:'en'} dir={session.language==='ar' || session.language==='ur'?'rtl':'ltr'}><p>{localCleanupText[session.language==='ar' || session.language==='ur'?session.language:'en'].failed}</p><button className="button outline" disabled={authBusy} onClick={async()=>{if(authInFlight.current)return;authInFlight.current=true;setAuthBusy(true);try {setLocalCleanupFailed(!await clearWorkerLocalData());}finally {authInFlight.current=false;setAuthBusy(false);}}}>{localCleanupText[session.language==='ar' || session.language==='ur'?session.language:'en'].remove}</button></section>}
        <div className="entry-heading">
          <h1>Understood</h1>
          <p>Short multilingual briefings, answers in workers' own words, and clear follow-up when a detail is missing.</p>
          <SyntheticNote />
        </div>
        {session.mode === 'synthetic-demo' ? (
          <Panel title="Open the local demo">
            {view==='worker-access' && <p role="status">Worker access links require credential mode. This profile demo cannot redeem them.</p>}
            <p>Use a synthetic profile. This is not a live account or a real AI service.</p>
            <div className="entry-actions">
              <button className="button primary" disabled={authBusy || localCleanupFailed} onClick={() => signIn('maya')}><Users size={20} /> Continue as Maya, supervisor</button>
              <button className="button outline" disabled={authBusy || localCleanupFailed} onClick={() => signIn('worker-29')}><FileText size={20} /> Continue as Worker 029</button>
              <button className="button subtle" disabled={authBusy || localCleanupFailed} onClick={() => signIn('worker-14')}><MessageCircle size={20} /> Worker 014 clarification</button>
            </div>
          </Panel>
        ) : (
          <Panel title="Sign in to the local workspace">
            <p>Credential access is local. AI processing is still synthetic and not approved for real worker data.</p>
            {view!=='worker-access' && <form className="entry-form" onSubmit={(event) => { event.preventDefault(); void signInCredential('staff'); }}>
              <label className="field">Staff email<input type="email" autoComplete="username" value={email} disabled={authBusy || localCleanupFailed} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="field">Password<input type="password" autoComplete="current-password" value={password} disabled={authBusy || localCleanupFailed} onChange={(event) => setPassword(event.target.value)} required /></label>
              <button className="button primary full" type="submit" disabled={authBusy || localCleanupFailed}>{authBusy ? 'Signing in...' : 'Sign in'}</button>
              <button className="button subtle" type="button" disabled={authBusy} onClick={()=>navigate('account-recovery')}><KeyRound size={18}/>Forgot password?</button>
            </form>}
            <form className="entry-form worker-grant-form" onSubmit={(event) => { event.preventDefault(); void signInCredential('worker'); }}>
              <h3>Worker access link</h3>
              <label className="field">Interface language<select value={workerEntryLanguage} disabled={authBusy || localCleanupFailed} onChange={event=>setWorkerEntryLanguage(event.target.value as WorkerUiLanguage)}><option value="en">English</option><option value="ar" lang="ar">العربية</option><option value="ur" lang="ur">اردو</option></select></label>
              {session.authenticated && <p>Opening this worker access link will end your current session.</p>}
              <label className="field">One-time access token<input type="password" autoComplete="off" value={workerToken} disabled={authBusy || localCleanupFailed} onChange={(event) => setWorkerToken(event.target.value)} required /></label>
              <button className="button outline full" type="submit" disabled={authBusy || localCleanupFailed}>{authBusy ? 'Signing in...' : 'Open my briefings'}</button>
            </form>
          </Panel>
        )}
        {view==='worker-access' && <button className="button outline" disabled={authBusy} onClick={() => {setWorkerToken('');navigate('overview');}}>Cancel worker access</button>}
      </div>
      {message && <div className="toast" role="alert">{message}</div>}
    </main>
  );

  if (session.role === 'worker') return <WorkerApp key={session.clientContext} session={session} view={view} navigate={navigate} refresh={refresh} act={act} logout={logout} message={message} onSessionLost={sessionGuard.invalidate} sessionInvalid={sessionGuard.isLocked} navigationGuard={navigationGuard} />;
  const canWrite=canManageStaff(session.staffRole) && session.siteState!=='archived';
  const canSearch=['owner','supervisor','auditor'].includes(session.staffRole || '');
  if(session.staffRole==='administrator' && !view.startsWith('settings')) return <div className="loading-page">Loading site settings...</div>;
  const blockStaffInput=(event:React.SyntheticEvent)=>{if(sessionGuard.isLocked()){event.preventDefault();event.stopPropagation();}};
  const staffAuthority:StaffRequestAuthority={session,isCurrent:()=>sameStaffSession(session,activeSession.current) && !sessionGuard.isInvalidated() && !selectingSite.current && !authInFlight.current,canMutate:()=>!sessionGuard.isLocked(),onSessionLost:sessionGuard.invalidate};
return <div className="staff-shell" lang={staffUiLanguage} dir={staffUiLanguage==='en'?'ltr':'rtl'} inert={sessionGuard.checking} aria-busy={sessionGuard.checking} onClickCapture={blockStaffInput} onSubmitCapture={blockStaffInput} onKeyDownCapture={blockStaffInput}>
  <aside className="sidebar" inert={siteTransition}><Brand /><nav aria-label={staffUi.navigation}>{staffNavigation.filter(({key}) => (session.staffRole!=='administrator' || key==='settings') && (key!=='people' || canWrite) && (key!=='settings/invoices' || ['owner','auditor'].includes(session.staffRole || ''))).map(({ key, icon: Icon }) => <button key={key} onClick={() => navigate(key)} className={`sidebar-link ${(key==='briefings' && view.startsWith('templates')) || (key==='processing' && (view.startsWith('glossary') || view==='language-readiness')) || view === key || view.startsWith(`${key}/`) ? 'active' : ''}`}><Icon size={23} />{staffUi[key as keyof typeof staffUi]}</button>)}</nav>
    <button className="profile" onClick={logout}><span className="avatar">{session.name?.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><span><strong><bdi>{session.name}</bdi></strong><small>{staffIdentityLabel(session.staffRole,staffUiLanguage,true)} · {staffUi.signOut}</small></span><LogOut size={18} /></button>
  </aside><div className="staff-main"><header className="topbar">
    {session.mode!=='synthetic-demo' ? <AccountSiteSwitcher language={staffUiLanguage} organization={session.organization} site={session.site} disabled={siteTransition} onSelect={changeSite}/> : <div className="site-label"><span className="pin">●</span><bdi>{session.organization}</bdi><span>·</span><bdi>{session.site}</bdi></div>}
    <span className="top-date" role={sessionGuard.checking?'status':undefined}>{sessionGuard.checking?staffUi.checking:staffDate(session.timezone,clock,staffUiLanguage)}</span>
    {canSearch && <StaffSearchBox language={staffUiLanguage} key={`${session.clientContext}:${session.siteState}`} navigate={navigate} disabled={siteTransition} canPeople={canWrite}/>}
    {['owner','supervisor','auditor'].includes(session.staffRole || '') && <button className="icon-button bell" aria-label={staffUi.notifications} title={staffUi.notifications} disabled={siteTransition} onClick={()=>navigate('notifications')}><Bell size={21}/></button>}<button className="icon-button mobile-logout" aria-label={staffUi.signOut} disabled={siteTransition} onClick={logout}><LogOut size={20} /></button>
  </header>{siteTransition ? <main className="staff-content"><h1>{staffUi.siteSession}</h1>{siteTransitionError ? <><p role="alert">{staffUi.siteError}</p><button className="button outline" onClick={()=>void recheckSite()}><RefreshCw size={18}/>{staffUi.recheck}</button></> : <p role="status">{staffUi.checkingSite}</p>}</main> : <main className="staff-content" key={`${session.staffScope}:${session.staffRole}`}>
{session.siteState==='archived' && <Notice tone="blue">{staffUi.archived}</Notice>}
{view === 'overview' && <Overview key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} navigate={navigate} canWrite={canWrite} name={session.name} greeting={staffGreeting(session.timezone,clock)} />}{view === 'briefings' && <Briefings key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} navigate={navigate} canWrite={canWrite} />}{view === 'briefings/new' && (canWrite ? <BriefingView label="New briefing"><NewBriefing key={`${session.clientContext}:${session.templateRecoveryScope}`} authority={staffAuthority} scope={session.templateRecoveryScope} uploadSession={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} navigate={navigate} navigationGuard={navigationGuard}/></BriefingView> : <Notice tone="blue">Your role cannot create briefings.</Notice>)}{view.startsWith('briefings/') && view !== 'briefings/new' && <BriefingDetail key={`${view.split('/')[1]}:${session.clientContext}:${session.templateRecoveryScope}`} authority={staffAuthority} id={view.split('/')[1]} scope={session.templateRecoveryScope} languageSession={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} refresh={refresh} act={act} navigate={navigate} onChanged={reload} canWrite={canWrite} timezone={session.timezone} />}
    {view==='source-audio' && (canWrite ? <BriefingView label="Source audio uploads"><SourceAudioUploads key={session.clientContext} authority={staffAuthority} session={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} navigate={navigate}/></BriefingView> : <Notice>Your role cannot access source audio uploads.</Notice>)}
    {view==='settings/onboarding' && (session.staffRole==='owner'?<BriefingView key={staffRequestBinding(session)} label="Pilot setup"><Onboarding authority={staffAuthority} navigate={navigate}/></BriefingView>:<Notice>Only the workspace owner can save pilot setup progress.</Notice>)}
    {view==='notifications' && (['owner','supervisor','auditor'].includes(session.staffRole || '') ? <BriefingView key={staffRequestBinding(session)} label="Notifications"><Notifications authority={staffAuthority} refresh={refresh} navigate={navigate} timezone={session.timezone}/></BriefingView> : <Notice>Your role cannot access site notifications.</Notice>)}
    {(view==='templates' || view.startsWith('templates/')) && <Templates authority={staffAuthority} key={`${view}:${staffRequestBinding(session)}`} id={view.split('/')[1]==='new' ? undefined : view.split('/')[1]} newTemplate={view==='templates/new'} canWrite={canWrite} scope={session.templateRecoveryScope} navigate={navigate}/>}
    {(view==='glossary' || view.startsWith('glossary/')) && <Glossary authority={staffAuthority} key={`${view}:${staffRequestBinding(session)}`} id={view.split('/')[1]==='new' ? undefined : view.split('/')[1]} newTerm={view==='glossary/new'} canWrite={canWrite} scope={session.templateRecoveryScope} navigate={navigate}/>}
    {view === 'clarifications' && <BriefingView label="Clarifications" language={caseUiLanguage}><ClarificationsPage key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} navigate={navigate} timezone={session.timezone} language={caseUiLanguage} onLanguageChange={setCaseUiLanguage} canWrite={canWrite && ['owner','supervisor'].includes(session.staffRole || '')} /></BriefingView>}
    {view === 'clarifications/new' && <BriefingView label="New clarification" language={caseUiLanguage}>{['owner','supervisor'].includes(session.staffRole || '')?<ClarificationCreate key={staffRequestBinding(session)} authority={staffAuthority} canWrite={canWrite} navigate={navigate} navigationGuard={navigationGuard} timezone={session.timezone} language={caseUiLanguage} onLanguageChange={setCaseUiLanguage}/>:<p role="alert">{caseText(caseUiLanguage,'Your role cannot create clarifications.')}</p>}</BriefingView>}
    {view.startsWith('clarifications/') && view !== 'clarifications/new' && <BriefingView key={`${view.split('/')[1]}:${staffRequestBinding(session)}`} label="Clarification" language={caseUiLanguage}><ClarificationPage id={view.split('/')[1]} refresh={refresh} navigate={navigate} session={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} authority={staffAuthority} language={caseUiLanguage} onLanguageChange={setCaseUiLanguage} timezone={session.timezone} navigationGuard={navigationGuard} canWrite={canWrite && ['owner','supervisor'].includes(session.staffRole || '')} /></BriefingView>}
    {canSearch && (view==='search' || view.startsWith('search/')) && <BriefingView label="Search"><StaffSearch key={`${view}:${session.clientContext}:${session.siteState}`} route={view} context={session.clientContext!} canPeople={canWrite} navigate={navigate}/></BriefingView>}
{view==='people/crews' && (canWrite?<SiteCrews key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} locale={directoryLanguage} onLocaleChange={setDirectoryLanguage} navigate={navigate} name={session.name} greeting={staffGreeting(session.timezone,clock)} canManageContacts={session.staffRole==='owner'}/>:<p lang="en" dir="ltr" role="status">Your role cannot manage site crews.</p>)}
{(['people','people/new','people/new-crew'].includes(view) || view.startsWith('people/worker/') || view.startsWith('people/crew/')) && <PeoplePage locale={directoryLanguage} onLocaleChange={setDirectoryLanguage} authority={staffAuthority} key={`${session.clientContext}:${view}`} initialAdd={view==='people/new'} initialCrewCreate={view==='people/new-crew'} initialWorkerId={view.startsWith('people/worker/')?view.split('/')[2]:undefined} initialCrewId={view.startsWith('people/crew/')?view.split('/')[2]:undefined} refresh={refresh} onImport={() => navigate('people/import')} canManage={canWrite} canDelete={['owner','administrator'].includes(session.staffRole || '')} credentialAccess={session.mode==='synthetic-credential'} navigate={navigate} />}{view.startsWith('people/import') && (canWrite ? <WorkerImportPage authority={staffAuthority} key={`${session.clientContext}:${view}`} id={view.split('/')[2]} navigate={navigate} /> : <Notice tone="blue">Your role cannot import workers.</Notice>)}
    {view === 'processing' && <Processing key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} navigate={navigate} canWrite={canWrite} />}{view.startsWith('processing/') && <ProcessingDetail key={`${view}:${staffRequestBinding(session)}`} authority={staffAuthority} id={view.split('/')[1]} refresh={refresh} navigate={navigate} canWrite={canWrite} onChanged={reload} />}{view === 'language-readiness' && <Suspense fallback={<p role="status">Loading language readiness...</p>}><LanguageReadiness key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} /></Suspense>}{view === 'reports' && <Reports key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh} language={reportUiLanguage} onLanguageChange={setReportUiLanguage} />}{view === 'reports/activity' && <BriefingView key={staffRequestBinding(session)} label="Activity view"><AuditPage authority={staffAuthority} refresh={refresh} /></BriefingView>}
    {(view==='settings' || view.startsWith('settings/')) && <nav className="briefing-detail-tabs" aria-label="Settings views"><button aria-pressed={view==='settings'} onClick={()=>navigate('settings')}>Organization & site</button>{['owner','administrator','auditor'].includes(session.staffRole || '') && <button aria-pressed={view==='settings/staff'} onClick={()=>navigate('settings/staff')}>Staff & access</button>}{session.mode==='synthetic-credential' && session.staffScope && ['owner','administrator','auditor'].includes(session.staffRole || '') && <button aria-pressed={view==='settings/invitations'} onClick={()=>navigate('settings/invitations')}>Invitations</button>}{['owner','auditor'].includes(session.staffRole || '') && <button aria-pressed={view.startsWith('settings/invoices')} onClick={()=>navigate('settings/invoices')}>Invoices</button>}{session.staffRole==='owner' && <button aria-pressed={view==='settings/onboarding'} onClick={()=>navigate('settings/onboarding')}>Pilot setup</button>}<button aria-pressed={view==='settings/usage'} onClick={()=>navigate('settings/usage')}>Plan &amp; usage</button><button aria-pressed={view==='settings/retention'} onClick={()=>navigate('settings/retention')}>Privacy &amp; retention</button></nav>}
    {view==='settings' && <WorkspaceSettings authority={staffAuthority} key={session.clientContext} session={{clientContext:session.clientContext!,expiresAt:session.expiresAt!,siteState:session.siteState}} onLifecycleChanged={()=>{
      if(!staffAuthority.isCurrent() || !staffAuthority.canMutate())return;
      void fetchBootstrapSession(fetch,AbortSignal.timeout(15000)).then(value=>{
        if(!staffAuthority.isCurrent() || !staffAuthority.canMutate())return;
        if(!validStaffSession(value) || !sameStaffSession(session,{...value,siteState:session.siteState})){sessionGuard.invalidate();return;}
        setSession(old=>sameStaffSession(session,old)?value as Session:old);
      }).catch(()=>{if(staffAuthority.isCurrent())sessionGuard.invalidate();});
    }} onContextChanged={value=>{if(staffAuthority.isCurrent())setSession(old=>sameStaffSession(session,old)?{...old!,organization:value.organization.name,site:value.site.name,timezone:value.site.timezone}:old);}}/>}
    {view==='settings/usage' && <Suspense fallback={<p role="status">Loading plan and usage...</p>}><PlanUsage key={staffRequestBinding(session)} authority={staffAuthority} refresh={refresh}/></Suspense>}
    {view==='settings/retention' && <Suspense fallback={<p role="status">Loading retention settings...</p>}><RetentionSettings key={session.clientContext} authority={staffAuthority}/></Suspense>}
    {view==='settings/staff' && (['owner','administrator','auditor'].includes(session.staffRole || '') ? <StaffAccess key={`${session.clientContext}:${session.staffRecoveryScope}`} actorRole={session.staffRole || ''} scope={session.staffRecoveryScope} authority={{session,isCurrent:()=>sameStaffSession(session,activeSession.current) && !sessionGuard.isInvalidated() && !selectingSite.current && !authInFlight.current,canMutate:()=>!sessionGuard.isLocked(),onSessionLost:sessionGuard.invalidate}} onSessionChanged={()=>{void fetchBootstrapSession(fetch,AbortSignal.timeout(15000)).then(value=>{if(!sameStaffSession(session,activeSession.current) || sessionGuard.isInvalidated())return;if(!sameStaffSession(session,value)){sessionGuard.invalidate();return;}setSession(value as Session);}).catch(()=>{if(sameStaffSession(session,activeSession.current))sessionGuard.invalidate();});}}/> : <Notice>Your role cannot manage staff access.</Notice>)}
    {view==='settings/invitations' && (session.mode==='synthetic-credential' && session.staffScope && ['owner','administrator','auditor'].includes(session.staffRole || '') ? <InvitationView key={`${session.clientContext}:${session.staffScope}`}><StaffInvitations authority={staffAuthority} actorRole={session.staffRole || ''} scope={session.staffScope} onBack={()=>navigate('settings/staff')}/></InvitationView> : <Notice>Staff invitations require an authorized credential account.</Notice>)}
    {(view==='settings/invoices' || view.startsWith('settings/invoices/')) && (['owner','auditor'].includes(session.staffRole || '') ? <BriefingView key={`${session.clientContext}:${view}`} label="Invoices"><BillingPage authority={staffAuthority} id={view.split('/')[2]==='new' ? undefined : view.split('/')[2]} newInvoice={view==='settings/invoices/new'} owner={session.staffRole==='owner'} scope={session.billingRecoveryScope} navigate={navigate}/></BriefingView> : <Notice>Your role cannot access invoices.</Notice>)}<div className="page-foot">{staffUi.foot}</div></main>}</div>{message && <div className="toast" role="status" lang="en" dir="ltr" onClick={() => setMessage('')}>{message}</div>}</div>;
}

function Overview({ refresh, navigate:onNavigate,canWrite,name,greeting,authority }: { refresh: number; navigate: (path: string) => void;canWrite:boolean;name?:string;greeting:string;authority:StaffRequestAuthority }) {
  const {current}=useBriefingRequest(authority),navigate=(path:string)=>{if(current())onNavigate(path);};
  const { data, error, loading } = useArtifactRead<any>(authority,'/api/overview',refresh);
  if (loading) return <p className="loading">Loading overview...</p>;
  if (error || !data) return <Notice>{error || 'Overview unavailable'}</Notice>;
  const m: Counts = data.metrics;
  return <><div className="page-header"><div><h1>{greeting}{name ? `, ${name.split(' ')[0]}` : '' }.</h1><p>Here's the status of your team's briefings.</p></div>{canWrite && <button className="button primary" onClick={() => navigate('briefings/new')}><Plus size={22} /> New briefing</button>}</div><div className="metrics"><Metric icon={FileText} value={m.assigned} label="assigned" /><Metric icon={Users} value={m.responses} label="responses" /><Metric icon={CheckCircle2} value={m.matches} label="match key facts" /><Metric icon={MessageCircle} value={m.clarifications} label="need clarification" warn /><Metric icon={Clock3} value={m.pending} label="awaiting response" /></div><div className="overview-grid"><Panel title="Briefing activity"><div className="progress-row"><strong>{m.completion}%</strong><span>response completion · {m.responses} of {m.assigned} received</span></div><div className="progress"><span style={{ width: `${m.completion}%` }} /></div><div className="legend"><span><i className="dot green" />{m.matches} match the key facts</span><span><i className="dot amber" />{m.clarifications} need clarification</span>{m.unassessed > 0 && <span><i className="dot blue" />{m.unassessed} awaiting assessment</span>}<span><i className="dot grey" />{m.pending} awaiting response</span></div>{data.publication && <button className="text-link" onClick={() => navigate(`briefings/${data.publication.briefingId}`)}>{data.publication.title} · Published v{data.publication.version}<ChevronRight size={18} /></button>}</Panel><Panel title="Clarifications to follow up"><div className="row-list">{data.cases.map((item: Case) => <button className="item-row" key={item.id} onClick={() => navigate(`clarifications/${item.id}`)}><span className="small-avatar"><MessageCircle size={20} /></span><span className="item-main"><strong>{item.worker}</strong><small>{item.title} · {item.reason}</small></span><ChevronRight size={18} /></button>)}</div><button className="text-link" onClick={() => navigate('clarifications')}>View all clarifications <ChevronRight size={18} /></button></Panel></div><Notice tone="blue">A matching answer records the key facts asked. It does not certify understanding or safe work.</Notice></>;
}

function Briefings({ refresh, navigate:onNavigate,canWrite,authority }: { refresh: number; navigate: (path: string) => void;canWrite:boolean;authority:StaffRequestAuthority }) {
  const {current}=useBriefingRequest(authority),navigate=(path:string)=>{if(current())onNavigate(path);};
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[publicationStatus,setPublicationStatus]=useState('all'),[scheduleStatus,setScheduleStatus]=useState('all'),[archiveStatus,setArchiveStatus]=useState('active'),[sort,setSort]=useState('updated'),[page,setPage]=useState(1);
  const query=new URLSearchParams({search,status,publicationStatus,scheduleStatus,archiveStatus,sort,page:String(page),pageSize:'20'}).toString();
  const {data,error,loading}=useArtifactRead<{items:Briefing[];total:number;page:number;pageSize:number}>(authority,`/api/briefings?${query}`,refresh);
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  return <><div className="page-header"><div><h1>Briefings</h1><p>Create, publish and follow the versions your team receives.</p></div><div className="actions"><button className="button outline" onClick={()=>navigate('templates')}><FileText size={20}/>Templates</button>{canWrite && <><button className="button outline" onClick={()=>navigate('source-audio')}><FileText size={20}/>My audio uploads</button><button className="button primary" onClick={() => navigate('briefings/new')}><Plus size={22} /> New briefing</button></>}</div></div>
    <div className="filters briefing-filters"><label className="search-box"><Search size={18} /><span className="sr-only">Search briefings</span><input value={search} maxLength={80} onChange={(event) => {setSearch(event.target.value);setPage(1);}} placeholder="Search briefings" /></label>
      <label className="select-label">Draft status<select value={status} onChange={(event) => {setStatus(event.target.value);setPage(1);}}><option value="all">All draft states</option><option value="draft">Draft</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="failed">Failed</option></select></label>
      <label className="select-label">Latest publication<select value={publicationStatus} onChange={(event) => {setPublicationStatus(event.target.value);setPage(1);}}><option value="all">All versions</option><option value="unpublished">Unpublished</option><option value="published">Published</option><option value="withdrawn">Withdrawn</option><option value="superseded">Superseded</option><option value="archived">Archived</option></select></label>
      <label className="select-label">Latest schedule<select value={scheduleStatus} onChange={event=>{setScheduleStatus(event.target.value);setPage(1);}}><option value="all">All schedules</option><option value="none">No saved schedule</option><option value="queued">Queued</option><option value="published">Published by schedule</option><option value="cancelled">Cancelled</option><option value="failed">Failed</option></select></label>
      <label className="select-label">Archive status<select value={archiveStatus} onChange={event=>{setArchiveStatus(event.target.value);setPage(1);}}><option value="active">Active briefings</option><option value="archived">Archived briefings</option><option value="all">All briefings</option></select></label>
      <label className="select-label">Sort by<select value={sort} onChange={(event) => {setSort(event.target.value);setPage(1);}}><option value="updated">Recently updated</option><option value="oldest">Oldest updated</option><option value="title">Title</option></select></label>
    </div><Panel title={loading ? 'Briefings' : `Briefings (${data?.total || 0})`}>{loading ? <p role="status">Loading briefings...</p> : error ? <Notice>{error}</Notice> : data?.items.length ? <div className="row-list">{data.items.map((item) => <button className="item-row" key={item.id} onClick={() => navigate(`briefings/${item.id}`)}><span className="small-avatar"><FileText size={22} /></span><span className="item-main"><strong>{item.title}</strong><small>{item.published_version ? `v${item.published_version} ${item.publication_state} · ` : 'Unpublished · '}Draft v{item.next_version} {item.state}</small>{item.schedule_state && <small>Schedule {item.schedule_state}{item.schedule_state==='queued' && item.scheduled_for && <> · <time dateTime={item.scheduled_for}>{new Date(item.scheduled_for).toLocaleString('en-GB',{timeZone:'UTC'})} UTC</time></>}</small>}</span><Status value={item.archived_at ? 'archived' : item.state} /><ChevronRight size={19} /></button>)}</div> : <p>{page>pages ? 'This page is no longer available.' : 'No briefings match these filters.'}</p>}
      {!loading && !error && data && <div className="audit-pagination"><span>Page {page} of {pages} · {data.total} briefings</span><div className="actions"><button className="icon-button" aria-label="Previous briefing page" title="Previous briefing page" disabled={page<=1} onClick={() => setPage((value) => value-1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="Next briefing page" title="Next briefing page" disabled={page>=pages} onClick={() => setPage((value) => value+1)}><ChevronRight size={18} /></button>{page>pages && <button className="button outline" onClick={() => setPage(1)}>First page</button>}</div></div>}
    </Panel></>;
}

function BriefingDetail({ id, refresh, act, navigate,onChanged,canWrite,scope,languageSession,authority,timezone='UTC' }: { id: string; refresh: number; act: (path: string, body?: unknown) => Promise<any>; navigate: (path: string) => void;onChanged:()=>void;canWrite:boolean;scope?:string|null;languageSession:LanguageSession;authority:StaffRequestAuthority;timezone?:string }) {
  const {current:detailCurrent}=useBriefingRequest(authority);
  const [publicationRecovery,setPublicationRecovery]=useState<{pending:PendingPublication|null;error:string}>(()=>{try {return {pending:scope?readPendingPublication(sessionStorage,scope):null,error:''};}catch(reason){return {pending:null,error:(reason as Error).message};}});
  const [recovery,setRecovery]=useReviewRecovery(scope);
  const [regenerationRecovery,setRegenerationRecovery]=useState(()=>{try {return {pending:scope ? readPendingRegeneration(sessionStorage,scope) : null,error:''};}catch(reason) {return {pending:null,error:(reason as Error).message};}});
  const { data, error, loading } = useArtifactRead<any>(authority,`/api/briefings/${encodeURIComponent(id)}`,refresh);
  const [editingSource,setEditingSource]=useState(false),[editingReview,setEditingReview]=useState(false),[editingLanguages,setEditingLanguages]=useState(false),[processingPending,setProcessingPending]=useState(false);
  const editing=editingSource || editingReview || editingLanguages || processingPending || !!recovery.pending || !!recovery.error || !!regenerationRecovery.pending || !!regenerationRecovery.error || !!publicationRecovery.pending || !!publicationRecovery.error;
  const [detailView,setDetailView]=useState('overview');
  const [selectedPublication,setSelectedPublication]=useState<PublicationSummary|null>(null);
  const [draftStep,setDraftStep]=useState<DraftStep>('source'),[stepFocus,setStepFocus]=useState(0);
  const sourceStep=useRef<HTMLElement>(null),processingStep=useRef<HTMLElement>(null),languageStep=useRef<HTMLElement>(null),publishStep=useRef<HTMLElement>(null);
  function selectStep(step:DraftStep){if(step==='languages')setSelectedPublication(null);setDraftStep(step);setDetailView(step==='languages'?'languages':'overview');setStepFocus(value=>value+1);}
  useEffect(()=>{if(!stepFocus)return;const targets={source:sourceStep,processing:processingStep,languages:languageStep,publish:publishStep};targets[draftStep].current?.focus();},[stepFocus,draftStep,detailView]);
  const titleRef=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(data?.id===id) titleRef.current?.focus();},[data?.id,id,recovery.pending]);
  useEffect(() => {if(data?.state!=='processing' || editing) return;const timer=window.setInterval(()=>{if(detailCurrent())onChanged();},2000);return () => clearInterval(timer);},[data?.state,onChanged,editing,detailCurrent]);
  if(publicationRecovery.error)return <><h1>Publication recovery</h1><p role="alert" className="record-error">{publicationRecovery.error}</p></>;
  if(publicationRecovery.pending && scope)return <BriefingView label="Publication recovery"><PublicationRecovery authority={authority} pending={publicationRecovery.pending} scope={scope} onResolved={briefingId=>{if(!detailCurrent())return;setPublicationRecovery({pending:null,error:''});onChanged();if(briefingId!==id)navigate(`briefings/${briefingId}`);}}/></BriefingView>;
  if(recovery.error) return <><h1>Draft review recovery</h1><p role="alert" className="record-error">{recovery.error}</p></>;
  if(recovery.pending && scope) return <DraftReviewRecovery authority={authority} pending={recovery.pending} scope={scope} onResolved={briefingId=>{if(!detailCurrent())return;setRecovery({pending:null,error:''});onChanged();if(briefingId!==id) navigate(`briefings/${briefingId}`);}}/>;
  if(regenerationRecovery.error) return <><h1>Regeneration recovery</h1><p role="alert" className="record-error">{regenerationRecovery.error}</p></>;
  if(regenerationRecovery.pending && scope) return <BriefingView><RegenerationRecovery authority={authority} pending={regenerationRecovery.pending} scope={scope} onResolved={briefingId=>{if(!detailCurrent())return;setRegenerationRecovery({pending:null,error:''});onChanged();if(briefingId!==id) navigate(`briefings/${briefingId}`);}}/></BriefingView>;
  if (loading && !data) return <p>Loading briefing...</p>;
  if (error || !data) return <Notice>{error || 'Briefing unavailable'}</Notice>;
  const current = data.publications?.[0];
  const readyToPublish=draftSteps(data)[3].available;
  return <div className="briefing-draft-detail">
    <button className="back-link" onClick={() => navigate('briefings')}><ArrowLeft size={18} /> Briefings</button>
    <div className="page-header"><div><h1 ref={titleRef} tabIndex={-1}>{data.title}</h1><p>Draft v{data.next_version} · revision {data.revision} · {current ? `v${current.version} ${current.state}` : 'Not published'}</p></div><div className="actions"><Status value={data.archive ? 'archived' : data.state}/>{canWrite && !data.contentExpired && <CopyDraftControl authority={authority} id={id} revision={data.revision} title={data.title} disabled={editing || loading} onCopied={copyId=>navigate(`briefings/${copyId}`)}/>} {canWrite && !data.archive && <ArchiveBriefingControl authority={authority} id={id} revision={data.revision} nextVersion={data.next_version} disabled={editing || loading} onChanged={()=>{onChanged();titleRef.current?.focus();}}/>}</div></div>
    {data.archive && <Notice tone="blue">Archived {new Date(data.archive.occurred_at).toLocaleString()} · {data.archive.reason}</Notice>}
    {data.contentExpired && <Notice tone="blue">Briefing content expired. Version identities, audience and response outcomes remain in history.</Notice>}
    {canWrite && !data.archive && !data.contentExpired && <DraftSteps draft={data} active={draftStep} disabled={editing || loading} onSelect={selectStep}/>}
    <div className="briefing-detail-tabs" aria-label="Briefing views"><button disabled={editing} aria-pressed={detailView==='overview'} onClick={() => {setDraftStep('source');setDetailView('overview');}}>Overview</button><button disabled={editing} aria-pressed={detailView==='responses'} onClick={() => setDetailView('responses')}>Responses</button><button disabled={editing} aria-pressed={detailView==='languages'} onClick={() => {setDraftStep('languages');setDetailView('languages');}}>Languages</button><button disabled={editing} aria-pressed={detailView==='history'} onClick={()=>setDetailView('history')}>History</button></div>
    {detailView==='languages' ? <section ref={languageStep} tabIndex={-1} aria-label="Draft languages"><BriefingView><LanguageArtifacts authority={authority} draft={data} selected={selectedPublication} onSelect={setSelectedPublication} refresh={refresh} canViewRubric={canWrite} scope={scope} clientContext={languageSession.clientContext} onChanged={()=>{onChanged();titleRef.current?.focus();}} onEditingChange={setEditingReview}/></BriefingView>{canWrite && readyToPublish && <div className="actions"><button className="button primary" disabled={editing || loading} onClick={()=>selectStep('publish')}><Send size={18}/>Continue to publish</button></div>}</section> : detailView==='responses' ? <PublicationResponses authority={authority} key={(selectedPublication || current)?.id || 'empty'} briefingId={id} publication={selectedPublication || current || null} onSelect={setSelectedPublication} context={languageSession.clientContext} refresh={refresh} navigate={navigate} canPlayAudio={canWrite} /> : detailView==='history'?<PublicationHistory authority={authority} briefingId={id} selected={selectedPublication || current || null} onSelect={setSelectedPublication} context={languageSession.clientContext} refresh={refresh} onView={view=>{if(!selectedPublication && current)setSelectedPublication(current);setDetailView(view);}} canWrite={canWrite} onChanged={onChanged}/>:<>
    {current && <div className="metrics"><Metric icon={FileText} value={current.metrics.assigned} label="assigned" /><Metric icon={Users} value={current.metrics.responses} label="responses" /><Metric icon={CheckCircle2} value={current.metrics.matches} label="matches" /><Metric icon={MessageCircle} value={current.metrics.clarifications} label="clarifications" warn /><Metric icon={Clock3} value={current.metrics.pending} label="pending" /></div>}
    <div className="detail-grid"><div>
      <section ref={sourceStep} tabIndex={-1} aria-label="Draft source"><Panel title={`Source (draft v${data.next_version})`}>
        <DraftLanguages key={`${id}:${languageSession.clientContext}`} id={id} revision={data.revision} selection={data.generationLanguages || null} session={languageSession} canWrite={canWrite && !data.archive} disabled={editingSource || editingReview || processingPending || loading || data.state==='processing'} onChanged={onChanged} onEditingChange={setEditingLanguages}/>
        {canWrite && !data.archive ? <DraftEditor authority={authority} key={`${data.revision}:${data.next_version}`} id={id} revision={data.revision} title={data.title} source={data.source} disabled={editingReview || editingLanguages || processingPending} onChanged={onChanged} onEditingChange={setEditingSource} /> : <p className="source-text">{data.source}</p>}
        {canWrite && !data.archive && !data.contentExpired && <div className="actions"><button className="button outline" disabled={editing || loading} onClick={()=>selectStep('processing')}><Sparkles size={18}/>Continue to AI processing</button></div>}
      </Panel></section>
      <section ref={processingStep} tabIndex={-1} aria-label="Draft AI processing"><Panel title="AI processing"><p role="status">Draft preparation: {data.state.replaceAll('_',' ')}</p>{canWrite && <PreparationRequest authority={authority} briefingId={id} revision={data.revision} refresh={refresh} canStart={!data.archive && !data.contentExpired} disabled={editingSource || editingReview || editingLanguages || loading} onChanged={onChanged} onActiveChange={setProcessingPending}/>}<h3>Question and key facts</h3><DraftReview authority={authority} key={`${data.revision}:${data.next_version}`} id={id} scope={scope} revision={data.revision} review={data.review || null} prepared={data.prepared || null} canWrite={canWrite && !data.archive} disabled={editingSource || editingLanguages || processingPending || loading || data.state==='processing'} failed={data.state==='failed'} onChanged={()=>{onChanged();titleRef.current?.focus();}} onEditingChange={setEditingReview}/>{canWrite && !data.archive && !data.contentExpired && <div className="actions"><button className="button outline" disabled={editing || loading} onClick={()=>selectStep('languages')}><Languages size={18}/>Continue to languages</button></div>}</Panel></section>
      {canWrite && readyToPublish && !editing && <section ref={publishStep} tabIndex={-1} aria-label="Draft publication"><BriefingView label="Publication"><PublishForm authority={authority} key={`${data.revision}:${data.next_version}:${timezone}`} id={id} revision={data.revision} version={data.next_version} timezone={timezone} scope={scope} onPending={pending=>{if(detailCurrent())setPublicationRecovery({pending,error:''});}} onChanged={()=>{setDraftStep('source');onChanged();titleRef.current?.focus();}} /></BriefingView></section>}
      {canWrite && <BriefingView label="Publication schedules"><PublicationSchedules authority={authority} id={id} refresh={refresh} onChanged={onChanged} timezone={timezone}/></BriefingView>}
    </div><Panel title="Version timeline">
      <PublicationHistory authority={authority} briefingId={id} selected={selectedPublication || current || null} onSelect={setSelectedPublication} context={languageSession.clientContext} refresh={refresh} disabled={editing || loading} onView={view=>{if(!selectedPublication && current)setSelectedPublication(current);setDetailView(view);}} canWrite={canWrite} onChanged={onChanged}/>
      <Notice tone="green">Published snapshots and prior answers are not edited when a new draft is processed.</Notice>
    </Panel></div>
    </>}
  </div>;
}

function Processing({ refresh, navigate:onNavigate,canWrite,authority }: { refresh: number; navigate: (path: string) => void;canWrite:boolean;authority:StaffRequestAuthority }) {
  const {current}=useBriefingRequest(authority),navigate=(path:string)=>{if(current())onNavigate(path);};
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[kind,setKind]=useState('all'),[sort,setSort]=useState('newest'),[page,setPage]=useState(1),[tick,setTick]=useState(0);
  const query=new URLSearchParams({search,status,kind,sort,page:String(page),pageSize:'20'});
  const read=useArtifactRead<unknown>(authority,`/api/processing?${query}`,refresh+tick);
  let data:ProcessingPage|null=null,error=read.error;const loading=read.loading;
  if(read.data)try{data=checkedProcessingPage(read.data,page);}catch(reason){error=(reason as Error).message;}
  const pages=Math.max(1,Math.ceil((data?.total || 0)/20));
  return <><div className="page-header"><div><h1>AI processing</h1><p>Processing activity at this site.</p></div><div className="actions"><button className="button outline" onClick={()=>navigate('language-readiness')}><Languages size={18}/>Language readiness</button><button className="button outline" onClick={()=>navigate('glossary')}><Languages size={18}/>Company glossary</button><button className="icon-button" aria-label="Refresh processing queue" title="Refresh processing queue" disabled={loading} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button>{canWrite && <button className="button outline" onClick={() => navigate('briefings/new')}><Plus size={18} /> New briefing</button>}</div></div>
    <div className="filters"><label className="search-box"><Search size={18}/><span className="sr-only">Search processing jobs</span><input value={search} maxLength={80} placeholder="Search jobs" onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label><label className="select-label">Job type<select value={kind} onChange={event=>{setKind(event.target.value);setPage(1);}}><option value="all">All types</option>{processingKinds.map(value=><option key={value} value={value}>{processingKindLabels[value]}</option>)}</select></label><label className="select-label">Job status<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">All states</option><option value="queued">Queued</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="complete">Complete</option><option value="failed">Failed</option><option value="blocked">Blocked</option></select></label><label className="select-label">Sort jobs<select value={sort} onChange={event=>{setSort(event.target.value);setPage(1);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
    <Panel className="processing-queue" title={loading ? 'Processing queue' : `Processing queue (${data?.total || 0})`}>{loading ? <p role="status">Loading jobs...</p> : error ? <Notice>{error}</Notice> : data?.items.length ? <div className="row-list">{data.items.map(job=><button key={job.id} className="item-row" onClick={()=>navigate(`processing/${job.id}`)}><span className="small-avatar">{job.kind==='prepare'?<Sparkles size={20}/>:job.kind==='answer_check'?<FileText size={20}/>:<Volume2 size={20}/>}</span><span className="item-main"><strong>{job.title}</strong><small>{processingKindLabels[job.kind]}{job.kind==='prepare'?` · Revision ${job.revision}`:job.publication_version!==null?` · Published v${job.publication_version}`:''} · Attempts: {job.attempts}{job.mode==='inline-synthetic'?' · Inline synthetic':''}{job.archived_at?' · Archived':job.kind==='prepare' && job.revision!==job.draft_revision?' · Older revision':''}</small></span><Status value={job.status}/><ChevronRight size={18}/></button>)}</div> : <p>{page>pages ? 'This page is no longer available.' : 'No jobs match these filters.'}</p>}
      {!loading && !error && data && <div className="audit-pagination"><span>Page {page} of {pages} · {data.total} jobs</span><div className="actions"><button className="icon-button" aria-label="Previous processing page" title="Previous processing page" disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next processing page" title="Next processing page" disabled={page>=pages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button>{page>pages && <button className="button outline" onClick={()=>setPage(1)}>First page</button>}</div></div>}
    </Panel><Notice tone="blue">Job completion is not proof of understanding or safe work.</Notice></>;
}

function ProcessingDetail({id,refresh,navigate:onNavigate,canWrite,onChanged,authority}:{id:string;refresh:number;navigate:(path:string)=>void;canWrite:boolean;onChanged:()=>void;authority:StaffRequestAuthority}) {
  const {current}=useBriefingRequest(authority),navigate=(path:string)=>{if(current())onNavigate(path);};
  const [tick,setTick]=useState(0),[busy,setBusy]=useState(false),[responseOpen,setResponseOpen]=useState(false);
  const read=useArtifactRead<unknown>(authority,`/api/processing/${encodeURIComponent(id)}`,refresh+tick);
  const verified=useRef<ProcessingJob|null>(null);
  let data:ProcessingJob|null=null,error=read.error;const loading=read.loading;
  if(read.data)try{data=checkedProcessingJob(read.data,id);verified.current=data;}catch(reason){error=(reason as Error).message;}
  // Keep recovery controls mounted during this exact session/job's refresh.
  else if(loading && current())data=verified.current;
  if(error || !current()){verified.current=null;data=null;}
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(data?.id===id) heading.current?.focus();},[data?.id,id]);
  useEffect(()=>{if(busy || responseOpen || !data || !['queued','processing'].includes(data.status)) return;const timer=window.setInterval(()=>{if(current())setTick(value=>value+1);},2000);return ()=>clearInterval(timer);},[data?.status,busy,responseOpen,current]);
  return <><button className="back-link" onClick={()=>navigate('processing')}><ArrowLeft size={18}/> AI processing</button>{loading && !data ? <p role="status">Loading job...</p> : error || !data ? <Notice>{error || 'Processing job unavailable'}</Notice> : <>
    <div className="page-header"><div><h1 ref={heading} tabIndex={-1}>{data.title}</h1><p>{processingKindLabels[data.kind]}{data.revision!==null?` · source revision ${data.revision}`:data.publication_version!==null?` · published v${data.publication_version}`:''}</p></div><Status value={data.status}/></div><Panel title="Job details"><dl className="processing-details"><dt>Job ID</dt><dd>{data.id}</dd><dt>Created</dt><dd>{new Date(data.created_at).toLocaleString()}</dd><dt>Attempts</dt><dd>{data.attempts}</dd><dt>Execution</dt><dd>{data.mode==='inline-synthetic'?'Inline synthetic check':'Durable processor'}</dd>{data.draft_revision!==null && <><dt>Current draft</dt><dd>Revision {data.draft_revision} · {data.archived_at?'archived':data.draft_state}</dd></>}{data.publication_version!==null && <><dt>Published version</dt><dd>v{data.publication_version}</dd></>}{data.source_request_id && <><dt>Source request</dt><dd>{data.source_request_id}</dd></>}</dl>
      {data.error && <Notice>{data.error}</Notice>}<div className="actions">{data.briefing_id && <button className="button outline" onClick={()=>navigate(`briefings/${data!.briefing_id}`)}><FileText size={18}/>View briefing</button>}{data.publication_id && data.assignment_id && <button className="button outline" aria-expanded={responseOpen} onClick={()=>{if(current())setResponseOpen(value=>!value);}}><FileText size={18}/>View response and AI check</button>}{canWrite && data.kind==='source_transcription' && data.own_source && <button className="button outline" onClick={()=>navigate('source-audio')}><Volume2 size={18}/>My source audio uploads</button>}<button className="icon-button" aria-label="Refresh job" title="Refresh job" disabled={busy || loading} onClick={()=>setTick(value=>value+1)}><RefreshCw size={18}/></button></div>{canWrite && data.kind==='prepare' && data.briefing_id && data.revision!==null && <PreparationRequest authority={authority} briefingId={data.briefing_id} revision={data.revision} jobId={data.id} refresh={refresh+tick} canStart={data.retryAvailable} disabled={loading} onActiveChange={setBusy} onChanged={()=>{if(current()){onChanged();setTick(value=>value+1);heading.current?.focus();}}}/>}{canWrite && data.kind==='source_transcription' && data.own_source && data.source_request_id && <ProcessingSourceRetry authority={authority} sourceId={data.source_request_id} refresh={refresh+tick} retryable={data.sourceRetryAvailable} onChanged={()=>{if(current()){onChanged();setTick(value=>value+1);}}}/>}
    </Panel>{canWrite && data.mode==='durable' && ['response_transcription','answer_check'].includes(data.kind) && data.publication_id && data.assignment_id && <ProcessingRetry authority={authority} jobId={data.id} publicationId={data.publication_id} assignmentId={data.assignment_id} refresh={refresh+tick} disabled={loading} onActiveChange={setBusy} onChanged={()=>{if(current()){onChanged();setTick(value=>value+1);}}}/>}{data.kind==='prepare' && <PreparationProgress progress={data.progress}/>}<ProcessingProvenance authority={authority} job={data} refresh={refresh+tick}/><Notice tone="blue">Published versions and earlier answers remain unchanged.</Notice>{responseOpen && data.publication_id && data.assignment_id && <ResponseDetail authority={authority} key={`${data.publication_id}:${data.assignment_id}`} publicationId={data.publication_id} assignmentId={data.assignment_id} refresh={refresh+tick} onClose={()=>{if(current())setResponseOpen(false);}} navigate={navigate} canPlayAudio={canWrite}/>}</>}</>;
}

function PreparationProgress({progress}:{progress?:ProcessingProgress}) {
  const label=(value:string)=>value.replaceAll('_',' ');
  if(!progress?.available) return <Panel title="Stage progress"><p className="muted">No stage history is available for this job.</p></Panel>;
  return <Panel title="Stage progress"><p className="muted">Validated preparation stages are recorded per attempt. Earlier attempts remain visible after a retry.</p><div className="processing-attempts">
    {progress.attempts.map((attempt,index)=><section className="processing-attempt" key={`${attempt.startedAt}-${index}`} aria-label={`${attempt.current ? 'Current' : 'Previous'} preparation attempt`}><div className="processing-attempt-header"><strong>{attempt.current ? 'Current attempt' : 'Previous attempt'}</strong><time dateTime={attempt.startedAt}>{new Date(attempt.startedAt).toLocaleString()}</time></div><div className="processing-stage-list">
      {attempt.events.map((event,index)=><div className={`processing-stage processing-stage-${event.state}`} key={`${event.step}-${event.state}-${index}`}><span className="processing-stage-icon">{event.state==='completed' || event.state==='reused' ? <CheckCircle2 size={16}/> : event.state==='failed' ? <TriangleAlert size={16}/> : <Clock3 size={16}/>}</span><span className="processing-stage-copy"><strong>{label(event.stage)}{event.language ? ` · ${event.language.toUpperCase()}` : ''}{event.track ? ` · ${event.track}` : ''}</strong><small>{label(event.state)}{event.origin!=='system' ? ` · ${label(event.origin)}` : ''}{event.errorCode ? ` · ${label(event.errorCode)}` : ''}</small></span><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString()}</time></div>)}
    </div></section>)}
  </div></Panel>;
}

function Reports({refresh,authority,language,onLanguageChange}:{refresh:number;authority:StaffRequestAuthority;language:ReportLocale;onLanguageChange:(language:ReportLocale)=>void}) {
  return <BriefingView label="Reports" fallbackCopy={{loading:reportText(language,'Loading reports...'),unavailable:reportText(language,'Reports page unavailable. Your saved export requests are unchanged.'),reload:reportText(language,'Reload')}}><ReportsPage authority={authority} refresh={refresh} language={language} onLanguageChange={onLanguageChange}/></BriefingView>;
}

const workerText = {
  en: { mine: 'My briefings', todo: 'To do', completed: 'Completed', listen: 'Listen and respond', open: 'Open briefing', help: 'I need help', back: 'Back', question: 'Your turn', answer: 'Answer in your own words', send: 'Send answer', received: 'Your answer was received', review: 'Your supervisor may follow up if anything is unclear.', text: 'Read text', play: 'Play briefing', playQuestion: 'Play question', reply: 'Type your answer', helpTitle: 'Ask your supervisor for help', helpPrompt: 'What do you need help with?', saved: 'Your request was saved.', version: 'Briefing' },
  ar: { mine: 'تعليماتي', todo: 'للمتابعة', completed: 'مكتملة', listen: 'استمع وأجب', open: 'افتح التعليمات', help: 'أحتاج مساعدة', back: 'رجوع', question: 'دورك', answer: 'أجب بكلماتك الخاصة', send: 'أرسل الإجابة', received: 'تم استلام إجابتك', review: 'قد يتابع معك المشرف إذا كان هناك شيء غير واضح.', text: 'اقرأ النص', play: 'شغّل التعليمات', playQuestion: 'شغّل السؤال', reply: 'اكتب إجابتك', helpTitle: 'اطلب المساعدة من المشرف', helpPrompt: 'بماذا تحتاج المساعدة؟', saved: 'تم حفظ طلبك.', version: 'التعليمات' },
  ur: { mine: 'میری ہدایات', todo: 'کرنا ہے', completed: 'مکمل', listen: 'سنیں اور جواب دیں', open: 'ہدایات کھولیں', help: 'مجھے مدد چاہیے', back: 'واپس', question: 'آپ کی باری', answer: 'اپنے الفاظ میں جواب دیں', send: 'جواب بھیجیں', received: 'آپ کا جواب موصول ہو گیا', review: 'اگر کوئی بات واضح نہ ہوئی تو آپ کا سپروائزر رابطہ کر سکتا ہے۔', text: 'متن پڑھیں', play: 'ہدایات سنیں', playQuestion: 'سوال سنیں', reply: 'اپنا جواب لکھیں', helpTitle: 'سپروائزر سے مدد مانگیں', helpPrompt: 'آپ کو کس چیز میں مدد چاہیے؟', saved: 'آپ کی درخواست محفوظ ہو گئی۔', version: 'ہدایت' },
};

const workerAux = {
  en: { demo: 'Synthetic local demo. A matching response does not certify understanding.', label: 'Synthetic local demo', emptyTodo: 'No briefings to do.', emptyDone: 'No completed briefings yet.', loading: 'Loading...', unavailable: 'Briefing unavailable', outcome: 'Recorded outcome', assessment: 'Synthetic local assessment. Your supervisor can review the original response.', audioPending: 'Recording received. The AI check is pending.', audioDemo: 'Recording received. Live transcription is not connected in this local demo.', audioFailed: 'The recording could not be checked. Please ask your supervisor or record again.', typeInstead: 'Type', recordInstead: 'Record', matched: 'Matched key facts', clarification: 'Needs clarification', unassessable: 'Could not assess', saved: 'Saved in the demo.' },
  ar: { demo: 'عرض تجريبي محلي. تطابق الإجابة لا يثبت الفهم.', label: 'عرض تجريبي محلي', emptyTodo: 'لا توجد تعليمات للمتابعة.', emptyDone: 'لا توجد تعليمات مكتملة بعد.', loading: 'جار التحميل...', unavailable: 'التعليمات غير متاحة', outcome: 'نتيجة مسجلة', assessment: 'تقييم تجريبي محلي. يمكن للمشرف مراجعة إجابتك الأصلية.', audioPending: 'تم استلام التسجيل. التحقق الآلي قيد الانتظار.', audioDemo: 'تم استلام التسجيل. النسخ الصوتي المباشر غير متصل بهذا العرض المحلي.', audioFailed: 'تعذّر التحقق من التسجيل. اطلب المساعدة من المشرف أو سجّل مرة أخرى.', typeInstead: 'كتابة', recordInstead: 'تسجيل', matched: 'طابقت المعلومات المطلوبة', clarification: 'تحتاج إلى توضيح', unassessable: 'تعذر التقييم', saved: 'تم الحفظ في العرض التجريبي.' },
  ur: { demo: 'یہ مقامی آزمائشی نمونہ ہے۔ درست جواب سمجھ کی تصدیق نہیں کرتا۔', label: 'مقامی آزمائشی نمونہ', emptyTodo: 'ابھی کوئی ہدایت باقی نہیں۔', emptyDone: 'ابھی کوئی مکمل ہدایت نہیں۔', loading: 'لوڈ ہو رہا ہے...', unavailable: 'ہدایت دستیاب نہیں', outcome: 'درج شدہ نتیجہ', assessment: 'یہ مقامی آزمائشی جانچ ہے۔ سپروائزر اصل جواب دیکھ سکتا ہے۔', audioPending: 'ریکارڈنگ موصول ہو گئی۔ خودکار جانچ زیر التوا ہے۔', audioDemo: 'ریکارڈنگ موصول ہو گئی۔ اس مقامی نمونے میں لائیو نقل نویسی منسلک نہیں۔', audioFailed: 'ریکارڈنگ کی جانچ نہ ہو سکی۔ سپروائزر سے مدد لیں یا دوبارہ ریکارڈ کریں۔', typeInstead: 'لکھیں', recordInstead: 'ریکارڈ کریں', matched: 'اہم حقائق درست ہیں', clarification: 'وضاحت درکار ہے', unassessable: 'جانچ ممکن نہیں', saved: 'نمونے میں محفوظ ہو گیا۔' },
};

function WorkerApp({ session, view, navigate, refresh, act, logout, message,onSessionLost,sessionInvalid,navigationGuard }: { session: Session; view: string; navigate: (path: string) => void; refresh: number; act: (path: string, body?: unknown) => Promise<any>; logout: () => Promise<boolean>; message: string;onSessionLost:()=>void;sessionInvalid:()=>boolean;navigationGuard:React.RefObject<((next:string)=>boolean)|null> }) {
  const [language,setUiLanguage]=useState<WorkerUiLanguage>(()=>{try{return readWorkerUiLanguage(sessionStorage,session);}catch{return session.language==='ar' || session.language==='ur'?session.language:'en';}});
  const [languageError,setLanguageError]=useState('');
  const t = workerText[language] || workerText.en;
  const a = workerAux[language] || workerAux.en;
  const statusText = workerStatusText[language] || workerStatusText.en;
  const pagingText=workerPagingText[language as keyof typeof workerPagingText] || workerPagingText.en;
  const audioMessage = session.mode.startsWith('synthetic-') ? a.audioDemo : a.audioPending;
  const [tab, setTab] = useState<WorkerInboxTab>('todo');
  const navText=workerNavigationText[language];
  const pendingHelpAssignment=useRef<string|null>(null);
  const [page,setPage]=useState(1);
  const [answer, setAnswer] = useState('');
  const [answerMode, setAnswerMode] = useState<'record' | 'type'>('record');
  const [audioRefresh, setAudioRefresh] = useState(0);
  const speechPlayers=useRef<{body:HTMLAudioElement|null;question:HTMLAudioElement|null}>({body:null,question:null});
  useEffect(()=>()=>{window.speechSynthesis?.cancel();speechPlayers.current.body?.pause();speechPlayers.current.question?.pause();},[]);
  const [helpText, setHelpText] = useState('');
  const [conversationUnsent,setConversationUnsent]=useState(false);
  const [helpVoiceUnsent,setHelpVoiceUnsent]=useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [requestFailure,setRequestFailure]=useState('');
  type PendingReceipt={kind:'answer'|'help'|'audio';requestId:string;assignmentId:string;status:'unknown'|'received'|'failed'};
  const [pendingReceipts,setPendingReceipts]=useState<PendingReceipt[]>([]);
  const checkText=workerReceiptCheckText[language];
  const requestFailureRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(requestFailure)requestFailureRef.current?.focus();},[requestFailure]);
  const [busy, setBusy] = useState(false);
  const [audioUnsent,setAudioUnsent]=useState(false),[leaveKind,setLeaveKind]=useState<WorkerLeaveAction>('back');
  const [audioConsent,setAudioConsent]=useState(false),[audioDraftRefresh,setAudioDraftRefresh]=useState(0);
  const privateDevice=usePrivateDevice(session.clientContext!);
  const audioConsentRef=useRef(false);
  const changeAudioConsent=(value:boolean)=>{audioConsentRef.current=value;setAudioConsent(value);};
  const leaveDialog=useRef<HTMLDialogElement>(null),leaveAction=useRef<(()=>void)|null>(null),leaveTrigger=useRef<HTMLElement|null>(null);
  const approvedRoute=useRef<string|null>(null);
  const leaveText=workerLeaveText[language] || workerLeaveText.en;
  const unsent={answer,help:helpText || (conversationUnsent || helpVoiceUnsent?'unsent':''),audio:audioUnsent};
  const inputAvailability=workerInputAvailability({answer,help:helpText,audio:audioUnsent,helpVoice:helpVoiceUnsent,conversation:conversationUnsent});
  const hasUnsent=workerLeaveRequired('back',unsent);
  useEffect(()=>{
    if(!hasUnsent && !busy)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[hasUnsent,busy]);
  const askLeave=(kind:WorkerLeaveAction,action:()=>void)=>{
    if(busy)return;
    if(!workerLeaveRequired(kind,unsent)){action();return;}
    leaveAction.current=action;leaveTrigger.current=document.activeElement as HTMLElement;setLeaveKind(kind);leaveDialog.current?.showModal();
  };
  useEffect(()=>{
    if(approvedRoute.current===view)approvedRoute.current=null;
    const guard=(next:string)=>{
      if(approvedRoute.current===next)return true;
      const decision=workerNavigationDecision(view,next,hasUnsent,busy);
      if(decision==='allow')return true;
      if(location.hash!==`#${view}`)history.pushState(null,'',`${location.pathname}${location.search}#${view}`);
      if(decision==='confirm')askLeave('back',()=>{approvedRoute.current=next;navigate(next);});
      return false;
    };
    navigationGuard.current=guard;
    return()=>{if(navigationGuard.current===guard)navigationGuard.current=null;};
  },[view,hasUnsent,busy]);
  const now = Date.now();
  const requestInFlight = useRef(false);
  const id = view.startsWith('worker/') ? view.split('/')[1] : null;
  const currentAssignment = useRef(id);
  currentAssignment.current = id;
  const currentView=useRef(view);currentView.current=view;
  const noticeAuthority=useRef({sessionInvalid,onSessionLost});noticeAuthority.current={sessionInvalid,onSessionLost};
  const loadRecordingNotice=useMemo(()=>{
    const identity={clientContext:session.clientContext!,expiresAt:session.expiresAt!};
    return async(selected:WorkerUiLanguage,signal:AbortSignal)=>{
      try{return await readWorkerRecordingNotice(fetch,identity,selected,signal,()=>!signal.aborted&&!noticeAuthority.current.sessionInvalid());}
      catch(reason){if(!signal.aborted&&!noticeAuthority.current.sessionInvalid()&&reason instanceof WorkerRecordingNoticeError&&reason.code==='session')noticeAuthority.current.onSessionLost();throw reason;}
    };
  },[session.clientContext,session.expiresAt]);
  const outboxOperation=async(work:()=>Promise<void>)=>{
    if(requestInFlight.current || sessionInvalid() || currentView.current!=='device' && currentView.current!==`worker/${currentAssignment.current}`)throw Error('Local storage unavailable');
    requestInFlight.current=true;setBusy(true);
    try {await work();if(currentView.current==='device')setAudioRefresh(value=>value+1);}
    finally {requestInFlight.current=false;setBusy(false);}
  };
  useEffect(() => { setReceipt(null); setAnswer(''); setHelpText('');setRequestFailure('');setPendingReceipts([]); window.speechSynthesis?.cancel(); }, [id]);
  const followupText=language==='ar'?'المتابعة':language==='ur'?'رابطہ':'Follow-up';
  const answerClosedText=language==='ar'?'انتهى موعد الإجابة. لا يزال بإمكانك طلب المساعدة.':language==='ur'?'جواب کی آخری تاریخ گزر گئی ہے۔ آپ اب بھی مدد مانگ سکتے ہیں۔':'The answer deadline has passed. You can still ask for help.';
  const emptyFollowup=language==='ar'?'لا توجد محادثات متابعة مفتوحة.':language==='ur'?'ابھی کوئی کھلی گفتگو نہیں۔':'No open follow-up conversations.';
  const inbox=useApi<WorkerBriefingPage>(workerInboxPath(view,tab,page),refresh+audioRefresh,session.clientContext);
  useEffect(() => {
    if(id || view==='device') return;
    const timer=window.setInterval(() => setAudioRefresh((value) => value+1),60000);
    return () => window.clearInterval(timer);
  },[id,view]);
  const detail = useApi<any>(id ? `/worker/briefings/${id}` : null, refresh + audioRefresh,session.clientContext);
  useEffect(()=>{
    if(!pendingHelpAssignment.current)return;
    if(id!==pendingHelpAssignment.current){pendingHelpAssignment.current=null;return;}
    if(detail.loading || detail.error || detail.data?.id!==id)return;
    const section=document.getElementById('worker-help');
    if(section){section.scrollIntoView({behavior:'smooth'});section.querySelector('h2')?.focus();}
    pendingHelpAssignment.current=null;
  },[id,detail.loading,detail.error,detail.data,receipt]);
  const detailUnavailable=detail.loading || !!detail.error || detail.data?.contentExpired===true;
  const retainedDetail=retainWorkerDetail(id,detail.data?.id,hasUnsent,detail.errorStatus);
  const refreshText=workerRefreshText[language] || workerRefreshText.en;
  useEffect(()=>{if([inbox.error,detail.error].some(error=>['Session context changed','Sign in required'].includes(error)) || [inbox.errorStatus,detail.errorStatus].some(status=>status!==null && [401,403,409].includes(status)))onSessionLost();},[inbox.error,detail.error,inbox.errorStatus,detail.errorStatus]);
  const speak = (text: string) => { if (!('speechSynthesis' in window)) return; speechPlayers.current.body?.pause();speechPlayers.current.question?.pause();speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = detail.data?.language || language; speechSynthesis.speak(utterance); };
  const goBack = () => askLeave('back',()=>{window.speechSynthesis?.cancel();setReceipt(null);approvedRoute.current='inbox';navigate('inbox');});
  const requestIdFor=(kind:'answer'|'help',assignmentId:string,text:string)=>workerRequestId(sessionStorage,session,assignmentId,kind,text,Date.now,kind==='answer'?detail.data?.repeatRequest?.id:undefined);
  const requestError=(error:unknown)=>setRequestFailure(workerRequestText[language][error instanceof WorkerRequestError?error.code:'storage']);
  const trackReceipt=(kind:PendingReceipt['kind'],assignmentId:string,requestId:string)=>setPendingReceipts(values=>[...values.filter(value=>value.kind!==kind),{kind,assignmentId,requestId,status:'unknown'}]);
  const clearTrackedReceipt=(kind:PendingReceipt['kind'])=>setPendingReceipts(values=>values.filter(value=>value.kind!==kind));
  const checkReceipt=async(pending:PendingReceipt)=>{
    if(requestInFlight.current || sessionInvalid() || currentAssignment.current!==pending.assignmentId)return;
    requestInFlight.current=true;setBusy(true);
    try {
      const result=await readWorkerRequestReceipt(async(path,options)=>{
        const response=await fetch(path,options);
        if([401,403,409].includes(response.status))onSessionLost();
        return response;
      },session,pending.assignmentId,pending.kind,pending.requestId,()=>!sessionInvalid() && currentAssignment.current===pending.assignmentId);
      if(result)setRequestFailure('');
      setPendingReceipts(values=>values.map(value=>value.requestId===pending.requestId && value.kind===pending.kind ? {...value,status:result?'received':'unknown'} : value));
    }catch {
      setPendingReceipts(values=>values.map(value=>value.requestId===pending.requestId && value.kind===pending.kind ? {...value,status:'failed'} : value));
    }finally{requestInFlight.current=false;setBusy(false);}
  };
  const submit = async () => {
    if (!id || !answer.trim() || inputAvailability.answerBlocked || requestInFlight.current || detailUnavailable) return;
    const receiptScope={version:detail.data.version,language:detail.data.language};
    requestInFlight.current = true;
    setBusy(true);setRequestFailure('');
    try {
      const submissionId = await requestIdFor('answer', id, answer);
      trackReceipt('answer',id,submissionId);
      const result = await act(`/worker/briefings/${id}/answers`, { text: answer, submissionId });
      if (result && currentAssignment.current === id) { clearTrackedReceipt('answer');setReceipt({ ...result, assignmentId: id,requestKind:'typed',publicationVersion:receiptScope.version,contentLanguage:receiptScope.language }); setAnswer(''); }
    } catch(error){requestError(error);} finally { requestInFlight.current = false; setBusy(false); }
  };
  const submitAudio = async (bytes: Uint8Array, submissionId: string) => {
    if(sessionInvalid())throw new Error('Session context changed');
    if(detailUnavailable||inputAvailability.answerBlocked)throw new Error(refreshText.failed);
    if (!id || requestInFlight.current) throw new Error('A request is already in progress');
    const receiptScope={assignmentId:id,publicationId:detail.data.publicationId,version:detail.data.version,language:detail.data.language};
    requestInFlight.current = true;
    setBusy(true);setRequestFailure('');
    try {
      trackReceipt('audio',id,submissionId);
      const result=await sendWorkerRecording(async(path,options)=>{
        const response=await fetch(path,options);
        if(response.status===401 || (response.status===409 && response.headers.get('content-type')?.includes('application/json') && (await response.clone().json()).error==='Session context changed'))onSessionLost();
        return response;
      },session,receiptScope,bytes,submissionId,
        ()=>!sessionInvalid() && currentAssignment.current===id);
      clearTrackedReceipt('audio');
      if (currentAssignment.current === id) setReceipt({ ...result, audio: true, assignmentId: id,requestKind:'audio',publicationVersion:receiptScope.version,contentLanguage:receiptScope.language });
      setAudioRefresh((value) => value + 1);
    } catch(error) {
      if(error instanceof WorkerAudioRetryError)setRequestFailure(workerAudioRetryText[language][error.code]);
      throw error;
    } finally { requestInFlight.current = false; setBusy(false); }
  };
  const saveAudioPreview=async(bytes:Uint8Array,submissionId:string,capturedAt:string)=>{
    if(!id || requestInFlight.current || detailUnavailable || inputAvailability.answerBlocked || sessionInvalid() || !audioConsentRef.current)throw Error('Saving unavailable');
    requestInFlight.current=true;setBusy(true);
    try {
      const {saveAudioDraft,browserAudioDraftFor}=await import('./worker-audio-draft');
      const scope={assignmentId:id,publicationId:detail.data.publicationId,version:detail.data.version,language:detail.data.language};
      await saveAudioDraft(await browserAudioDraftFor(scope),session,scope,
        {bytes,submissionId,capturedAt},audioConsentRef.current,()=>!sessionInvalid() && currentAssignment.current===id && audioConsentRef.current);
      setAudioDraftRefresh(value=>value+1);
    }finally {requestInFlight.current=false;setBusy(false);}
  };
  const help = async () => {
    if (!id || helpVoiceUnsent || inputAvailability.helpBlocked || helpText.trim().length < 3 || requestInFlight.current || detailUnavailable) return;
    requestInFlight.current = true;
    setBusy(true);setRequestFailure('');
    try {
      const requestId = await requestIdFor('help', id, helpText);
      trackReceipt('help',id,requestId);
      const result = await act(`/worker/briefings/${id}/help`, { text: helpText, requestId });
      if (result && currentAssignment.current === id) { clearTrackedReceipt('help');setHelpText(''); setAudioRefresh((value) => value + 1); }
    } catch(error){requestError(error);} finally { requestInFlight.current = false; setBusy(false); }
  };
  const endSession=async()=>{
    if(requestInFlight.current)return;
    requestInFlight.current=true;setBusy(true);approvedRoute.current='overview';
    try {if(!await logout())approvedRoute.current=null;}
    finally {requestInFlight.current=false;setBusy(false);}
  };
  const visible=inbox.data?.items || [];
  const pages=Math.max(1,Math.ceil((inbox.data?.total || 0)/5));
  // Do not unmount an unsent recording as the wall clock crosses a deadline. The server rechecks acceptance on upload.
  const responseState = useMemo(() => detail.data ? workerResponseState(detail.data) : null, [detail.data]);
  return (
    <div className="worker-shell worker-navigation-shell" lang={language} dir={language === 'en' ? 'ltr' : 'rtl'}>
      <header className="worker-header">
        <div className="worker-brand"><Brand/><small className="worker-site-label"><bdi>{session.organization}</bdi> · <bdi>{session.site}</bdi></small></div>
        <div className="worker-identity">
          <span className="avatar">{session.name?.replace(/\D/g, '') || 'W'}</span>
          <span><strong><bdi>{session.name}</bdi></strong><small>{language.toUpperCase()}</small></span>
          <button className="icon-button" title={language==='ar'?'هذا الجهاز':language==='ur'?'یہ آلہ':'This device'} aria-label={language==='ar'?'هذا الجهاز':language==='ur'?'یہ آلہ':'This device'} disabled={busy} onClick={()=>navigate('device')}><Smartphone size={20}/></button>
          <button className="icon-button" title={leaveText.end} aria-label={leaveText.end} disabled={busy} onClick={()=>askLeave('logout',()=>void endSession())}><LogOut size={20} /></button>
        </div>
      </header>
      <main className="worker-content">
        {requestFailure && <p ref={requestFailureRef} tabIndex={-1} className="notice notice-amber" role="alert">{requestFailure}</p>}
        {pendingReceipts.filter(value=>value.assignmentId===id).map(value=><div className="notice notice-amber worker-receipt-check" key={value.kind}>
          <strong>{checkText[value.kind]}</strong><p role="status">{checkText[value.status]}</p>
          <button className="button outline" disabled={busy} onClick={()=>void checkReceipt(value)}><RefreshCw size={18}/>{checkText.check}</button>
        </div>)}
        {view==='device' ? <WorkerDeviceView language={language} session={session} disabled={busy} current={()=>!sessionInvalid() && validWorkerSession(session) && currentView.current==='device'} onOperation={outboxOperation} onSessionLost={onSessionLost} onBack={()=>navigate('inbox')} languageError={languageError} onLanguageChange={next=>{if(busy || sessionInvalid())return;try{saveWorkerUiLanguage(sessionStorage,session,next);window.speechSynthesis?.cancel();setUiLanguage(next);setLanguageError('');}catch{setLanguageError(workerUiLanguageText[language].failed);}}}/> : !id ? (
          <>
            {view==='help'?<WorkerHelpHub language={language} items={visible} loading={inbox.loading} failed={!!inbox.error} disabled={busy} onOpen={assignmentId=>{pendingHelpAssignment.current=assignmentId;navigate('worker/'+assignmentId);}} onFollowup={()=>{setTab('followup');setPage(1);navigate('inbox');}}/>:<>
            <h1>{t.mine}</h1>
            <div className="segmented worker-inbox-tabs">
              <button className={tab === 'todo' ? 'selected' : ''} aria-pressed={tab==='todo'} onClick={() => {setTab('todo');setPage(1);}}>{t.todo} {inbox.data && `(${inbox.data.counts.todo})`}</button>
              <button className={tab === 'completed' ? 'selected' : ''} aria-pressed={tab==='completed'} onClick={() => {setTab('completed');setPage(1);}}>{statusText.sent}</button>
              <button className={tab === 'followup' ? 'selected' : ''} aria-pressed={tab==='followup'} onClick={() => {setTab('followup');setPage(1);}}>{followupText} {inbox.data && `(${inbox.data.counts.followup})`}</button>
              <button className={tab === 'history' ? 'selected' : ''} aria-pressed={tab==='history'} onClick={() => {setTab('history');setPage(1);}}>{workerVersionText[language] || workerVersionText.en}</button>
            </div>
            {inbox.loading ? <p role="status">{a.loading}</p> : inbox.error ? <p className="notice notice-amber" role="alert">{navText.listFailed}</p> : visible.length ? visible.map((item) => (
              <section className="worker-card" key={item.id}>
                <div className="worker-card-head">
                  <div className="metric-icon"><FileText size={28} /></div>
                  <div><h2 lang={item.language} dir={item.language==='en'?'ltr':'rtl'}>{item.title}</h2><p>{t.version} v{item.version} · {item.language.toUpperCase()}</p></div>
                  {language==='en'?<ChevronRight size={23} aria-hidden="true"/>:<ChevronLeft size={23} aria-hidden="true"/>}
                </div>
                {item.dueAt && <p className="worker-deadline"><Clock3 size={18}/><span>{language==='ar'?'الموعد النهائي':language==='ur'?'آخری وقت':'Due'}: <time dateTime={item.dueAt}>{new Date(item.dueAt).toLocaleString(language,{timeZone:session.timezone,dateStyle:'medium',timeStyle:'short'})}</time> · {session.timezone}</span></p>}
                {item.repeatRequest && <Notice tone="amber">{language==='ar'?'طلب المشرف إجابة جديدة':language==='ur'?'سپروائزر نے نیا جواب مانگا ہے':'Your supervisor requested another answer'} · <time dateTime={item.repeatRequest.dueAt}>{new Date(item.repeatRequest.dueAt).toLocaleString(language,{timeZone:session.timezone})}</time></Notice>}
                {item.outcome && <Status value={a[item.outcome as 'matched' | 'clarification' | 'unassessable'] || item.outcome} />}
                {item.reminderAt && <Notice tone="amber">{language==='ar'?'تذكير: لم يُستلم ردك بعد.':language==='ur'?'یاد دہانی: آپ کا جواب ابھی موصول نہیں ہوا۔':'Reminder: your answer has not been received yet.'}</Notice>}
                {!item.outcome && item.audioStatus && <Notice tone="blue">{item.audioStatus === 'failed' ? a.audioFailed : audioMessage}</Notice>}
                {!item.outcome && !item.audioStatus && workerResponseState(item, now).pending && <Notice tone="blue">{statusText.pending}</Notice>}
                {workerResponseState(item, now).closed && <Notice>{workerResponseState(item,now).canHelp?answerClosedText:statusText.closed}</Notice>}
                <button className="button primary full" onClick={() => navigate('worker/' + item.id)}><Play size={19} /> {workerResponseState(item, now).received || workerResponseState(item, now).closed ? t.open : t.listen}</button>
              </section>
            )) : <p className="empty-state">{tab === 'todo' ? a.emptyTodo : tab==='history' ? pagingText.emptyHistory : tab==='followup'?emptyFollowup:statusText.emptySent}</p>}
            <button type="button" className="worker-inbox-help" onClick={()=>{setPage(1);navigate('help');}}><HelpCircle size={28} aria-hidden="true"/><span><strong>{navText.needHelp}</strong><small>{navText.contact}</small></span>{language==='en'?<ChevronRight size={22} aria-hidden="true"/>:<ChevronLeft size={22} aria-hidden="true"/>}</button>
            </>}
            <div className="worker-inbox-pagination"><span role="status">{!inbox.loading && !inbox.error && inbox.data && `${page} / ${pages} · ${inbox.data.total}`}</span><div className="actions">
              <button className="icon-button" aria-label={pagingText.previous} title={pagingText.previous} disabled={inbox.loading || !!inbox.error || page<=1} onClick={() => setPage((value) => value-1)}>{language==='en' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</button>
              <button className="icon-button" aria-label={pagingText.next} title={pagingText.next} disabled={inbox.loading || !!inbox.error || page>=pages || page>=5000} onClick={() => setPage((value) => Math.min(value+1,5000))}>{language==='en' ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</button>
              <button className="icon-button" aria-label={pagingText.refresh} title={pagingText.refresh} disabled={inbox.loading} onClick={() => setAudioRefresh((value) => value+1)}><RefreshCw size={20} /></button>
              {!inbox.error && page>pages && <button className="button outline" onClick={() => setPage(1)}>{pagingText.first}</button>}
            </div></div>
            <Notice tone="blue">{a.demo}</Notice>
          </>
        ) : detail.loading && !(hasUnsent && detail.data?.id===id) ? <p role="status">{a.loading}</p> : (detail.error && !retainedDetail) || !detail.data || detail.data.id!==id ? <><p className="notice notice-amber" role="alert">{navText.detailFailed}</p><button className="icon-button" aria-label={refreshText.refresh} title={refreshText.refresh} disabled={busy || detail.loading} onClick={()=>setAudioRefresh(value=>value+1)}><RefreshCw size={20}/></button></> : (
          <>
            <button className="back-link" disabled={busy} onClick={goBack}>{language==='en'?<ArrowLeft size={19} aria-hidden="true"/>:<ArrowRight size={19} aria-hidden="true"/>}{t.back}</button>
            <button className="icon-button" aria-label={refreshText.refresh} title={refreshText.refresh} disabled={busy || detail.loading} onClick={()=>setAudioRefresh(value=>value+1)}><RefreshCw size={20}/></button>
            {detail.loading && <p role="status">{a.loading}</p>}
            {detail.error && <p role="alert">{refreshText.failed}</p>}
            {receipt?.assignmentId!==id&&<><h1 lang={detail.data.language} dir={detail.data.language === 'en' ? 'ltr' : 'rtl'}>{detail.data.contentExpired?detail.data.title:detail.data.content.title}</h1>
            <p className="worker-subtitle">{t.version} v{detail.data.version}</p></>}
            {receipt?.assignmentId === id ? (
              <WorkerSubmissionReceipt key={receipt.requestId} session={session} selection={{assignmentId:id,version:receipt.publicationVersion,language:receipt.contentLanguage,requestId:receipt.requestId,kind:receipt.requestKind}} acknowledgedContext={receipt.clientContext} language={language} timezone={session.timezone} disabled={busy||detailUnavailable} canHelp={!!responseState?.canHelp} current={()=>!sessionInvalid()&&currentAssignment.current===id} onSessionLost={onSessionLost} onBack={goBack} onHelp={()=>{pendingHelpAssignment.current=id;setReceipt(null);}}/>
            ) : detail.data.contentExpired ? (
              <Notice tone="blue">{language==='ar'?'انتهت مدة الاحتفاظ بمحتوى التعليمات. يظل سجل إجاباتك أدناه.':language==='ur'?'بریفنگ کے مواد کی مدت ختم ہو گئی ہے۔ آپ کے جوابات کی تاریخ نیچے موجود ہے۔':'Briefing content expired. Your response history remains below.'}</Notice>
            ) : (
              <>
                {responseState?.closed && <Notice>{responseState.canHelp?answerClosedText:statusText.closed}</Notice>}
                <section className="worker-card">
                  <h2>{t.listen}</h2>
                  {detail.data.speechUrls?.body ? <WorkerAudioPlayer key={`${id}:body:${detail.data.publicationId}:${detail.data.version}`} src={detail.data.speechUrls.body} label={t.play} language={language} onPlayer={element=>{speechPlayers.current.body=element;}} onPlay={()=>{window.speechSynthesis?.cancel();speechPlayers.current.question?.pause();}}/> : <button className="audio-button" disabled={detail.data.content.speech!=='device-synthesis-demo'} onClick={() => speak(detail.data.content.text)}>
                    <span className="play-round"><Volume2 size={25} /></span><span>{t.play}</span>
                    <span className="waveform" aria-hidden="true">▁▃▅▂▇▄▆▂▅▃▁</span>
                  </button>}
                  <details className="worker-text-disclosure" key={`${id}:text:${detail.data.publicationId}:${detail.data.version}`}><summary><FileText size={18} aria-hidden="true"/> {t.text}<ChevronDown size={18} aria-hidden="true"/></summary>
                    <p className="briefing-text" lang={detail.data.language} dir={detail.data.language === 'en' ? 'ltr' : 'rtl'}>{detail.data.content.text}</p>
                  </details>
                </section>
                <section className="worker-card question-card">
                  <div className="question-label"><HelpCircle size={24} />{t.question}</div>
                  <h2 lang={detail.data.language} dir={detail.data.language === 'en' ? 'ltr' : 'rtl'}>{detail.data.content.question}</h2>
                  {detail.data.repeatRequest && <Notice tone="amber">{language==='ar'?'طلب المشرف إجابة جديدة. إجابتك السابقة محفوظة.':language==='ur'?'سپروائزر نے نیا جواب مانگا ہے۔ آپ کا پچھلا جواب محفوظ ہے۔':'Your supervisor requested another answer. Your earlier answer is preserved.'} <time dateTime={detail.data.repeatRequest.dueAt}>{new Date(detail.data.repeatRequest.dueAt).toLocaleString(language,{timeZone:session.timezone})}</time></Notice>}
                  {detail.data.speechUrls?.question ? <WorkerAudioPlayer key={`${id}:question:${detail.data.publicationId}:${detail.data.version}`} src={detail.data.speechUrls.question} label={t.playQuestion} language={language} onPlayer={element=>{speechPlayers.current.question=element;}} onPlay={()=>{window.speechSynthesis?.cancel();speechPlayers.current.body?.pause();}}/> : <button className="audio-button compact" disabled={detail.data.content.speech!=='device-synthesis-demo'} onClick={() => speak(detail.data.content.question)}><Play size={20} />{t.playQuestion}</button>}
                  {!detail.data.repeatRequest && detail.data.audioStatus && detail.data.audioStatus !== 'failed' ? (
                    <><Notice tone="blue">{audioMessage}</Notice><audio controls preload="none" src={'/api/recordings/' + detail.data.recordingId + '/audio'} /></>
                  ) : !detail.data.repeatRequest && detail.data.outcome ? (
                    <Status value={a[detail.data.outcome as 'matched' | 'clarification' | 'unassessable'] || detail.data.outcome} />
                  ) : responseState?.pending ? (
                    <Notice tone="blue">{statusText.pending}</Notice>
                  ) : responseState?.closed ? null : (
                    <>
                      {detail.data.audioStatus === 'failed' && <Notice>{a.audioFailed}</Notice>}
                      <div className="segmented answer-mode">
                        <button disabled={busy} className={answerMode === 'record' ? 'selected' : ''} onClick={() => setAnswerMode('record')}>{a.recordInstead}</button>
                        <button disabled={busy} className={answerMode === 'type' ? 'selected' : ''} onClick={() => askLeave('type',()=>setAnswerMode('type'))}>{a.typeInstead}</button>
                      </div>
                      {answerMode === 'record' ? <WorkerRecorderView key={id} language={language} noticeLanguage={language} loadSiteNotice={loadRecordingNotice} synthetic={session.mode.startsWith('synthetic-')} disabled={busy || detailUnavailable || inputAvailability.answerBlocked} saveAllowed={privateDevice && audioConsent} onSave={saveAudioPreview} onSend={submitAudio} onUnsavedChange={setAudioUnsent} /> : (
                        <>
                          <label className="field">{t.answer}<textarea rows={4} value={answer} disabled={busy || inputAvailability.answerBlocked} onChange={(event) => setAnswer(event.target.value)} placeholder={t.reply} maxLength={2000} /></label>
                          <button className="button primary full" onClick={submit} disabled={!answer.trim() || busy || detailUnavailable || inputAvailability.answerBlocked}><Send size={20} /> {t.send}</button>
                        </>
                      )}
                    </>
                  )}
                  {responseState?.pending && <button className="icon-button" aria-label={statusText.check} title={statusText.check} disabled={busy} onClick={() => setAudioRefresh((value) => value + 1)}><RefreshCw size={20} /></button>}
                  <button className="button outline full" onClick={() => document.getElementById('worker-help')?.scrollIntoView({ behavior: 'smooth' })}><MessageCircle size={20} /> {t.help}</button>
                </section>
                <section className="worker-card" id="worker-help">
                  <h2 tabIndex={-1}>{t.helpTitle}</h2>
                  {responseState?.canHelp && <><label className="field">{t.helpPrompt}<textarea rows={3} value={helpText} disabled={busy || helpVoiceUnsent || inputAvailability.helpBlocked} onChange={(event) => setHelpText(event.target.value)} maxLength={500} /></label>
                  <button className="button outline full" disabled={helpText.trim().length < 3 || helpVoiceUnsent || inputAvailability.helpBlocked || busy || detailUnavailable} onClick={help}><MessageCircle size={18} />{t.help}</button>
                  {detail.data.canVoiceHelp && <CaseVoiceRecorder key={`help-voice:${id}`} scope={{kind:'help',id}} session={{clientContext:session.clientContext!,expiresAt:session.expiresAt!}} current={()=>!sessionInvalid()&&currentAssignment.current===id} language={language} noticeLanguage={language} disabled={busy || detailUnavailable || inputAvailability.helpBlocked || !!helpText.trim()} onDirtyChange={setHelpVoiceUnsent} onSessionLost={onSessionLost} onReceived={()=>setAudioRefresh(value=>value+1)}/>}</>}
                </section>
              </>
            )}
            <WorkerOfflineSaveView key={`offline:${id}:${detail.data.publicationId}:${detail.data.version}`} session={session} language={language} scope={{assignmentId:id,publicationId:detail.data.publicationId,version:detail.data.version,language:detail.data.language}} disabled={busy || detailUnavailable} current={()=>!sessionInvalid() && validWorkerSession(session) && currentAssignment.current===id && !detailUnavailable} onOperation={outboxOperation}/>
            <WorkerAudioDraftView key={`audio:${id}:${detail.data.publicationId}:${detail.data.version}`} session={session} interfaceLanguage={language} scope={{assignmentId:id,publicationId:detail.data.publicationId,version:detail.data.version,language:detail.data.language}}
              refresh={audioDraftRefresh} consent={audioConsent} onConsent={changeAudioConsent} disabled={busy || detailUnavailable} blocked={audioUnsent || !!answer.trim() || !!helpText.trim()}
              current={()=>!sessionInvalid() && validWorkerSession(session) && currentAssignment.current===id && !detailUnavailable}
              onSend={submitAudio} onCheck={async requestId=>{trackReceipt('audio',id,requestId);await checkReceipt({kind:'audio',assignmentId:id,requestId,status:'unknown'});}}/>
            <WorkerTextDraftView key={`${id}:${detail.data.publicationId}:${detail.data.version}`} session={session} interfaceLanguage={language} scope={{assignmentId:id,publicationId:detail.data.publicationId,version:detail.data.version}}
              draft={{answer,help:helpText,receipts:pendingReceipts.filter(value=>value.assignmentId===id)}} disabled={busy || detailUnavailable} restoreBlocked={audioUnsent}
              current={()=>!sessionInvalid() && validWorkerSession(session) && currentAssignment.current===id && !detailUnavailable}
              onRestore={value=>{setAnswer(value.answer);setHelpText(value.help);setPendingReceipts(value.receipts);if(value.answer)setAnswerMode('type');}}/>
            <WorkerSubmissions key={`submissions:${id}`} assignmentId={id} version={detail.data.version} contentLanguage={detail.data.language} session={session} language={language} timezone={session.timezone} refresh={refresh + audioRefresh} current={()=>!sessionInvalid()&&currentAssignment.current===id} onSessionLost={onSessionLost}/>
            <WorkerHelpHistory key={`help-history:${id}`} assignmentId={id} version={detail.data.version} contentLanguage={detail.data.language} language={language} timezone={session.timezone} refresh={refresh + audioRefresh} session={session} current={()=>!sessionInvalid()&&currentAssignment.current===id} canWrite={!busy&&!detailUnavailable&&!inputAvailability.conversationBlocked} onDirtyChange={setConversationUnsent} onSessionLost={onSessionLost}/>
          </>
        )}
        {message && <div className="toast" role="status">{message === 'Saved.' ? a.saved : message}</div>}
        <div className="page-foot">{a.label}</div>
      </main>
      <nav className="worker-bottom-nav" aria-label={navText.navigation}><div>
        <button type="button" aria-current={view!=='device' && view!=='help'?'page':undefined} disabled={busy} onClick={()=>navigate('inbox')}><FileText size={23} aria-hidden="true"/><span>{navText.briefings}</span></button>
        <button type="button" aria-current={view==='help'?'page':undefined} disabled={busy} onClick={()=>{setPage(1);navigate('help');}}><HelpCircle size={23} aria-hidden="true"/><span>{navText.help}</span></button>
        <button type="button" aria-current={view==='device'?'page':undefined} disabled={busy} onClick={()=>navigate('device')}><Smartphone size={23} aria-hidden="true"/><span>{navText.device}</span></button>
      </div></nav>
      <dialog ref={leaveDialog} className="withdraw-dialog" aria-labelledby="worker-leave-title" aria-describedby="worker-leave-impact" onKeyDown={keepDialogFocus} onClose={()=>{leaveAction.current=null;if(leaveTrigger.current?.isConnected)leaveTrigger.current.focus();}}>
        <h2 id="worker-leave-title">{leaveText.title}</h2><p id="worker-leave-impact">{leaveKind==='type'?leaveText.mode:leaveText.body}</p>
        <div className="actions"><button autoFocus className="button outline" onClick={()=>leaveDialog.current?.close()}>{leaveText.stay}</button><button className="button danger" disabled={busy} onClick={()=>{const action=leaveAction.current;leaveDialog.current?.close();action?.();}}>{leaveKind==='type'?leaveText.type:leaveKind==='logout'?leaveText.end:leaveText.leave}</button></div>
      </dialog>
    </div>
  );
}
