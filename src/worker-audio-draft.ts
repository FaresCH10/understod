import {validWorkerSession,sameWorkerSession,type PageSession} from './session-state.ts';
import type {RecordingScope} from './worker-audio-retry.ts';
import {privateDeviceAllowed} from './worker-device-policy.ts';

export const audioDraftCopy={
  en:{title:'Saved recording',consent:'Save only on a device I control',privacy:'One optional recording is encrypted in this browser for this session and exact briefing, for at most 24 hours. The key is held here too; this is not a secure vault. Do not save on a shared device. Browser cleanup or expiry can remove it. Nothing uploads automatically.',loading:'Checking saved recording...',empty:'No recording saved here.',saved:'Saved here. Server receipt and AI assessment are separate.',other:'A recording for another briefing version is saved here. It cannot be sent to this one.',failed:'Saved recording could not be verified or updated. No delivery is confirmed.',removed:'Saved recording removed.',received:'Recording receipt verified. The saved copy remains until removed or expired.',send:'Send saved recording',check:'Check recording receipt',remove:'Remove saved recording',reload:'Recheck saved recording'},
  ar:{title:'التسجيل المحفوظ',consent:'أحفظ فقط على جهاز أتحكم فيه',privacy:'يُشفّر تسجيل اختياري واحد في هذا المتصفح لهذه الجلسة وإصدار التعليمات نفسه لمدة لا تتجاوز 24 ساعة. المفتاح محفوظ هنا أيضًا؛ هذه ليست خزنة آمنة. لا تحفظ على جهاز مشترك. قد يحذفه تنظيف المتصفح أو انتهاء الصلاحية. لا يُرفع شيء تلقائيًا.',loading:'جارٍ فحص التسجيل المحفوظ...',empty:'لا يوجد تسجيل محفوظ هنا.',saved:'محفوظ هنا. استلام الخادم وتقييم الذكاء الاصطناعي أمران منفصلان.',other:'يوجد تسجيل محفوظ لإصدار تعليمات آخر. لا يمكن إرساله إلى هذا الإصدار.',failed:'تعذر التحقق من التسجيل المحفوظ أو تحديثه. لم يتم تأكيد الإرسال.',removed:'حُذف التسجيل المحفوظ.',received:'تم التحقق من استلام التسجيل. تبقى النسخة المحفوظة حتى حذفها أو انتهاء صلاحيتها.',send:'أرسل التسجيل المحفوظ',check:'تحقق من استلام التسجيل',remove:'احذف التسجيل المحفوظ',reload:'أعد فحص التسجيل المحفوظ'},
  ur:{title:'محفوظ ریکارڈنگ',consent:'صرف اپنے اختیار والے آلے پر محفوظ کروں',privacy:'اس براؤزر میں اسی سیشن اور ہدایات کے عین ورژن کی ایک اختیاری ریکارڈنگ زیادہ سے زیادہ 24 گھنٹے رمز بند رہتی ہے۔ کلید بھی یہیں ہے؛ یہ محفوظ تجوری نہیں۔ مشترکہ آلے پر محفوظ نہ کریں۔ براؤزر کی صفائی یا میعاد اسے ہٹا سکتی ہے۔ کچھ خود بخود اپ لوڈ نہیں ہوتا۔',loading:'محفوظ ریکارڈنگ چیک ہو رہی ہے...',empty:'یہاں کوئی ریکارڈنگ محفوظ نہیں۔',saved:'یہیں محفوظ ہے۔ سرور کی وصولی اور مصنوعی ذہانت کی جانچ الگ ہیں۔',other:'ہدایات کے دوسرے ورژن کی ریکارڈنگ یہاں محفوظ ہے۔ اسے اس ورژن پر نہیں بھیجا جا سکتا۔',failed:'محفوظ ریکارڈنگ کی تصدیق یا تبدیلی نہیں ہو سکی۔ بھیجنے کی تصدیق نہیں ہوئی۔',removed:'محفوظ ریکارڈنگ ہٹا دی گئی۔',received:'ریکارڈنگ کی وصولی کی تصدیق ہو گئی۔ محفوظ نقل ہٹانے یا میعاد ختم ہونے تک باقی رہے گی۔',send:'محفوظ ریکارڈنگ بھیجیں',check:'ریکارڈنگ کی وصولی چیک کریں',remove:'محفوظ ریکارڈنگ ہٹائیں',reload:'محفوظ ریکارڈنگ دوبارہ چیک کریں'},
};

