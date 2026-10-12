import {validWorkerSession,sameWorkerSession,type PageSession} from './session-state.ts';
import {privateDeviceAllowed} from './worker-device-policy.ts';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type DraftScope={assignmentId:string;publicationId:string;version:number};
export type DraftReceipt={kind:'answer'|'help'|'audio';requestId:string;assignmentId:string;status:'unknown'|'received'|'failed'};
export type TextDraft={answer:string;help:string;receipts:DraftReceipt[]};
type Snapshot={session:PageSession;scope:DraftScope;savedAt:string;draft:TextDraft};
const key='understood:worker-text-draft:v1';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class TextDraftError extends Error {
  readonly code:'storage'|'invalid'|'scope'|'expired';
  constructor(code:TextDraftError['code']){super(code);this.code=code;}
}
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{
  return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===keys.sort().join(',');
}
function validScope(value:unknown):value is DraftScope {
  return exact(value,['assignmentId','publicationId','version']) && ['assignmentId','publicationId'].every(name=>typeof value[name]==='string' && !!value[name] && (value[name] as string).length<=100)
    && Number.isSafeInteger(value.version) && (value.version as number)>0;
}
function validDraft(value:unknown,scope:DraftScope):value is TextDraft {
  if(!exact(value,['answer','help','receipts']) || typeof value.answer!=='string' || value.answer.length>2000 || typeof value.help!=='string' || value.help.length>500
    || !Array.isArray(value.receipts) || value.receipts.length>3)return false;
  const kinds=new Set();
  return value.receipts.every(item=>{
    if(!exact(item,['kind','requestId','assignmentId','status']) || !['answer','help','audio'].includes(item.kind as string) || kinds.has(item.kind)
      || typeof item.requestId!=='string' || !uuid.test(item.requestId) || item.assignmentId!==scope.assignmentId || !['unknown','received','failed'].includes(item.status as string))return false;
    kinds.add(item.kind);return true;
  });
}
function read(store:Store):Snapshot|null {
  let raw:string|null;
  try {raw=store.getItem(key);}catch {throw new TextDraftError('storage');}
  if(raw===null)return null;
  try {
    if(raw.length>20000)throw Error();
    const value=JSON.parse(raw);
    if(!exact(value,['session','scope','savedAt','draft']) || !exact(value.session,['authenticated','role','workerId','language','mode','clientContext','expiresAt'])
      || !validWorkerSession(value.session,0) || !validScope(value.scope) || !validDraft(value.draft,value.scope)
      || typeof value.savedAt!=='string' || !Number.isFinite(Date.parse(value.savedAt)) || new Date(value.savedAt).toISOString()!==value.savedAt
      || Date.parse(value.savedAt)>=Date.parse(value.session.expiresAt!))throw Error();
    return value as unknown as Snapshot;
  }catch {throw new TextDraftError('invalid');}
}
function current(session:PageSession,now:number){if(!validWorkerSession(session,now))throw new TextDraftError('expired');}
function sameScope(left:DraftScope,right:DraftScope){return left.assignmentId===right.assignmentId && left.publicationId===right.publicationId && left.version===right.version;}
function owned(store:Store,session:PageSession,now:number){
  current(session,now);const saved=read(store);
  if(saved && (!sameWorkerSession(saved.session,session,now) || saved.session.expiresAt!==session.expiresAt)){
    removeTextDraft(store);return null;
  }
  return saved;
}
export function textDraftStatus(store:Store,session:PageSession,scope:DraftScope,now=Date.now()){
  if(!validScope(scope))throw new TextDraftError('invalid');
  const saved=owned(store,session,now);
  return !saved ? 'empty' : sameScope(saved.scope,scope) ? 'saved' : 'other';
}
export function saveTextDraft(store:Store,session:PageSession,scope:DraftScope,draft:TextDraft,consent:boolean,now=Date.now()){
  current(session,now);
  if(typeof sessionStorage!=='undefined' && store===sessionStorage && !privateDeviceAllowed(session.clientContext!))throw new TextDraftError('storage');
  if(consent!==true || !validScope(scope) || !validDraft(draft,scope) || (!draft.answer.trim() && !draft.help.trim() && !draft.receipts.length))throw new TextDraftError('invalid');
  if(textDraftStatus(store,session,scope,now)==='other')throw new TextDraftError('scope');
  const {authenticated,role,workerId,language,mode,clientContext,expiresAt}=session;
  // Explicit tab-only snapshot, not an offline queue or encrypted vault.
  const raw=JSON.stringify({session:{authenticated,role,workerId,language,mode,clientContext,expiresAt},scope,savedAt:new Date(now).toISOString(),draft});
  try {store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error();}catch {throw new TextDraftError('storage');}
}
export function restoreTextDraft(store:Store,session:PageSession,scope:DraftScope,now=Date.now()):TextDraft|null {
  if(!validScope(scope))throw new TextDraftError('invalid');
  const saved=owned(store,session,now);
  if(!saved)return null;
  if(!sameScope(saved.scope,scope))throw new TextDraftError('scope');
  if(Date.parse(saved.savedAt)>now)throw new TextDraftError('invalid');
  return saved.draft;
}
export function removeTextDraft(store:Store){
  try {store.removeItem(key);if(store.getItem(key)!==null)throw Error();}catch {throw new TextDraftError('storage');}
}
export function canRestoreTextDraft(draft:TextDraft,audioUnsent:boolean){return !audioUnsent && !draft.answer && !draft.help && !draft.receipts.length;}
export const textDraftCopy={
  en:{title:'Text saved in this tab',consent:'This is a device I control',save:'Save text in this tab',restore:'Restore saved text',remove:'Remove saved text',empty:'No text snapshot saved.',saved:'Text snapshot saved here, not sent. Later edits need another save. Audio is not included.',other:'A snapshot for another briefing version is saved. Remove it before saving this one.',restored:'Saved text restored. Nothing was sent.',removed:'Saved text removed. Current text remains.',failed:'Saved text could not be verified or updated. Current text remains.',limits:'This snapshot belongs to this tab and session. Browser restore may retain it after closing. Remove it before sharing the device. Browser storage is not a secure vault.'},
  ar:{title:'النص المحفوظ في هذه الصفحة',consent:'هذا جهاز أتحكم فيه',save:'احفظ النص في هذه الصفحة',restore:'استعد النص المحفوظ',remove:'احذف النص المحفوظ',empty:'لا توجد نسخة نصية محفوظة.',saved:'حُفظت نسخة النص هنا ولم تُرسل. تحتاج التعديلات اللاحقة إلى حفظ جديد. الصوت غير مشمول.',other:'توجد نسخة محفوظة لإصدار تعليمات آخر. احذفها قبل حفظ هذه النسخة.',restored:'تمت استعادة النص. لم يُرسل شيء.',removed:'حُذف النص المحفوظ. يبقى النص الحالي.',failed:'تعذر التحقق من النص المحفوظ أو تحديثه. يبقى النص الحالي.',limits:'هذه النسخة مرتبطة بهذه الصفحة والجلسة. قد تحتفظ بها استعادة المتصفح بعد الإغلاق. احذفها قبل مشاركة الجهاز. تخزين المتصفح ليس خزنة آمنة.'},
  ur:{title:'اس صفحے میں محفوظ متن',consent:'یہ آلہ میرے اختیار میں ہے',save:'اس صفحے میں متن محفوظ کریں',restore:'محفوظ متن بحال کریں',remove:'محفوظ متن ہٹائیں',empty:'متن کی کوئی محفوظ نقل نہیں۔',saved:'متن کی نقل یہاں محفوظ ہے، بھیجی نہیں گئی۔ مزید تبدیلیوں کے لیے دوبارہ محفوظ کریں۔ آڈیو شامل نہیں۔',other:'ہدایات کے دوسرے ورژن کی نقل محفوظ ہے۔ اس کو محفوظ کرنے سے پہلے پرانی نقل ہٹائیں۔',restored:'محفوظ متن بحال ہو گیا۔ کچھ نہیں بھیجا گیا۔',removed:'محفوظ متن ہٹا دیا گیا۔ موجودہ متن باقی ہے۔',failed:'محفوظ متن کی تصدیق یا تبدیلی نہیں ہو سکی۔ موجودہ متن باقی ہے۔',limits:'یہ نقل اسی ٹیب اور سیشن کی ہے۔ براؤزر بحال ہونے پر بند کرنے کے بعد بھی باقی رہ سکتی ہے۔ آلہ کسی اور کو دینے سے پہلے ہٹائیں۔ براؤزر کا ذخیرہ محفوظ تجوری نہیں ہے۔'},
};
