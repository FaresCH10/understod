import React,{lazy,Suspense} from 'react';
import {RefreshCw,ArrowLeft} from 'lucide-react';
import type {WorkerDeviceProps} from './WorkerDevice';
const Device=lazy(()=>import('./WorkerDevice').then(module=>({default:module.WorkerDevice})));
const text={
  en:{loading:'Loading device settings...',failed:'Device settings are unavailable.',reload:'Reload',back:'Back to my briefings'},
  ar:{loading:'جارٍ تحميل إعدادات الجهاز...',failed:'إعدادات الجهاز غير متاحة.',reload:'إعادة التحميل',back:'العودة إلى تعليماتي'},
  ur:{loading:'آلے کی ترتیبات لوڈ ہو رہی ہیں...',failed:'آلے کی ترتیبات دستیاب نہیں۔',reload:'دوبارہ لوڈ کریں',back:'میری ہدایات پر واپس'},
};
export class WorkerDeviceView extends React.Component<WorkerDeviceProps,{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    const t=text[this.props.language];
    return this.state.failed?<section role="alert"><p>{t.failed}</p><button className="back-link" onClick={this.props.onBack}><ArrowLeft size={18}/>{t.back}</button><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{t.reload}</button></section>
      :<Suspense fallback={<p role="status">{t.loading}</p>}><Device {...this.props}/></Suspense>;
  }
}
