export type PageSession={authenticated:boolean;role?:string;clientContext?:string;expiresAt?:string;workerId?:string|null;language?:string;mode?:string;staffRole?:string|null;staffScope?:string|null;siteState?:string;name?:string;organization?:string;site?:string};

export function validWorkerSession(value:unknown,now=Date.now()):value is PageSession {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const session=value as PageSession;
  return session.authenticated===true && session.role==='worker' && typeof session.clientContext==='string'
    && /^[a-f0-9]{64}$/.test(session.clientContext) && typeof session.workerId==='string' && session.workerId.trim().length>0
    && typeof session.mode==='string' && /^[a-z][a-z0-9-]{0,63}$/.test(session.mode)
    && ['en','ar','ur'].includes(session.language || '') && typeof session.expiresAt==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(session.expiresAt)
    && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt)>now;
}
export function sameWorkerSession(expected:PageSession,current:unknown,now=Date.now()) {
  if(!validWorkerSession(expected,now) || !validWorkerSession(current,now))return false;
  return current.clientContext===expected.clientContext && current.workerId===expected.workerId
    && current.language===expected.language && current.mode===expected.mode;
}
export function validStaffSession(value:unknown,now=Date.now()):value is PageSession {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const session=value as PageSession;let scope;
  try{scope=JSON.parse(session.staffScope || '');}catch{return false;}
  return session.authenticated===true && session.role==='staff' && ['owner','administrator','supervisor','auditor'].includes(session.staffRole || '')
    && Array.isArray(scope) && scope.length===3 && scope.every(item=>typeof item==='string' && item.trim() && item.length<=100 && !/[\u0000-\u001f\u007f]/.test(item))
    && session.staffScope===JSON.stringify(scope) && ['active','archived'].includes(session.siteState || '')
    && typeof session.clientContext==='string' && /^[a-f0-9]{64}$/.test(session.clientContext)
    && typeof session.mode==='string' && /^[a-z][a-z0-9-]{0,63}$/.test(session.mode)
    && typeof session.expiresAt==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(session.expiresAt)
    && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt)>now;
}
export function sameStaffSession(expected:PageSession,current:unknown,now=Date.now()) {
  if(!validStaffSession(expected,now) || !validStaffSession(current,now))return false;
  return current.clientContext===expected.clientContext && current.staffScope===expected.staffScope
    && current.staffRole===expected.staffRole && current.siteState===expected.siteState
    && current.mode===expected.mode && current.expiresAt===expected.expiresAt;
}
export const validPageSession=(value:unknown,now=Date.now())=>validWorkerSession(value,now) || validStaffSession(value,now);
export function samePageSession(expected:PageSession,current:unknown,now=Date.now()) {
  return expected.role==='worker'?sameWorkerSession(expected,current,now):sameStaffSession(expected,current,now);
}
export const staffSessionText={
  en:{title:'This workspace session is locked',body:'The session changed, ended or could not be verified. Unsubmitted changes on this page are no longer open. A request already sent may still complete.',next:'Saved request recovery records have not been replayed or removed.',check:'Recheck session',checking:'Checking session...',same:'The original account and site are verified.',different:'A different account, site or access policy is active.',guest:'No signed-in session is active.',worker:'A worker session is active. Reload and check the worker identity before continuing.',unavailable:'The session could not be verified. No workspace was opened and no request was repeated.',resume:'Return to verified workspace',open:'Open verified account and site',confirm:'I have checked the account and site shown below.',signIn:'Go to sign in',reload:'Reload and check identity',account:'Account',organization:'Organization',site:'Site',role:'Role'},
  ar:{title:'تم قفل جلسة مساحة العمل',body:'تغيّرت الجلسة أو انتهت أو تعذّر التحقق منها. لم تعد التغييرات غير المرسلة في هذه الصفحة مفتوحة. قد يكتمل طلب أُرسل بالفعل.',next:'لم تتم إعادة إرسال سجلات استعادة الطلبات المحفوظة أو حذفها.',check:'إعادة التحقق من الجلسة',checking:'جارٍ التحقق من الجلسة...',same:'تم التحقق من الحساب والموقع الأصليين.',different:'يوجد حساب أو موقع أو سياسة وصول مختلفة نشطة.',guest:'لا توجد جلسة مسجلة الدخول نشطة.',worker:'توجد جلسة عامل نشطة. أعد التحميل وتحقق من هوية العامل قبل المتابعة.',unavailable:'تعذر التحقق من الجلسة. لم يتم فتح مساحة عمل أو إعادة إرسال أي طلب.',resume:'العودة إلى مساحة العمل المتحقق منها',open:'فتح الحساب والموقع المتحقق منهما',confirm:'تحققت من الحساب والموقع الظاهرين أدناه.',signIn:'الانتقال إلى تسجيل الدخول',reload:'إعادة التحميل والتحقق من الهوية',account:'الحساب',organization:'المؤسسة',site:'الموقع',role:'الدور'},
  ur:{title:'یہ ورک اسپیس سیشن مقفل ہے',body:'سیشن بدل گیا، ختم ہو گیا یا اس کی تصدیق نہیں ہو سکی۔ اس صفحے کی غیر ارسال شدہ تبدیلیاں اب کھلی نہیں ہیں۔ پہلے بھیجی گئی درخواست مکمل ہو سکتی ہے۔',next:'محفوظ درخواست کی بازیابی کے ریکارڈ دوبارہ نہیں بھیجے گئے اور نہ ہی حذف ہوئے ہیں۔',check:'سیشن دوبارہ چیک کریں',checking:'سیشن چیک کیا جا رہا ہے...',same:'اصل اکاؤنٹ اور سائٹ کی تصدیق ہو گئی ہے۔',different:'ایک مختلف اکاؤنٹ، سائٹ یا رسائی کی پالیسی فعال ہے۔',guest:'کوئی سائن ان سیشن فعال نہیں ہے۔',worker:'کارکن کا سیشن فعال ہے۔ آگے بڑھنے سے پہلے دوبارہ لوڈ کریں اور کارکن کی شناخت چیک کریں۔',unavailable:'سیشن کی تصدیق نہیں ہو سکی۔ کوئی ورک اسپیس نہیں کھلی اور کوئی درخواست دوبارہ نہیں بھیجی گئی۔',resume:'تصدیق شدہ ورک اسپیس پر واپس جائیں',open:'تصدیق شدہ اکاؤنٹ اور سائٹ کھولیں',confirm:'میں نے نیچے دکھائے گئے اکاؤنٹ اور سائٹ کو چیک کیا ہے۔',signIn:'سائن ان پر جائیں',reload:'دوبارہ لوڈ کرکے شناخت چیک کریں',account:'اکاؤنٹ',organization:'ادارہ',site:'سائٹ',role:'کردار'},
};
export const workerSessionText={
  en:{title:'This worker session is locked',body:'The session changed, ended or could not be verified. Unsent work on this page has been cleared. A request already sent may still complete.',next:'Reopen your own access link, or reload and check the identity before continuing.',reload:'Reload'},
  ar:{title:'تم قفل جلسة العامل',body:'تغيّرت الجلسة أو انتهت أو تعذّر التحقق منها. تم مسح العمل غير المرسل في هذه الصفحة. قد يكتمل طلب أُرسل بالفعل.',next:'افتح رابط الوصول الخاص بك، أو أعد تحميل الصفحة وتحقق من الهوية قبل المتابعة.',reload:'إعادة تحميل'},
  ur:{title:'کارکن کا یہ سیشن مقفل ہے',body:'سیشن بدل گیا، ختم ہو گیا یا اس کی تصدیق نہیں ہو سکی۔ اس صفحے کا نہ بھیجا گیا کام مٹا دیا گیا ہے۔ پہلے بھیجی گئی درخواست مکمل ہو سکتی ہے۔',next:'اپنا رسائی کا لنک دوبارہ کھولیں، یا صفحہ دوبارہ لوڈ کر کے آگے بڑھنے سے پہلے شناخت چیک کریں۔',reload:'دوبارہ لوڈ کریں'},
};
export const sessionLoadText={
  en:{title:'Session unavailable',body:'Your session could not be checked. No workspace has been opened.',retry:'Recheck session'},
  ar:{title:'الجلسة غير متاحة',body:'تعذر التحقق من جلستك. لم يتم فتح أي مساحة عمل.',retry:'إعادة التحقق من الجلسة'},
  ur:{title:'سیشن دستیاب نہیں',body:'آپ کے سیشن کی تصدیق نہیں ہو سکی۔ کوئی ورک اسپیس نہیں کھولی گئی۔',retry:'سیشن دوبارہ چیک کریں'},
};