type Envelope={revision:string;context:string;key:CryptoKey;iv:Uint8Array;ciphertext:ArrayBuffer};
export type AudioDraft={scope:RecordingScope;submissionId:string;capturedAt:string;expiresAt:string;bytes:Uint8Array};
export type AudioDraftStore={read:()=>Promise<Envelope|null>;replace:(revision:string|null,value:Envelope|null,allowed:()=>boolean)=>Promise<boolean>;clear:()=>Promise<void>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class AudioDraftError extends Error {
  readonly code:'storage'|'invalid'|'session'|'other';
  constructor(code:AudioDraftError['code']){super(code);this.code=code;}
}
const draftChannel='understood:worker-audio-change';
export function subscribeAudioDraftChanges(changed:()=>void){
  try {
    const channel=new BroadcastChannel(draftChannel);
    channel.onmessage=event=>{if(event.data==='changed')changed();};
    return()=>channel.close();
  }catch {return()=>{};}
}
function notifyDraftChanged(){
  try {const channel=new BroadcastChannel(draftChannel);channel.postMessage('changed');channel.close();}catch {/* Explicit recheck and session fences still apply. */}
}
const exact=(value:unknown,keys:string)=>!!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===keys;
const iso=(value:unknown):value is string=>typeof value==='string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
function scopeValid(scope:RecordingScope){
  return exact(scope,'assignmentId,language,publicationId,version') && [scope.assignmentId,scope.publicationId].every(value=>typeof value==='string' && value.trim().length>0 && value.length<=100)
    && Number.isSafeInteger(scope.version) && scope.version>0 && ['en','ar','ur'].includes(scope.language);
}
const sameScope=(a:RecordingScope,b:RecordingScope)=>a.assignmentId===b.assignmentId && a.publicationId===b.publicationId && a.version===b.version && a.language===b.language;
function wavValid(bytes:Uint8Array){
  if(bytes.length<8044 || bytes.length>2880044 || bytes.length%2)return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=new TextDecoder('utf-8',{fatal:true});
  if(text.decode(bytes.slice(0,4))!=='RIFF' || text.decode(bytes.slice(8,16))!=='WAVEfmt ' || text.decode(bytes.slice(36,40))!=='data'
    || view.getUint32(4,true)!==bytes.length-8 || view.getUint32(16,true)!==16 || view.getUint16(20,true)!==1 || view.getUint16(22,true)!==1
    || view.getUint32(24,true)!==16000 || view.getUint32(28,true)!==32000 || view.getUint16(32,true)!==2 || view.getUint16(34,true)!==16 || view.getUint32(40,true)!==bytes.length-44)return false;
  for(let i=44;i<bytes.length;i+=2)if(Math.abs(view.getInt16(i,true))>16)return true;
  return false;
}
function checkedEnvelope(value:Envelope){
  if(!exact(value,'ciphertext,context,iv,key,revision') || !uuid.test(value.revision) || !/^[a-f0-9]{64}$/.test(value.context)
    || !(value.key instanceof CryptoKey) || value.key.extractable || value.key.type!=='secret' || value.key.algorithm.name!=='AES-GCM'
    || (value.key.algorithm as AesKeyAlgorithm).length!==256 || value.key.usages.slice().sort().join(',')!=='decrypt,encrypt'
    || !(value.iv instanceof Uint8Array) || value.iv.length!==12 || !(value.ciphertext instanceof ArrayBuffer)
    || value.ciphertext.byteLength<8064 || value.ciphertext.byteLength>2884144)throw new AudioDraftError('invalid');
  return value;
}
const aad=(value:Envelope)=>new TextEncoder().encode(JSON.stringify(['understood-audio-draft-v1',value.revision,value.context]));
function guardFor(session:PageSession,current:()=>boolean,now:()=>number){
  const expected={...session};
  return()=>{if(!current() || !sameWorkerSession(expected,session,now()) || expected.expiresAt!==session.expiresAt)throw new AudioDraftError('session');return true;};
}
async function unpack(value:Envelope){
  try {
    checkedEnvelope(value);
    const raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:aad(value)},value.key,value.ciphertext));
    const length=new DataView(raw.buffer).getUint32(0,true);
    if(length>4096 || length<1 || raw.length<4+length+8044)throw Error();
    const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.slice(4,4+length)));
    if(!exact(metadata,'capturedAt,expiresAt,scope,session,submissionId') || !scopeValid(metadata.scope)
      || !uuid.test(metadata.submissionId) || !iso(metadata.capturedAt) || !iso(metadata.expiresAt)
      || !exact(metadata.session,'authenticated,clientContext,expiresAt,language,mode,role,workerId') || !validWorkerSession(metadata.session,0)
      || metadata.session.clientContext!==value.context || Date.parse(metadata.expiresAt)>Date.parse(metadata.session.expiresAt)
      || Date.parse(metadata.expiresAt)<=Date.parse(metadata.capturedAt) || Date.parse(metadata.expiresAt)-Date.parse(metadata.capturedAt)>86400000)throw Error();
    const bytes=raw.slice(4+length);if(!wavValid(bytes))throw Error();
    return {...metadata,bytes} as AudioDraft & {session:PageSession};
  }catch {throw new AudioDraftError('invalid');}
}
async function owned(store:AudioDraftStore,session:PageSession,guard:()=>boolean,now:()=>number){
  guard();const envelope=await store.read();guard();if(!envelope)return null;
  checkedEnvelope(envelope);
  if(envelope.context!==session.clientContext){if(!await store.replace(envelope.revision,null,guard))throw new AudioDraftError('storage');guard();return null;}
  const draft=await unpack(envelope);guard();
  if(!sameWorkerSession(session,draft.session,now()) || session.expiresAt!==draft.session.expiresAt || Date.parse(draft.expiresAt)<=now()){
    if(!await store.replace(envelope.revision,null,guard))throw new AudioDraftError('storage');guard();return null;
  }
  if(Date.parse(draft.capturedAt)>now())throw new AudioDraftError('invalid');
  return {envelope,draft};
}
export async function readAudioDraft(store:AudioDraftStore,session:PageSession,scope:RecordingScope,current:()=>boolean=()=>true,now=Date.now){
  try {
    if(!scopeValid(scope))throw new AudioDraftError('invalid');
    const value=await owned(store,session,guardFor(session,current,now),now);
    if(!value)return {status:'empty' as const};
    if(!sameScope(scope,value.draft.scope))return {status:'other' as const};
    const {session:_,...draft}=value.draft;return {status:'saved' as const,draft};
  }catch(error){if(error instanceof AudioDraftError)throw error;throw new AudioDraftError('storage');}
}
export async function saveAudioDraft(store:AudioDraftStore,session:PageSession,scope:RecordingScope,input:{submissionId:string;capturedAt:string;bytes:Uint8Array},consent:boolean,current:()=>boolean=()=>true,now=Date.now){
  const guard=guardFor(session,current,now);
  try {
    guard();
    if(consent!==true || !scopeValid(scope) || !uuid.test(input.submissionId) || !iso(input.capturedAt)
      || Date.parse(input.capturedAt)>now() || !(input.bytes instanceof Uint8Array) || !wavValid(input.bytes))throw new AudioDraftError('invalid');
    const bytes=new Uint8Array(input.bytes),captured={...scope},expected={authenticated:true,role:'worker',workerId:session.workerId!,language:session.language!,mode:session.mode!,clientContext:session.clientContext!,expiresAt:session.expiresAt!};
    const {submissionId,capturedAt}=input;
    const old=await owned(store,session,guard,now);
    if(old){
      if(!sameScope(captured,old.draft.scope) || old.draft.submissionId!==submissionId)throw new AudioDraftError('other');
      if(old.draft.capturedAt!==capturedAt || old.draft.bytes.length!==bytes.length || !bytes.every((value,index)=>value===old.draft.bytes[index]))throw new AudioDraftError('invalid');
      return old.draft;
    }
    const expiresAt=new Date(Math.min(Date.parse(expected.expiresAt),Date.parse(capturedAt)+86400000)).toISOString();
    if(Date.parse(expiresAt)<=now())throw new AudioDraftError('session');
    const metadata=new TextEncoder().encode(JSON.stringify({session:expected,scope:captured,submissionId,capturedAt,expiresAt}));
    if(metadata.length>4096)throw new AudioDraftError('invalid');
    const packet=new Uint8Array(4+metadata.length+bytes.length);new DataView(packet.buffer).setUint32(0,metadata.length,true);packet.set(metadata,4);packet.set(bytes,4+metadata.length);
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);guard();
    const envelope:Envelope={revision:crypto.randomUUID(),context:expected.clientContext,key,iv:crypto.getRandomValues(new Uint8Array(12)),ciphertext:new ArrayBuffer(0)};
    envelope.ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(envelope.iv),additionalData:aad(envelope)},key,packet);guard();
    if(!await store.replace(null,envelope,guard))throw new AudioDraftError('other');
    guard();const stored=await store.read();guard();
    if(!stored || stored.revision!==envelope.revision)throw new AudioDraftError('storage');
    const verified=await unpack(stored);guard();
    if(verified.submissionId!==submissionId || !sameScope(captured,verified.scope) || verified.bytes.length!==bytes.length || !bytes.every((value,index)=>value===verified.bytes[index]))throw new AudioDraftError('storage');
    return verified;
  }catch(error){if(error instanceof AudioDraftError)throw error;throw new AudioDraftError('storage');}
}
export async function clearAudioDraft(store:AudioDraftStore=browserAudioDraftStore,context?:string){
  if(store===browserAudioDraftStore){await clearAudioOutbox(context);return;}
  try {
    if(context){
      const old=await store.read();if(!old || old.context!==context)return;
      if(!uuid.test(old.revision) || !await store.replace(old.revision,null,()=>true))throw Error();
      if((await store.read())?.context===context)throw Error();
    }else {await store.clear();if(await store.read())throw Error();}
  }catch {throw new AudioDraftError('storage');}
}

