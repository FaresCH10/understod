import {ArrowLeft,Globe,LogIn} from 'lucide-react';
import {type WorkerUiLanguage} from './worker-ui-language';

export const workerEntryText={
  en:{title:'Open my briefings',language:'Interface language',token:'One-time access token',handoff:'Opening this link will end your current session.',open:'Continue',busy:'Opening...',cancel:'Cancel worker access',synthetic:'This workspace uses synthetic AI. Real worker data is not approved.',unsupported:'Worker access links are unavailable in this profile demo.',failed:'Access could not be confirmed. Recheck your session or ask your supervisor for help.'},
  ar:{title:'افتح تعليماتي',language:'لغة الواجهة',token:'رمز الوصول لمرة واحدة',handoff:'فتح هذا الرابط سينهي جلستك الحالية.',open:'متابعة',busy:'جارٍ الفتح...',cancel:'إلغاء وصول العامل',synthetic:'تستخدم مساحة العمل ذكاءً اصطناعيًا تجريبيًا. لم تُعتمد بيانات العمال الحقيقية.',unsupported:'روابط وصول العمال غير متاحة في هذا العرض التجريبي.',failed:'تعذر تأكيد الوصول. تحقق من جلستك أو اطلب المساعدة من المشرف.'},
  ur:{title:'میری ہدایات کھولیں',language:'انٹرفیس کی زبان',token:'ایک بار استعمال ہونے والا رسائی ٹوکن',handoff:'یہ لنک کھولنے سے موجودہ سیشن ختم ہو جائے گا۔',open:'جاری رکھیں',busy:'کھولا جا رہا ہے...',cancel:'کارکن کی رسائی منسوخ کریں',synthetic:'یہ ورک اسپیس آزمائشی مصنوعی ذہانت استعمال کرتی ہے۔ حقیقی کارکن کے ڈیٹا کی منظوری نہیں ہے۔',unsupported:'اس آزمائشی نمونے میں کارکن کے رسائی لنکس دستیاب نہیں۔',failed:'رسائی کی تصدیق نہیں ہو سکی۔ اپنا سیشن چیک کریں یا سپروائزر سے مدد مانگیں۔'},
};
export function WorkerAccessEntry({language,onLanguage,token,onToken,busy,blocked,authenticated,supported,failed,onSubmit,onCancel,children}:{language:WorkerUiLanguage;onLanguage:(value:WorkerUiLanguage)=>void;token:string;onToken:(value:string)=>void;busy:boolean;blocked:boolean;authenticated:boolean;supported:boolean;failed:boolean;onSubmit:()=>void;onCancel:()=>void;children:React.ReactNode}) {
  const t=workerEntryText[language];
  return <main className="entry-page worker-access-entry" lang={language} dir={language==='en'?'ltr':'rtl'}>{children}<section>
    <h1>{t.title}</h1><form onSubmit={event=>{event.preventDefault();onSubmit();}}>
      <label className="field"><span><Globe size={20}/> {t.language}</span><select value={language} disabled={busy} onChange={event=>onLanguage(event.target.value as WorkerUiLanguage)}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option><option value="ur" lang="ur">اردو</option></select></label>
      {supported?<><label className="field">{t.token}<input type="password" autoComplete="off" value={token} disabled={busy || blocked} onChange={event=>onToken(event.target.value)} required maxLength={256}/></label>{authenticated && <p className="notice notice-amber">{t.handoff}</p>}<button className="button primary full" type="submit" disabled={busy || blocked || !token.trim()}><LogIn size={20}/>{busy?t.busy:t.open}</button></>:<p role="status">{t.unsupported}</p>}
    </form><p className="notice notice-amber">{t.synthetic}</p>{failed && <p role="alert">{t.failed}</p>}<button className="button outline full" disabled={busy} onClick={onCancel}><ArrowLeft size={20}/>{t.cancel}</button>
  </section></main>;
}
