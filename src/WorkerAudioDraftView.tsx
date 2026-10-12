import React,{lazy,Suspense} from 'react';
import type {AudioDraftProps} from './WorkerAudioDraft';
const Draft=lazy(()=>import('./WorkerAudioDraft').then(module=>({default:module.WorkerAudioDraft})));
const copy={en:{loading:'Loading saved recording controls...',failed:'Saved recording controls are unavailable. Current recording remains in this page.'},ar:{loading:'جارٍ تحميل أدوات التسجيل المحفوظ...',failed:'أدوات التسجيل المحفوظ غير متاحة. يبقى التسجيل الحالي في هذه الصفحة.'},ur:{loading:'محفوظ ریکارڈنگ کے اختیارات لوڈ ہو رہے ہیں...',failed:'محفوظ ریکارڈنگ کے اختیارات دستیاب نہیں۔ موجودہ ریکارڈنگ اسی صفحے میں باقی ہے۔'}};
export class WorkerAudioDraftView extends React.Component<AudioDraftProps,{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){const t=copy[(this.props.interfaceLanguage || this.props.session.language) as keyof typeof copy] || copy.en;
    return this.state.failed?<p role="alert">{t.failed}</p>:<Suspense fallback={<p role="status">{t.loading}</p>}><Draft {...this.props}/></Suspense>;
  }
}
