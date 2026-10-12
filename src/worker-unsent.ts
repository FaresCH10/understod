export type WorkerLeaveAction='back'|'logout'|'type';
export type UnsentWork={answer:string;help:string;audio:boolean};
export function recorderHasUnsent(phase:string){return ['requesting','recording','preview','uploading'].includes(phase);}
export function workerLeaveRequired(action:WorkerLeaveAction,work:UnsentWork){
  return work.audio || (action!=='type' && !!(work.answer.trim() || work.help.trim()));
}
export function workerNavigationDecision(current:string,next:string,unsent:boolean,busy:boolean) {
  if(current===next)return 'allow';
  if(busy)return 'hold';
  return unsent ? 'confirm' : 'allow';
}
export function retainWorkerDetail(currentId:string|null,loadedId:unknown,unsent:boolean,status:number|null) {
  return !!currentId && currentId===loadedId && unsent && (status===0 || (status!==null && status>=500 && status<=599));
}
export const workerRefreshText={
  en:{refresh:'Refresh briefing',failed:'The briefing could not be refreshed. Recheck before sending.'},
  ar:{refresh:'تحديث التعليمات',failed:'تعذر تحديث التعليمات. تحقق مجددًا قبل الإرسال.'},
  ur:{refresh:'ہدایت تازہ کریں',failed:'ہدایت تازہ نہیں ہو سکی۔ بھیجنے سے پہلے دوبارہ چیک کریں۔'},
};
export const workerLeaveText={
  en:{title:'Leave unsent work?',body:'Leaving discards unsaved work on this page. Copies you explicitly saved may remain until removed, expired or session cleanup succeeds. Nothing new will be sent.',mode:'Switching to typing discards the current recording preview. An explicitly saved copy may remain. Nothing will be sent.',stay:'Keep working',leave:'Discard and leave',type:'Discard recording',end:'End session'},
  ar:{title:'مغادرة العمل غير المرسل؟',body:'المغادرة تحذف العمل غير المحفوظ في هذه الصفحة. قد تبقى النسخ التي حفظتها صراحة حتى حذفها أو انتهاء صلاحيتها أو نجاح تنظيف الجلسة. لن يُرسل شيء جديد.',mode:'الانتقال إلى الكتابة يحذف معاينة التسجيل الحالية. قد تبقى نسخة حفظتها صراحة. لن يُرسل شيء.',stay:'متابعة العمل',leave:'حذف ومغادرة',type:'حذف التسجيل',end:'إنهاء الجلسة'},
  ur:{title:'نہ بھیجا گیا کام چھوڑ دیں؟',body:'چھوڑنے سے اس صفحے کا غیر محفوظ کام ضائع ہو جاتا ہے۔ واضح طور پر محفوظ نقل ہٹانے، میعاد ختم ہونے یا سیشن کی کامیاب صفائی تک باقی رہ سکتی ہے۔ کچھ نیا نہیں بھیجا جائے گا۔',mode:'لکھنے پر جانے سے موجودہ ریکارڈنگ کا پیش نظارہ ضائع ہو گا۔ واضح طور پر محفوظ نقل باقی رہ سکتی ہے۔ کچھ نہیں بھیجا جائے گا۔',stay:'کام جاری رکھیں',leave:'حذف کر کے چھوڑ دیں',type:'ریکارڈنگ حذف کریں',end:'سیشن ختم کریں'},
};
