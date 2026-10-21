import {sameWorkerSession,validWorkerSession,type PageSession} from './session-state.ts';
import {checkedWorkerSubmission,WorkerSubmissionsError,type SubmissionScope,type WorkerSubmission} from './worker-submissions.ts';

export type ReceiptSelection=SubmissionScope&{requestId:string;kind:'typed'|'audio'};
export type WorkerReceiptSnapshot={assignment:{id:string;language:string;version:number;state:string};receipt:WorkerSubmission&{durationSeconds:number|null};clientContext:string};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const validSelection=(value:ReceiptSelection)=>typeof value.assignmentId==='string'&&value.assignmentId.length>0&&value.assignmentId.length<=100&&Number.isSafeInteger(value.version)&&value.version>0&&['en','ar','ur'].includes(value.language)&&['typed','audio'].includes(value.kind)&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.requestId);

export function checkedWorkerReceiptSnapshot(value:unknown,expected:ReceiptSelection,context:string):WorkerReceiptSnapshot{
  const invalid=()=>{throw new WorkerSubmissionsError('invalid');};
  if(!validSelection(expected)||!exact(value,['assignment','receipt','clientContext']))return invalid();
  if(value.clientContext!==context||!/^[a-f0-9]{64}$/.test(context))throw new WorkerSubmissionsError('session');
  const assignment=value.assignment;
  if(!exact(assignment,['id','language','version','state'])||assignment.id!==expected.assignmentId||assignment.language!==expected.language||assignment.version!==expected.version||!['published','superseded','withdrawn','archived'].includes(assignment.state as string))return invalid();
  if(!value.receipt||typeof value.receipt!=='object'||Array.isArray(value.receipt))return invalid();
  const {durationSeconds,...fields}=value.receipt as Record<string,unknown>,receipt=checkedWorkerSubmission(fields);
  if(receipt.id!==expected.requestId||receipt.kind!==expected.kind||durationSeconds!==null&&(typeof durationSeconds!=='number'||!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>90)||receipt.kind==='typed'&&durationSeconds!==null)return invalid();
  return value as unknown as WorkerReceiptSnapshot;
}

export async function readWorkerReceiptSnapshot(send:typeof fetch,session:PageSession,selection:ReceiptSelection,signal:AbortSignal,current:()=>boolean){
  const identity={...session},expected={...selection};
  if(!validWorkerSession(identity)||!current())throw new WorkerSubmissionsError('session');
  if(!validSelection(expected))throw new WorkerSubmissionsError('invalid');
  const response=await send(`/api/worker/briefings/${encodeURIComponent(expected.assignmentId)}/submissions/${expected.requestId}`,{credentials:'include',cache:'no-store',signal,headers:{'x-client-session-context':identity.clientContext!}});
  const unchanged=()=>current()&&sameWorkerSession(identity,session)&&identity.expiresAt===session.expiresAt;
  if(!unchanged()||[401,403,409].includes(response.status))throw new WorkerSubmissionsError('session');
  if(!response.ok)throw new WorkerSubmissionsError('unavailable');
  const value=await response.json();if(!unchanged())throw new WorkerSubmissionsError('session');
  return checkedWorkerReceiptSnapshot(value,expected,identity.clientContext!);
}

export const workerReceiptText={
  en:{title:'Your answer was received.',followup:'Your supervisor may follow up if anything is unclear.',received:'Received',complete:'Complete',pending:'Check pending',checking:'Your response is waiting for its check.',matched:'Matched key facts',clarification:'Needs clarification',unassessable:'Could not assess',paused:'Check paused',audioFailed:'Audio check failed',unavailable:'Recording no longer available',answer:'Your answer',submitted:'Submitted',version:'Briefing',refresh:'Refresh this answer',loading:'Loading this answer...',failed:'This answer could not be loaded. Your receipt remains confirmed. Refresh to check its status.',earlier:'A later answer exists. This is the answer you just submitted.',limits:'A matching answer is not proof of understanding or permission to begin work.',synthetic:'Synthetic local check; this is not live AI evidence.',back:'Back to my briefings',help:'I need help'},
  ar:{title:'تم استلام إجابتك.',followup:'قد يتابع معك المشرف إذا كان هناك شيء غير واضح.',received:'تم الاستلام',complete:'مكتمل',pending:'التحقق قيد الانتظار',checking:'إجابتك بانتظار التحقق.',matched:'طابقت المعلومات المطلوبة',clarification:'تحتاج إلى توضيح',unassessable:'تعذر التقييم',paused:'التحقق متوقف مؤقتاً',audioFailed:'تعذر التحقق من الصوت',unavailable:'التسجيل لم يعد متاحاً',answer:'إجابتك',submitted:'وقت الإرسال',version:'التعليمات',refresh:'تحديث هذه الإجابة',loading:'جارٍ تحميل هذه الإجابة...',failed:'تعذر تحميل هذه الإجابة. يظل استلامها مؤكداً. حدّث للتحقق من حالتها.',earlier:'توجد إجابة أحدث. هذه هي الإجابة التي أرسلتها للتو.',limits:'تطابق الإجابة ليس دليلاً على الفهم أو إذناً ببدء العمل.',synthetic:'تحقق تجريبي محلي؛ ليس دليلاً على ذكاء اصطناعي مباشر.',back:'العودة إلى تعليماتي',help:'أحتاج مساعدة'},
  ur:{title:'آپ کا جواب موصول ہو گیا۔',followup:'اگر کوئی بات واضح نہ ہو تو سپروائزر رابطہ کر سکتا ہے۔',received:'موصول ہو گیا',complete:'مکمل',pending:'جانچ زیر التوا',checking:'آپ کا جواب جانچ کا منتظر ہے۔',matched:'اہم حقائق درست ہیں',clarification:'وضاحت درکار ہے',unassessable:'جانچ ممکن نہیں',paused:'جانچ رکی ہوئی ہے',audioFailed:'آواز کی جانچ ناکام ہوئی',unavailable:'ریکارڈنگ اب دستیاب نہیں',answer:'آپ کا جواب',submitted:'بھیجنے کا وقت',version:'ہدایت',refresh:'یہ جواب تازہ کریں',loading:'یہ جواب لوڈ ہو رہا ہے...',failed:'یہ جواب لوڈ نہیں ہو سکا۔ وصولی کی تصدیق برقرار ہے۔ حالت چیک کرنے کے لیے تازہ کریں۔',earlier:'ایک نیا جواب موجود ہے۔ یہ وہ جواب ہے جو آپ نے ابھی بھیجا تھا۔',limits:'درست جواب سمجھ کا ثبوت یا کام شروع کرنے کی اجازت نہیں۔',synthetic:'مقامی آزمائشی جانچ؛ یہ لائیو خودکار جانچ کا ثبوت نہیں۔',back:'میری ہدایات پر واپس',help:'مجھے مدد چاہیے'},
};
export const workerReceiptUnknownText={en:'Check status unavailable',ar:'حالة التحقق غير متاحة',ur:'جانچ کی حالت دستیاب نہیں'};
