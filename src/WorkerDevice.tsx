import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Download,RefreshCw,Wifi,WifiOff,ShieldCheck,Clock3,Trash2,Globe} from 'lucide-react';
import {workerUiLanguageText,type WorkerUiLanguage} from './worker-ui-language';
import {usePublicShell} from './pwa';
import {removeTextDraft,textDraftCopy} from './worker-text-draft';
import {WorkerAudioOutbox,type AudioOutboxProps} from './WorkerAudioOutbox';
import {WorkerOfflineCache} from './WorkerOffline';
import {allowPrivateDevice,enableSharedDevice,sharedDeviceText} from './worker-device-policy';
import {usePrivateDevice} from './usePrivateDevice';
import {keepDialogFocus} from './dialog-focus';

const labels={
  en:{title:'This device',back:'Back to my briefings',connection:'Connection',online:'Online',offline:'Offline',shell:'App shell',ready:'Available on this device',loading:'Preparing...',failed:'Unavailable',unavailable:'Not available in this environment',recheck:'Retry app shell',privacy:'Private worker data',private:'Not cached on this device',limits:'Offline answers and recordings are not available yet.',expires:'Session expires',install:'Install Understood',installed:'Standalone app',noPrompt:'This browser is not offering installation.',installError:'Installation could not be started.'},
  ar:{title:'هذا الجهاز',back:'العودة إلى تعليماتي',connection:'الاتصال',online:'متصل',offline:'غير متصل',shell:'واجهة التطبيق',ready:'متاحة على هذا الجهاز',loading:'جارٍ التحضير...',failed:'غير متاحة',unavailable:'غير متاحة في هذه البيئة',recheck:'إعادة محاولة تحميل الواجهة',privacy:'بيانات العامل الخاصة',private:'غير مخزنة مؤقتًا على هذا الجهاز',limits:'الإجابات والتسجيلات دون اتصال غير متاحة بعد.',expires:'تنتهي الجلسة',install:'تثبيت Understood',installed:'تطبيق مستقل',noPrompt:'لا يعرض هذا المتصفح خيار التثبيت.',installError:'تعذر بدء التثبيت.'},
  ur:{title:'یہ آلہ',back:'میری ہدایات پر واپس',connection:'کنکشن',online:'آن لائن',offline:'آف لائن',shell:'ایپ کی بنیادی ساخت',ready:'اس آلے پر دستیاب',loading:'تیار کیا جا رہا ہے...',failed:'دستیاب نہیں',unavailable:'اس ماحول میں دستیاب نہیں',recheck:'ایپ دوبارہ تیار کریں',privacy:'کارکن کا نجی ڈیٹا',private:'اس آلے پر کیش نہیں کیا گیا',limits:'آف لائن جواب اور ریکارڈنگ ابھی دستیاب نہیں۔',expires:'سیشن ختم ہونے کا وقت',install:'Understood انسٹال کریں',installed:'علیحدہ ایپ',noPrompt:'یہ براؤزر انسٹالیشن کا اختیار نہیں دے رہا۔',installError:'انسٹالیشن شروع نہیں ہو سکی۔'},
};
const offlineLimits={en:'Only explicitly saved briefings can reopen locally in this browser tab. Sending requires a connection and fresh server checks.',ar:'يمكن إعادة فتح التعليمات المحفوظة صراحةً فقط محليًا في علامة التبويب هذه. يتطلب الإرسال اتصالًا وفحوصًا جديدة للخادم.',ur:'صرف واضح طور پر محفوظ ہدایات اسی براؤزر ٹیب میں مقامی طور پر دوبارہ کھل سکتی ہیں۔ بھیجنے کے لیے رابطہ اور سرور کی نئی جانچ درکار ہے۔'};
const waitingText={en:'App update pending. Close other Understood tabs and reload this tab when your work is saved.',ar:'تحديث التطبيق قيد الانتظار. أغلق علامات Understood الأخرى وأعد تحميل هذه العلامة بعد حفظ عملك.',ur:'ایپ کی تازہ کاری منتظر ہے۔ کام محفوظ کرنے کے بعد Understood کے دوسرے ٹیب بند کریں اور یہ ٹیب دوبارہ لوڈ کریں۔'};
export type WorkerDeviceProps=AudioOutboxProps & {onBack:()=>void;onLanguageChange:(language:WorkerUiLanguage)=>void;languageError:string};
export function WorkerDevice({language,session,disabled,current,onOperation,onSessionLost,onBack,onLanguageChange,languageError}:WorkerDeviceProps) {
  const expiresAt=session.expiresAt!;
  const t=labels[language],pwa=usePublicShell(),draftText=textDraftCopy[language];
  const privateLabel={en:'Private briefings',ar:'التعليمات الخاصة',ur:'نجی ہدایات'}[language];
  const [draftStatus,setDraftStatus]=useState('');
  const privateDevice=usePrivateDevice(session.clientContext!),policyText=sharedDeviceText[language];
  const [policyBusy,setPolicyBusy]=useState(false),[policyStatus,setPolicyStatus]=useState('');
  const policyDialog=useRef<HTMLDialogElement>(null),policyTrigger=useRef<HTMLElement|null>(null),policyIntent=useRef(false);
  const policyActions={en:{cancel:'Cancel',confirm:'Confirm'},ar:{cancel:'إلغاء',confirm:'تأكيد'},ur:{cancel:'منسوخ کریں',confirm:'تصدیق کریں'}}[language];
  function askPolicy(){if(disabled || policyBusy || !current())return;policyIntent.current=privateDevice;policyTrigger.current=document.activeElement as HTMLElement;policyDialog.current?.showModal();}
  async function changePolicy(){
    if(disabled || policyBusy || !current() || policyIntent.current!==privateDevice){policyDialog.current?.close();return;}
    policyDialog.current?.close();
    setPolicyBusy(true);setPolicyStatus('');
    try {await onOperation(async()=>{if(!current())throw Error();if(privateDevice){if(!await enableSharedDevice())throw Error();setPolicyStatus(policyText.cleared);}else allowPrivateDevice(session);});}
    catch {setPolicyStatus(policyText.failed);}finally {setPolicyBusy(false);}
  }
  const cacheText={en:{remove:'Remove public app cache',removed:'Public cache removed. Reload to stop using the cached shell.'},ar:{remove:'إزالة ذاكرة التطبيق العامة',removed:'تمت إزالة الذاكرة العامة. أعد التحميل لإيقاف استخدام الواجهة المخزنة.'},ur:{remove:'عوامی ایپ کیش ہٹائیں',removed:'عوامی کیش ہٹا دیا گیا۔ محفوظ شدہ ایپ کا استعمال روکنے کے لیے دوبارہ لوڈ کریں۔'}}[language];
  const [online,setOnline]=useState(navigator.onLine);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  const standalone=window.matchMedia('(display-mode: standalone)').matches;
  return <><button className="back-link" disabled={disabled} onClick={onBack}><ArrowLeft size={19}/>{t.back}</button><h1>{t.title}</h1>
    <label className="field"><span><Globe size={20}/> {workerUiLanguageText[language].label}</span><select value={language} disabled={disabled} onChange={event=>onLanguageChange(event.target.value as WorkerUiLanguage)}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option><option value="ur" lang="ur">اردو</option></select></label>
    <p className="muted">{workerUiLanguageText[language].content}</p>{languageError && <p role="alert">{languageError}</p>}
    <section className="worker-text-draft"><label className="checkbox-label"><input type="checkbox" role="switch" checked={!privateDevice} disabled={disabled || policyBusy} onChange={askPolicy}/><span>{policyText.title}: {privateDevice?policyText.off:policyText.on}</span></label><p>{policyText.body}</p>{policyStatus && <p role="status">{policyStatus}</p>}</section>
    <dialog ref={policyDialog} className="withdraw-dialog" aria-labelledby="worker-device-policy-title" aria-describedby="worker-device-policy-impact" onKeyDown={keepDialogFocus} onClose={()=>{if(policyTrigger.current?.isConnected)policyTrigger.current.focus();}}><h2 id="worker-device-policy-title">{policyText.title}</h2><p id="worker-device-policy-impact">{privateDevice?policyText.clearWarning:policyText.privateWarning}</p><div className="actions"><button className="button outline" autoFocus onClick={()=>policyDialog.current?.close()}>{policyActions.cancel}</button><button className="button primary" onClick={()=>void changePolicy()}>{policyActions.confirm}</button></div></dialog>
    <dl className="device-status worker-card"><div><dt>{online?<Wifi size={24}/>:<WifiOff size={24}/>}{t.connection}</dt><dd>{online?t.online:t.offline}</dd></div>
      <div><dt><Download size={24}/>{t.shell}</dt><dd role="status">{pwa.status==='removed'?cacheText.removed:pwa.status==='waiting'?waitingText[language]:t[pwa.status]}{(pwa.status==='failed' || pwa.status==='waiting') && <button className="icon-button" onClick={()=>void pwa.recheck()} title={t.recheck} aria-label={t.recheck}><RefreshCw size={20}/></button>}</dd></div>
      <div><dt><ShieldCheck size={24}/>{privateLabel}</dt><dd>{language==='ar'?'الحفظ اختياري':language==='ur'?'محفوظ کرنا اختیاری ہے':'Saved only by explicit choice'}</dd></div>
      <div><dt><Clock3 size={24}/>{t.expires}</dt><dd><time dateTime={expiresAt}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(expiresAt))}</time></dd></div>
    </dl><p className="notice notice-amber">{offlineLimits[language]}</p>
    {standalone?<p role="status">{t.installed}</p>:<><button className="button primary full" disabled={!pwa.canInstall || pwa.installing} onClick={()=>void pwa.install()}><Download size={20}/>{t.install}</button>{!pwa.canInstall && <p className="muted">{t.noPrompt}</p>}</>}
    {pwa.installError && <p role="alert">{t.installError}</p>}
    <p>{draftText.limits}</p><button className="button outline full" onClick={()=>{try {removeTextDraft(sessionStorage);setDraftStatus(draftText.removed);}catch {setDraftStatus(draftText.failed);}}}><Trash2 size={20}/>{draftText.remove}</button>
    {draftStatus && <p role="status">{draftStatus}</p>}
    <WorkerOfflineCache session={session} language={language} disabled={disabled} current={current} onOperation={onOperation}/>
    <WorkerAudioOutbox session={session} language={language} disabled={disabled} current={current} onOperation={onOperation} onSessionLost={onSessionLost}/>
    {pwa.status==='ready' && <button className="button outline full" onClick={()=>void pwa.remove()}><Trash2 size={20}/>{cacheText.remove}</button>}
  </>;
}
