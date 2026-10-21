export type WorkerInboxTab='todo'|'completed'|'history'|'followup';
export const workerNavigationText={
  en:{navigation:'Worker navigation',briefings:'Briefings',help:'Help',device:'Device',helpTitle:'Ask your supervisor for help',currentBriefings:'Current briefings',ask:'Ask about this briefing',followup:'Follow-up conversations',urgent:'For urgent help, speak to your supervisor in person.',empty:'No current briefings are available. Contact your supervisor in person.',needHelp:'Need help?',contact:'Contact your supervisor.',listFailed:'Your briefings could not be loaded. Recheck your connection and try refreshing.',detailFailed:'This briefing could not be loaded. Try refreshing or contact your supervisor.',loading:'Loading briefings...',version:'Briefing',openHelp:'Open help'},
  ar:{navigation:'تنقل العامل',briefings:'التعليمات',help:'المساعدة',device:'الجهاز',helpTitle:'اطلب المساعدة من المشرف',currentBriefings:'التعليمات الحالية',ask:'اسأل عن هذه التعليمات',followup:'محادثات المتابعة',urgent:'للمساعدة العاجلة، تواصل مع المشرف شخصياً.',empty:'لا توجد تعليمات حالية متاحة. تواصل مع المشرف شخصياً.',needHelp:'تحتاج إلى مساعدة؟',contact:'تواصل مع المشرف.',listFailed:'تعذر تحميل تعليماتك. تحقق من الاتصال وحاول التحديث.',detailFailed:'تعذر تحميل هذه التعليمات. حاول التحديث أو تواصل مع المشرف.',loading:'جارٍ تحميل التعليمات...',version:'التعليمات',openHelp:'افتح المساعدة'},
  ur:{navigation:'کارکن کی نیویگیشن',briefings:'ہدایات',help:'مدد',device:'آلہ',helpTitle:'سپروائزر سے مدد مانگیں',currentBriefings:'موجودہ ہدایات',ask:'اس ہدایت کے بارے میں پوچھیں',followup:'فالو اپ گفتگو',urgent:'فوری مدد کے لیے سپروائزر سے ذاتی طور پر بات کریں۔',empty:'کوئی موجودہ ہدایت دستیاب نہیں ہے۔ سپروائزر سے ذاتی طور پر رابطہ کریں۔',needHelp:'مدد چاہیے؟',contact:'اپنے سپروائزر سے رابطہ کریں۔',listFailed:'آپ کی ہدایات لوڈ نہیں ہو سکیں۔ کنکشن چیک کریں اور دوبارہ تازہ کریں۔',detailFailed:'یہ ہدایت لوڈ نہیں ہو سکی۔ دوبارہ تازہ کریں یا سپروائزر سے رابطہ کریں۔',loading:'ہدایات لوڈ ہو رہی ہیں...',version:'ہدایت',openHelp:'مدد کھولیں'},
};
export function workerInboxPath(view:string,tab:WorkerInboxTab,page:number){
  if(view==='device' || view.startsWith('worker/'))return null;
  if(!Number.isInteger(page) || page<1 || page>5000)throw Error('Invalid worker inbox page');
  const help=view==='help',history=!help && tab==='history';
  const filter=help || history?'all':tab==='todo'?'todo':tab==='completed'?'sent':'followup';
  return `${history?'/worker/history':'/worker/briefings'}?${new URLSearchParams({view:filter,page:String(page),pageSize:'5'})}`;
}
