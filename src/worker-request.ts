import {validWorkerSession,sameWorkerSession,type PageSession} from './session-state.ts';
type Store=Pick<Storage,'getItem'|'setItem'>;
type Ledger={context:string;expiresAt:string;entries:{fingerprint:string;requestId:string}[]};
const key='understood:worker-requests:v1';
const hash=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Failure='storage'|'corrupt'|'full'|'expired'|'input'|'receipt';
export class WorkerRequestError extends Error {
  readonly code:Failure;
  constructor(code:Failure){super(code);this.code=code;}
}
export const workerRequestText={
  en:{storage:'This tab could not retain the request identity. Nothing was sent.',corrupt:'The request record in this tab cannot be verified. Check your submitted answers before starting another request.',full:'The request limit for this tab has been reached. Nothing new was sent.',expired:'This worker session is no longer valid. Nothing was sent.',input:'This request is invalid. Nothing was sent.',receipt:'The server acknowledgement could not be verified. Your request may have been received. Check its history before retrying.'},
  ar:{storage:'تعذر حفظ هوية الطلب في هذه الصفحة. لم يُرسل شيء.',corrupt:'تعذر التحقق من سجل الطلبات في هذه الصفحة. تحقق من إجاباتك المرسلة قبل بدء طلب آخر.',full:'تم بلوغ حد الطلبات لهذه الصفحة. لم يُرسل شيء جديد.',expired:'جلسة العامل هذه لم تعد صالحة. لم يُرسل شيء.',input:'هذا الطلب غير صالح. لم يُرسل شيء.',receipt:'تعذر التحقق من تأكيد الخادم. ربما تم استلام طلبك. تحقق من سجله قبل إعادة المحاولة.'},
  ur:{storage:'یہ صفحہ درخواست کی شناخت محفوظ نہیں کر سکا۔ کچھ نہیں بھیجا گیا۔',corrupt:'اس صفحے کی درخواستوں کے ریکارڈ کی تصدیق نہیں ہو سکی۔ نئی درخواست سے پہلے اپنے بھیجے گئے جواب دیکھیں۔',full:'اس صفحے کی درخواستوں کی حد پوری ہو گئی ہے۔ کچھ نیا نہیں بھیجا گیا۔',expired:'کارکن کا یہ سیشن اب درست نہیں ہے۔ کچھ نہیں بھیجا گیا۔',input:'یہ درخواست درست نہیں ہے۔ کچھ نہیں بھیجا گیا۔',receipt:'سرور کی تصدیق کی جانچ نہیں ہو سکی۔ ممکن ہے آپ کی درخواست موصول ہو گئی ہو۔ دوبارہ کوشش سے پہلے اس کی تاریخ دیکھیں۔'},
};
export function checkedWorkerReceipt(value:unknown,kind:'answer'|'help'|'audio',expected:{requestId:string;assignmentId:string;clientContext:string}) {
  const result=value as Record<string,unknown>|null;
  const allowed=[...(kind==='answer'?['id','outcome','assessmentStatus','duplicate']:kind==='help'?['id','status','duplicate']:['id','status','receivedAt','aiStatus','duplicate']),'requestId','assignmentId','clientContext'];
  if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).some(name=>!allowed.includes(name))
    || typeof result.id!=='string' || !uuid.test(result.id) || typeof result.duplicate!=='boolean'
    || !uuid.test(expected.requestId) || !expected.assignmentId || !hash.test(expected.clientContext)
    || result.requestId!==expected.requestId || result.assignmentId!==expected.assignmentId || result.clientContext!==expected.clientContext)throw new WorkerRequestError('receipt');
  if(kind==='audio'){
    if(!['received','processing','blocked','transcribed','failed'].includes(result.status as string)
      || typeof result.receivedAt!=='string' || !Number.isFinite(Date.parse(result.receivedAt))
      || new Date(result.receivedAt).toISOString()!==result.receivedAt
      || (result.aiStatus!==undefined && !['pending','blocked','transcribed','failed'].includes(result.aiStatus as string)))throw new WorkerRequestError('receipt');
  }else if(kind==='help'){
    if(result.id!==expected.requestId || !['open','resolved'].includes(result.status as string))throw new WorkerRequestError('receipt');
  }else {
    const complete=['matched','clarification','unassessable'].includes(result.outcome as string);
    if(!(complete && (result.assessmentStatus===undefined || result.assessmentStatus==='complete'))
      && !(result.outcome===null && result.assessmentStatus==='pending'))throw new WorkerRequestError('receipt');
  }
  return result;
}

