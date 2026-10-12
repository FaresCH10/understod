import {validWorkerSession,sameWorkerSession,type PageSession} from './session-state.ts';
import type {WorkerUiLanguage} from './worker-ui-language';

export const workerEntryKey='understood:worker-entry-pending';
export type PendingWorkerEntry={version:1;digest:string;language:WorkerUiLanguage;createdAt:string};
export const workerEntryRecoveryText={
  en:{title:'Check worker access',body:'The access request may have completed. No link will be opened again automatically.',check:'Recheck access',checking:'Checking...',unconfirmed:'This browser session does not confirm the attempted link. Ask your supervisor for a new link if it was already used.',another:'Use another access link',checkFailed:'Access could not be checked. Recheck when the connection is available. No new access request was sent.',storageUnavailable:'Saved access recovery is unavailable. Use your own access link again or ask your supervisor for a new link.',anotherFailed:'A new link could not be opened. Session verification or local data cleanup did not complete. Recheck before sharing this device.'},
  ar:{title:'تحقق من وصول العامل',body:'قد يكون طلب الوصول قد اكتمل. لن يُفتح الرابط مرة أخرى تلقائيًا.',check:'إعادة التحقق من الوصول',checking:'جارٍ التحقق...',unconfirmed:'لا تؤكد جلسة المتصفح هذا الرابط. اطلب رابطًا جديدًا من المشرف إذا استُخدم بالفعل.',another:'استخدم رابط وصول آخر',checkFailed:'تعذر التحقق من الوصول. أعد التحقق عند توفر الاتصال. لم يُرسل طلب وصول جديد.',storageUnavailable:'تعذرت استعادة طلب الوصول المحفوظ. استخدم رابط الوصول الخاص بك مرة أخرى أو اطلب رابطًا جديدًا من المشرف.',anotherFailed:'تعذر فتح رابط جديد. لم يكتمل التحقق من الجلسة أو تنظيف البيانات المحلية. أعد التحقق قبل مشاركة هذا الجهاز.'},
  ur:{title:'کارکن کی رسائی چیک کریں',body:'رسائی کی درخواست مکمل ہو چکی ہو سکتی ہے۔ لنک خود بخود دوبارہ نہیں کھولا جائے گا۔',check:'رسائی دوبارہ چیک کریں',checking:'چیک کیا جا رہا ہے...',unconfirmed:'یہ براؤزر سیشن کوشش کیے گئے لنک کی تصدیق نہیں کرتا۔ اگر لنک استعمال ہو چکا ہے تو سپروائزر سے نیا لنک لیں۔',another:'دوسرا رسائی لنک استعمال کریں',checkFailed:'رسائی چیک نہیں ہو سکی۔ کنکشن دستیاب ہونے پر دوبارہ چیک کریں۔ رسائی کی کوئی نئی درخواست نہیں بھیجی گئی۔',storageUnavailable:'محفوظ رسائی کی درخواست بحال نہیں ہو سکی۔ اپنا رسائی لنک دوبارہ استعمال کریں یا سپروائزر سے نیا لنک لیں۔',anotherFailed:'نیا لنک نہیں کھولا جا سکا۔ سیشن کی تصدیق یا مقامی ڈیٹا کی صفائی مکمل نہیں ہوئی۔ یہ آلہ مشترک کرنے سے پہلے دوبارہ چیک کریں۔'},
};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
function checkedPending(value:unknown,now=Date.now()):PendingWorkerEntry{
  const entry=value as PendingWorkerEntry;
  if(!entry || Object.keys(entry).sort().join(',')!=='createdAt,digest,language,version' || entry.version!==1
    || typeof entry.digest!=='string' || !/^[a-f0-9]{64}$/.test(entry.digest) || !['en','ar','ur'].includes(entry.language)
    || typeof entry.createdAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.createdAt)
    || !Number.isFinite(Date.parse(entry.createdAt)) || Date.parse(entry.createdAt)>now+60_000 || now-Date.parse(entry.createdAt)>24*3600_000)
    throw Error('Worker access recovery is unavailable. Use your own access link again or ask your supervisor for a new link.');
  return entry;
}
export async function prepareWorkerEntry(token:string,language:WorkerUiLanguage,now=Date.now()):Promise<PendingWorkerEntry>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Invalid worker access link');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return checkedPending({version:1,digest:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),language,createdAt:new Date(now).toISOString()},now);
}
export function readPendingWorkerEntry(storage:Pick<Storage,'getItem'>,now=Date.now()){
  const raw=storage.getItem(workerEntryKey);if(raw===null)return null;
  if(raw.length>400)throw Error('Worker access recovery is unavailable.');
  try{return checkedPending(JSON.parse(raw),now);}catch{throw Error('Worker access recovery is unavailable. Use your own access link again or ask your supervisor for a new link.');}
}
export function savePendingWorkerEntry(storage:Store,entry:PendingWorkerEntry,now=Date.now()){
  const value=JSON.stringify(checkedPending(entry,now)),old=storage.getItem(workerEntryKey);
  if(old!==null && old!==value)throw Error('Another worker access request must be checked first.');
  storage.setItem(workerEntryKey,value);if(storage.getItem(workerEntryKey)!==value)throw Error('Worker access recovery could not be saved. No access request was sent.');
}
export function clearPendingWorkerEntry(storage:Store,entry:PendingWorkerEntry){
  const raw=storage.getItem(workerEntryKey);
  if(raw!==JSON.stringify(entry))throw Error('Worker access recovery changed.');
  storage.removeItem(workerEntryKey);if(storage.getItem(workerEntryKey)!==null)throw Error('Worker access recovery could not be cleared.');
}
export async function recoverWorkerEntry(entry:PendingWorkerEntry,request:(path:string,options?:RequestInit)=>Promise<unknown>,now=Date.now):Promise<PageSession|null>{
  checkedPending(entry,now());
  const session=await request('/session',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!session || typeof session!=='object' || !('authenticated' in session) || typeof session.authenticated!=='boolean')throw Error('Worker session could not be checked.');
  if(!session.authenticated || 'role' in session && session.role!=='worker')return null;
  if(!validWorkerSession(session,now()))throw Error('Worker session could not be checked.');
  const proof=await request('/auth/worker/redemption',{headers:{'x-client-session-context':session.clientContext!,'x-worker-grant-digest':entry.digest},cache:'no-store',signal:AbortSignal.timeout(15000)}) as {matches?:boolean;clientContext?:string};
  if(!proof || typeof proof.matches!=='boolean' || Object.keys(proof).sort().join(',')!==(proof.matches?'clientContext,matches':'matches'))throw Error('Worker access check could not be verified.');
  if(!proof.matches)return null;
  if(proof.clientContext!==session.clientContext)throw Error('Worker session changed.');
  const current=await request('/session',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!sameWorkerSession(session,current,now()) || (current as PageSession).expiresAt!==session.expiresAt)throw Error('Worker session changed.');
  return current as PageSession;
}
