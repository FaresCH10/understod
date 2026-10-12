import React,{lazy,Suspense} from 'react';
import {RefreshCw} from 'lucide-react';
import type {PageSession} from './session-state';
import type {DraftScope,TextDraft} from './worker-text-draft';
const Draft=lazy(()=>import('./WorkerTextDraft').then(module=>({default:module.WorkerTextDraft})));
const copy={
  en:{loading:'Loading saved text...',failed:'Saved text controls are unavailable. Current text remains.',reload:'Reload'},
  ar:{loading:'جارٍ تحميل النص المحفوظ...',failed:'أدوات النص المحفوظ غير متاحة. يبقى النص الحالي.',reload:'إعادة التحميل'},
  ur:{loading:'محفوظ متن لوڈ ہو رہا ہے...',failed:'محفوظ متن کے اختیارات دستیاب نہیں۔ موجودہ متن باقی ہے۔',reload:'دوبارہ لوڈ کریں'},
};
export class WorkerTextDraftView extends React.Component<{session:PageSession;interfaceLanguage?:'en'|'ar'|'ur';scope:DraftScope;draft:TextDraft;disabled:boolean;restoreBlocked:boolean;current:()=>boolean;onRestore:(value:TextDraft)=>void},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    const t=copy[(this.props.interfaceLanguage || this.props.session.language) as keyof typeof copy] || copy.en;
    return this.state.failed ? <section role="alert"><p>{t.failed}</p><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{t.reload}</button></section>
      : <Suspense fallback={<p role="status">{t.loading}</p>}><Draft {...this.props}/></Suspense>;
  }
}
