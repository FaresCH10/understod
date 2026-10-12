import React,{lazy,Suspense} from 'react';
import {RefreshCw} from 'lucide-react';
import type {WorkerOfflineEntry,WorkerOfflineSave} from './WorkerOffline';
const Entry=lazy(()=>import('./WorkerOffline').then(module=>({default:module.WorkerOfflineEntry})));
const Save=lazy(()=>import('./WorkerOffline').then(module=>({default:module.WorkerOfflineSave})));
const copy={en:{loading:'Loading private saved-data view...',failed:'Private saved-data view is unavailable.',retry:'Reload'},ar:{loading:'جارٍ تحميل عرض البيانات الخاصة المحفوظة...',failed:'عرض البيانات الخاصة المحفوظة غير متاح.',retry:'إعادة التحميل'},ur:{loading:'محفوظ نجی ڈیٹا کا منظر لوڈ ہو رہا ہے...',failed:'محفوظ نجی ڈیٹا کا منظر دستیاب نہیں۔',retry:'دوبارہ لوڈ کریں'}};
class Boundary extends React.Component<{language:'en'|'ar'|'ur';children:React.ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){const t=copy[this.props.language];return this.state.failed?<section role="alert"><p>{t.failed}</p><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{t.retry}</button></section>:<Suspense fallback={<p role="status">{t.loading}</p>}>{this.props.children}</Suspense>;}
}
export function WorkerOfflineEntryView(props:React.ComponentProps<typeof WorkerOfflineEntry>){const language=navigator.language.startsWith('ar')?'ar':navigator.language.startsWith('ur')?'ur':'en';return <Boundary language={language}><Entry {...props}/></Boundary>;}
export function WorkerOfflineSaveView(props:React.ComponentProps<typeof WorkerOfflineSave>){return <Boundary language={props.language}><Save {...props}/></Boundary>;}
