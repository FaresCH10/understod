import React,{lazy,Suspense} from 'react';
import {RefreshCw} from 'lucide-react';
import type {RecorderProps} from './WorkerRecorder';
import {conversationRecorderText} from './recording-notice';

const Recorder=lazy(()=>import('./WorkerRecorder').then(module=>({default:module.WorkerRecorder})));
export const recorderViewText={
  en:{loading:'Loading recorder...',failed:'Recording is unavailable. Unsent audio may be lost. Type your answer or reload this page.',reload:'Reload'},
  ar:{loading:'جارٍ تحميل التسجيل...',failed:'التسجيل غير متاح. قد يُفقد الصوت غير المرسل. اكتب إجابتك أو أعد تحميل هذه الصفحة.',reload:'إعادة التحميل'},
  ur:{loading:'ریکارڈر لوڈ ہو رہا ہے...',failed:'ریکارڈنگ دستیاب نہیں۔ نہ بھیجی گئی آڈیو ضائع ہو سکتی ہے۔ اپنا جواب لکھیں یا یہ صفحہ دوبارہ لوڈ کریں۔',reload:'دوبارہ لوڈ کریں'},
};

export class WorkerRecorderView extends React.Component<RecorderProps,{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    const base=recorderViewText[this.props.language],staff={en:'Recording is unavailable. Unsent audio may be lost. Add written resolution notes or reload this page.',ar:'التسجيل غير متاح. قد تفقد الصوت غير المرسل. أضف ملاحظات حل مكتوبة أو أعد تحميل الصفحة.',ur:'ریکارڈنگ دستیاب نہیں۔ نہ بھیجی گئی آڈیو ضائع ہو سکتی ہے۔ تحریری حل کے نوٹس شامل کریں یا صفحہ دوبارہ لوڈ کریں۔'};
    const text={...base,...(this.props.purpose==='in_person'?{failed:staff[this.props.language]}:this.props.purpose==='help'||this.props.purpose==='reply'?{failed:conversationRecorderText[this.props.language].failed}:{})};
    return this.state.failed ? <div role="alert"><p>{text.failed}</p><button className="button outline" onClick={()=>location.reload()}><RefreshCw size={18}/>{text.reload}</button></div>
      : <Suspense fallback={<p role="status">{text.loading}</p>}><Recorder {...this.props}/></Suspense>;
  }
}
