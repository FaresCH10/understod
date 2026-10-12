import {validWorkerSession,type PageSession} from './session-state.ts';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const choice='understood:private-device:v1',barrier='understood:device-barrier:v1',eventName='understood:device-policy';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function privateDeviceAllowed(context:string,tab:Store=sessionStorage,device:Store=localStorage,now=Date.now()){
  try {
    const raw=tab.getItem(choice);if(!raw || raw.length>400)return false;
    const value=JSON.parse(raw),current=device.getItem(barrier);
    return Object.keys(value).sort().join(',')==='barrier,context,expiresAt' && /^[a-f0-9]{64}$/.test(context)
      && value.context===context && typeof value.expiresAt==='string' && Number.isFinite(Date.parse(value.expiresAt))
      && Date.parse(value.expiresAt)>now && (current===null || uuid.test(current)) && value.barrier===current;
  }catch {return false;}
}
function changed(){if(typeof window!=='undefined')window.dispatchEvent(new Event(eventName));}
export function allowPrivateDevice(session:PageSession,tab:Store=sessionStorage,device:Store=localStorage,now=Date.now()){
  if(!validWorkerSession(session,now))throw Error('Session unavailable');
  const current=device.getItem(barrier);if(current!==null && !uuid.test(current))throw Error('Device policy unavailable');
  const raw=JSON.stringify({context:session.clientContext,expiresAt:session.expiresAt,barrier:current});
  tab.setItem(choice,raw);
  if(tab.getItem(choice)!==raw || !privateDeviceAllowed(session.clientContext!,tab,device,now))throw Error('Device policy unavailable');
  changed();
}
// Revoke every tab's old private choice before asynchronous deletion can start.
export async function enableSharedDevice(tab:Store=sessionStorage,device:Store=localStorage,purge?:()=>Promise<boolean>){
  let blocked=true;
  try {const next=crypto.randomUUID();device.setItem(barrier,next);if(device.getItem(barrier)!==next)blocked=false;}catch {blocked=false;}
  try {tab.removeItem(choice);if(tab.getItem(choice)!==null)blocked=false;}catch {blocked=false;}
  changed();
  let cleared=false;
  try {cleared=purge?await purge():await (await import('./worker-local-data.ts')).clearWorkerLocalData();}catch {}
  return blocked && cleared;
}
export function subscribeDevicePolicy(changed:()=>void){
  const storage=(event:StorageEvent)=>{if(event.key===barrier || event.key===null)changed();};
  window.addEventListener(eventName,changed);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(eventName,changed);window.removeEventListener('storage',storage);};
}
export const sharedDeviceText={
  en:{title:'Shared phone mode',on:'On',off:'Off',body:'Private saving is blocked in shared mode. End your session before another person uses this device.',blocked:'Shared phone mode is on. Private saving is unavailable. Change the mode in This device only on a device you control.',privateWarning:'Turn off shared phone mode for this session? Only continue on a device you control. Each private save still needs your explicit choice.',clearWarning:'Turn on shared phone mode and clear saved text, briefings and recordings on this device? Unsent saved work will be lost. This does not end server access.',cleared:'Shared phone mode is on. Saved private data was removed. End your session before sharing.',failed:'Shared mode cleanup could not be confirmed. Do not share this device until saved private data is removed.'},
  ar:{title:'وضع الهاتف المشترك',on:'مفعّل',off:'غير مفعّل',body:'الحفظ الخاص محظور في الوضع المشترك. أنهِ جلستك قبل أن يستخدم شخص آخر هذا الجهاز.',blocked:'وضع الهاتف المشترك مفعّل. الحفظ الخاص غير متاح. غيّر الوضع من هذا الجهاز فقط على جهاز تتحكم فيه.',privateWarning:'هل تريد إيقاف وضع الهاتف المشترك لهذه الجلسة؟ تابع فقط على جهاز تتحكم فيه. يتطلب كل حفظ خاص اختيارك الصريح.',clearWarning:'هل تريد تفعيل الوضع المشترك ومسح النص والتعليمات والتسجيلات المحفوظة على هذا الجهاز؟ سيُفقد العمل المحفوظ غير المرسل. لا ينهي هذا الوصول إلى الخادم.',cleared:'الوضع المشترك مفعّل. حُذفت البيانات الخاصة المحفوظة. أنهِ جلستك قبل مشاركة الجهاز.',failed:'تعذر تأكيد التنظيف في الوضع المشترك. لا تشارك الجهاز حتى تُحذف البيانات الخاصة المحفوظة.'},
  ur:{title:'مشترکہ فون موڈ',on:'فعال',off:'بند',body:'مشترکہ موڈ میں نجی محفوظ کرنا بند ہے۔ کسی دوسرے شخص کے استعمال سے پہلے اپنا سیشن ختم کریں۔',blocked:'مشترکہ فون موڈ فعال ہے۔ نجی محفوظ کرنا دستیاب نہیں۔ یہ آلہ میں صرف اپنے اختیار والے آلے پر موڈ بدلیں۔',privateWarning:'اس سیشن کے لیے مشترکہ فون موڈ بند کریں؟ صرف اپنے اختیار والے آلے پر آگے بڑھیں۔ ہر نجی محفوظ کرنے کے لیے آپ کا واضح انتخاب ضروری ہے۔',clearWarning:'مشترکہ موڈ فعال کر کے اس آلے کا محفوظ متن، ہدایات اور ریکارڈنگز صاف کریں؟ محفوظ مگر نہ بھیجا گیا کام ضائع ہو گا۔ اس سے سرور کی رسائی ختم نہیں ہوتی۔',cleared:'مشترکہ موڈ فعال ہے۔ محفوظ نجی ڈیٹا ہٹا دیا گیا۔ آلہ دینے سے پہلے سیشن ختم کریں۔',failed:'مشترکہ موڈ کی صفائی کی تصدیق نہیں ہوئی۔ محفوظ نجی ڈیٹا ہٹائے بغیر آلہ کسی دوسرے کو نہ دیں۔'},
};