function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,set:(value:T)=>void)=>void):Promise<T>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new AudioDraftError('storage'));return;}
    let settled=false,db:IDBDatabase|undefined,tx:IDBTransaction|undefined,result:T;
    const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);try {tx?.abort();}catch {}db?.close();reject(new AudioDraftError('storage'));};
    const timer=setTimeout(fail,5000);let request:IDBOpenDBRequest;
    try {request=indexedDB.open('understood-worker-audio-v1',1);}catch {fail();return;}
    request.onerror=fail;request.onblocked=fail;
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};
    request.onsuccess=()=>{
      db=request.result;if(settled){db.close();return;}db.onversionchange=()=>db?.close();
      try {
        tx=db.transaction('drafts',mode);tx.onerror=fail;tx.onabort=fail;
        tx.oncomplete=()=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();resolve(result);};
        work(tx.objectStore('drafts'),value=>{result=value;});
      }catch {fail();}
    };
  });
}
export const audioOutboxLimits={recordings:10,bytes:25*1024*1024} as const;
export type AudioOutboxCollection={entries:()=>Promise<{key:string;value:Envelope}[]>;slot:(key:string)=>AudioDraftStore;clear:(context?:string)=>Promise<void>};
export type AudioOutboxItem={key:string;draft:AudioDraft};
export async function audioOutboxKey(id:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
  return `assignment:${Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')}`;
}
function browserSlot(key:string):AudioDraftStore{return {
  read:()=>transaction<Envelope|null>('readonly',(store,set)=>{const request=store.get(key);request.onsuccess=()=>set(request.result ?? null);}),
  replace:(revision,value,allowed)=>transaction<boolean>('readwrite',(store,set)=>{
    const request=store.get(key);request.onsuccess=()=>{
      try {
        if(!allowed() || (request.result?.revision ?? null)!==revision){set(false);return;}
        if(!value){store.delete(key);set(true);return;}
        if(!privateDeviceAllowed(value.context)){set(false);return;}
        const all=store.getAll();all.onsuccess=()=>{
          try {
            const values=all.result as Envelope[],old=request.result as Envelope|undefined;
            const count=values.length+(old?0:1),bytes=values.reduce((total,item)=>total+(item.ciphertext?.byteLength ?? audioOutboxLimits.bytes),0)-(old?.ciphertext.byteLength ?? 0)+value.ciphertext.byteLength;
            if(!allowed() || !privateDeviceAllowed(value.context) || count>audioOutboxLimits.recordings || bytes>audioOutboxLimits.bytes){set(false);return;}
            store.put(value,key);set(true);
          }catch {store.transaction.abort();}
        };
      }
      catch {store.transaction.abort();}
    };
  }).then(changed=>{if(changed)notifyDraftChanged();return changed;}),
  clear:()=>transaction<void>('readwrite',(store,set)=>{store.delete(key);set();}).then(()=>notifyDraftChanged()),
};}
export const browserAudioOutbox:AudioOutboxCollection={
  entries:()=>transaction('readonly',(store,set)=>{
    const items:{key:string;value:Envelope}[]=[],request=store.openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(!cursor){set(items);return;}items.push({key:String(cursor.key),value:cursor.value});cursor.continue();};
  }),
  slot:browserSlot,
  clear:context=>transaction<void>('readwrite',(store,set)=>{
    if(!context){store.clear();set();return;}
    const request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){set();return;}if(cursor.value?.context===context)cursor.delete();cursor.continue();};
  }).then(()=>notifyDraftChanged()),
};
// The legacy slot stays readable; device inventory also exposes it without migrating or overwriting it.
export const browserAudioDraftStore:AudioDraftStore={...browserSlot('pending'),clear:()=>browserAudioOutbox.clear()};
export async function browserAudioDraftFor(scope:RecordingScope){
  if(!scopeValid(scope))throw new AudioDraftError('invalid');
  return browserSlot(await audioOutboxKey(scope.assignmentId));
}
export async function readAudioOutbox(session:PageSession,current:()=>boolean=()=>true,collection:AudioOutboxCollection=browserAudioOutbox,now=Date.now):Promise<AudioOutboxItem[]>{
  const guard=guardFor(session,current,now);
  try {
    guard();const entries=await collection.entries();guard();
    if(entries.length>audioOutboxLimits.recordings)throw new AudioDraftError('invalid');
    const result:AudioOutboxItem[]=[];
    for(const {key} of entries){
      if(key!=='pending' && !key.startsWith('assignment:'))throw new AudioDraftError('invalid');
      const value=await owned(collection.slot(key),session,guard,now);guard();if(!value)continue;
      if(key!=='pending' && key!==await audioOutboxKey(value.draft.scope.assignmentId))throw new AudioDraftError('invalid');
      guard();
      const {session:_,...draft}=value.draft;result.push({key,draft});
    }
    return result.sort((a,b)=>Date.parse(b.draft.capturedAt)-Date.parse(a.draft.capturedAt));
  }catch(error){if(error instanceof AudioDraftError)throw error;throw new AudioDraftError('storage');}
}
export async function clearAudioOutbox(context?:string,collection:AudioOutboxCollection=browserAudioOutbox){
  try {await collection.clear(context);if((await collection.entries()).some(item=>!context || item.value?.context===context))throw Error();}
  catch {throw new AudioDraftError('storage');}
}