export async function readWorkerRequestReceipt(send:typeof fetch,session:PageSession,assignmentId:string,kind:'answer'|'help'|'audio',requestId:string,current:()=>boolean=()=>true) {
  const expected={...session};
  if(!validWorkerSession(expected) || !current() || typeof requestId!=='string' || !uuid.test(requestId) || typeof assignmentId!=='string' || !assignmentId || assignmentId.length>100 || !['answer','help','audio'].includes(kind))throw new WorkerRequestError('receipt');
  const response=await send(`/api/worker/briefings/${encodeURIComponent(assignmentId)}/receipts/${kind}/${requestId}`,{
    method:'GET',credentials:'include',cache:'no-store',headers:{'x-client-session-context':expected.clientContext!},
  });
  const result=response.ok ? await response.json() : null;
  if(!current() || !sameWorkerSession(expected,session) || expected.expiresAt!==session.expiresAt)throw new WorkerRequestError('receipt');
  // A missing receipt is unknown, not proof that a prior POST was never accepted.
  if(response.status===404)return null;
  if(!response.ok)throw new WorkerRequestError('receipt');
  return checkedWorkerReceipt(result,kind,{requestId,assignmentId,clientContext:expected.clientContext!});
}

export const workerReceiptCheckText={
  en:{answer:'Answer',help:'Help request',audio:'Recording',check:'Check receipt',unknown:'Receipt is not confirmed. Delivery remains unknown; your draft stays here.',received:'Receipt verified. Your draft remains here; nothing was resent.',failed:'Receipt could not be checked. Delivery remains unknown; nothing was resent.'},
  ar:{answer:'الإجابة',help:'طلب المساعدة',audio:'التسجيل',check:'تحقق من الاستلام',unknown:'لم يتم تأكيد الاستلام. الإرسال غير مؤكد؛ تبقى المسودة هنا.',received:'تم التحقق من الاستلام. تبقى المسودة هنا؛ لم يُعد إرسال شيء.',failed:'تعذر التحقق من الاستلام. الإرسال غير مؤكد؛ لم يُعد إرسال شيء.'},
  ur:{answer:'جواب',help:'مدد کی درخواست',audio:'ریکارڈنگ',check:'وصولی چیک کریں',unknown:'وصولی کی تصدیق نہیں ہوئی۔ ترسیل نامعلوم ہے؛ مسودہ یہیں موجود ہے۔',received:'وصولی کی تصدیق ہو گئی۔ مسودہ یہیں موجود ہے؛ دوبارہ کچھ نہیں بھیجا گیا۔',failed:'وصولی چیک نہیں ہو سکی۔ ترسیل نامعلوم ہے؛ دوبارہ کچھ نہیں بھیجا گیا۔'},
};
function read(storage:Store):Ledger|null {
  let raw:string|null;
  try {raw=storage.getItem(key);}catch {throw new WorkerRequestError('storage');}
  if(raw===null)return null;
  try {
    if(raw.length>20000)throw Error();
    const value=JSON.parse(raw) as Ledger;
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='context,entries,expiresAt'
      || typeof value.context!=='string' || !hash.test(value.context) || typeof value.expiresAt!=='string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.expiresAt) || !Number.isFinite(Date.parse(value.expiresAt))
      || !Array.isArray(value.entries) || value.entries.length>100)throw Error();
    const fingerprints=new Set<string>(),ids=new Set<string>();
    for(const entry of value.entries){
      if(!entry || typeof entry!=='object' || Array.isArray(entry) || Object.keys(entry).sort().join(',')!=='fingerprint,requestId'
        || typeof entry.fingerprint!=='string' || !hash.test(entry.fingerprint) || typeof entry.requestId!=='string' || !uuid.test(entry.requestId)
        || fingerprints.has(entry.fingerprint) || ids.has(entry.requestId))throw Error();
      fingerprints.add(entry.fingerprint);ids.add(entry.requestId);
    }
    return value;
  }catch {throw new WorkerRequestError('corrupt');}
}
export async function workerRequestId(storage:Store,session:PageSession,assignmentId:string,kind:'answer'|'help',text:string,now=Date.now,repeatId?:string) {
  if(!validWorkerSession(session,now()))throw new WorkerRequestError('expired');
  const expected={...session};
  if(typeof assignmentId!=='string' || !assignmentId || assignmentId.length>100 || !['answer','help'].includes(kind)
    || typeof text!=='string' || !text.trim() || text.length>(kind==='answer'?2000:500) || (kind==='help' && text.trim().length<3))throw new WorkerRequestError('input');
  if(repeatId!==undefined && (kind!=='answer' || !uuid.test(repeatId)))throw new WorkerRequestError('input');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([session.clientContext,assignmentId,kind,text.trim(),...(repeatId?[repeatId]:[])])));
  if(!sameWorkerSession(expected,session,now()) || session.expiresAt!==expected.expiresAt)throw new WorkerRequestError('expired');
  const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const old=read(storage);
  // The ledger contains request identifiers only, never a recoverable answer or audio payload.
  const ledger=old && old.context===session.clientContext ? old : {context:session.clientContext!,expiresAt:session.expiresAt!,entries:[]};
  if(ledger.expiresAt!==session.expiresAt)throw new WorkerRequestError('corrupt');
  const existing=ledger.entries.find(entry=>entry.fingerprint===fingerprint);
  if(existing)return existing.requestId;
  if(ledger.entries.length>=100)throw new WorkerRequestError('full');
  const requestId=crypto.randomUUID();ledger.entries.push({fingerprint,requestId});
  const raw=JSON.stringify(ledger);
  try {storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error();}
  catch {throw new WorkerRequestError('storage');}
  return requestId;
}
