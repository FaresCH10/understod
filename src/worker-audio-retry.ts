import {sameWorkerSession,validWorkerSession,type PageSession} from './session-state.ts';
import {checkedWorkerReceipt,readWorkerRequestReceipt} from './worker-request.ts';
import {workerResponseState} from './worker-state.ts';

export type RecordingScope={assignmentId:string;publicationId:string;version:number;language:'en'|'ar'|'ur'};
type Failure='input'|'session'|'unavailable'|'conflict'|'receipt';
export class WorkerAudioRetryError extends Error {
  readonly code:Failure;
  constructor(code:Failure){super(code);this.code=code;}
}
export const workerAudioRetryText={
  en:{input:'The recording identity or payload is invalid. Nothing new was sent.',session:'The worker session could not be verified. Nothing new was sent.',unavailable:'The receipt or briefing could not be checked. Nothing new was sent; keep your preview.',conflict:'This recording cannot be sent to the current briefing. Its version, deadline or response status changed. Keep the preview and check your history.',receipt:'The upload acknowledgement could not be verified. Delivery is unknown; keep the preview and check its receipt before retrying.'},
  ar:{input:'هوية التسجيل أو محتواه غير صالحين. لم يُرسل شيء جديد.',session:'تعذر التحقق من جلسة العامل. لم يُرسل شيء جديد.',unavailable:'تعذر التحقق من الاستلام أو التعليمات. لم يُرسل شيء جديد؛ احتفظ بالمعاينة.',conflict:'لا يمكن إرسال التسجيل إلى التعليمات الحالية. تغيّر الإصدار أو الموعد النهائي أو حالة الإجابة. احتفظ بالمعاينة وتحقق من السجل.',receipt:'تعذر التحقق من تأكيد رفع التسجيل. الإرسال غير مؤكد؛ احتفظ بالمعاينة وتحقق من الاستلام قبل إعادة المحاولة.'},
  ur:{input:'ریکارڈنگ کی شناخت یا مواد درست نہیں۔ کچھ نیا نہیں بھیجا گیا۔',session:'کارکن کے سیشن کی تصدیق نہیں ہو سکی۔ کچھ نیا نہیں بھیجا گیا۔',unavailable:'وصولی یا ہدایات چیک نہیں ہو سکیں۔ کچھ نیا نہیں بھیجا گیا؛ پیش نظارہ محفوظ رکھیں۔',conflict:'یہ ریکارڈنگ موجودہ ہدایات پر نہیں بھیجی جا سکتی۔ ورژن، آخری وقت یا جواب کی حالت بدل گئی ہے۔ پیش نظارہ رکھیں اور تاریخ چیک کریں۔',receipt:'اپ لوڈ کی تصدیق نہیں ہو سکی۔ ترسیل نامعلوم ہے؛ پیش نظارہ رکھیں اور دوبارہ کوشش سے پہلے وصولی چیک کریں۔'},
};

export async function sendWorkerRecording(
  send:typeof fetch,session:PageSession,scope:RecordingScope,bytes:Uint8Array,submissionId:string,
  current:()=>boolean=()=>true,
) {
  const expected={...session},captured={...scope};
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(submissionId)
    || ![captured.assignmentId,captured.publicationId].every(value=>typeof value==='string' && value.trim().length>0 && value.length<=100)
    || !Number.isSafeInteger(captured.version) || captured.version<1 || !['en','ar','ur'].includes(captured.language)
    || !(bytes instanceof Uint8Array) || bytes.length<8044 || bytes.length>2880044 || bytes.length%2!==0)throw new WorkerAudioRetryError('input');
  const payload=new Uint8Array(bytes);
  const guard=()=>current() && sameWorkerSession(expected,session) && expected.expiresAt===session.expiresAt;
  if(!validWorkerSession(expected) || !guard())throw new WorkerAudioRetryError('session');
  let verified;
  try {
    const response=await send('/api/session',{method:'GET',credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'x-client-session-context':expected.clientContext!}});
    if(!response.ok)throw Error();
    verified=await response.json();
  }catch {throw new WorkerAudioRetryError('session');}
  if(!guard() || !sameWorkerSession(expected,verified) || verified.expiresAt!==expected.expiresAt)throw new WorkerAudioRetryError('session');

  let receipt;
  try {
    receipt=await readWorkerRequestReceipt((path,options)=>send(path,{...options,signal:AbortSignal.timeout(15000)}),expected,captured.assignmentId,'audio',submissionId,guard);
  }catch {throw new WorkerAudioRetryError(guard()?'unavailable':'session');}
  // Accepted immutable history wins even if the publication has since closed.
  if(receipt)return receipt;

  let detail;
  try {
    const response=await send(`/api/worker/briefings/${encodeURIComponent(captured.assignmentId)}`,{method:'GET',credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'x-client-session-context':expected.clientContext!}});
    if([403,404,409,410].includes(response.status))throw new WorkerAudioRetryError('conflict');
    if(!response.ok)throw Error();
    detail=await response.json();
  }catch(error){if(error instanceof WorkerAudioRetryError)throw error;throw new WorkerAudioRetryError('unavailable');}
  if(!guard())throw new WorkerAudioRetryError('session');
  if(!detail || detail.id!==captured.assignmentId || detail.publicationId!==captured.publicationId
    || detail.version!==captured.version || detail.language!==captured.language
    || (detail.dueAt!=null && (typeof detail.dueAt!=='string' || !Number.isFinite(Date.parse(detail.dueAt))))
    || !workerResponseState(detail).canRespond)throw new WorkerAudioRetryError('conflict');
  if(!guard())throw new WorkerAudioRetryError('session');

  try {
    const response=await send(`/api/worker/briefings/${encodeURIComponent(captured.assignmentId)}/audio`,{
      method:'POST',credentials:'include',cache:'no-store',signal:AbortSignal.timeout(45000),
      headers:{'content-type':'audio/wav','x-submission-id':submissionId,'x-client-session-context':expected.clientContext!},
      body:new Blob([payload],{type:'audio/wav'}),
    });
    const result=await response.json();
    if(!response.ok || !guard())throw Error();
    return checkedWorkerReceipt(result,'audio',{requestId:submissionId,assignmentId:captured.assignmentId,clientContext:expected.clientContext!});
  }catch {throw new WorkerAudioRetryError('receipt');}
}
