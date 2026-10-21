import {validStaffSession,type PageSession} from './session-state.ts';
import {staffRequestBinding} from './staff-request.ts';

export type CreationContent={assignmentId:string;publicationId:string;version:number;attemptId:string|null;reason:string};
export type PendingCreation={id:string;hash:string;selectionHash:string};
export type CreationSubject={assignmentId:string;worker:string;publicationId:string;version:number;title:string|null;language:'en'|'ar'|'ur';createdAt:string};
export type CreationSubjectDetail=CreationSubject&{latestAttempt:{id:string;text:string;outcome:'matched'|'clarification'|'unassessable'|null;complete:boolean;receivedAt:string;existingCaseId:string|null}|null;clientContext:string};
export type CreationSubjects={items:CreationSubject[];total:number;page:number;pageSize:10;search:string;clientContext:string};
export type CreationReceipt={requestId:string;caseId:string;assignmentId:string;publicationId:string;version:number;attemptId:string|null;actorId:string;actorRole:'owner'|'supervisor';requestHash:string;selectionHash:string;createdAt:string;clientContext:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export class CreationError extends Error{readonly code:'invalid'|'session'|'storage'|'conflict';constructor(code:'invalid'|'session'|'storage'|'conflict'){super(code);this.code=code;}}
const fail=(code:CreationError['code']):never=>{throw new CreationError(code);};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const text=(value:unknown,max:number)=>typeof value==='string'&&!!value.trim()&&value.length<=max;
const integer=(value:unknown,min:number,max:number)=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
const nullableId=(value:unknown)=>value===null||id(value);
export function canonicalCreation(value:CreationContent):CreationContent{
  if(!exact(value,['assignmentId','publicationId','version','attemptId','reason'])||!id(value.assignmentId)||!id(value.publicationId)||!integer(value.version,1,Number.MAX_SAFE_INTEGER)
    ||!nullableId(value.attemptId)||typeof value.reason!=='string'||value.reason.trim().length<5||value.reason.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.reason))return fail('invalid');
  return {assignmentId:value.assignmentId,publicationId:value.publicationId,version:value.version as number,attemptId:value.attemptId as string|null,reason:value.reason.trim()};
}
const selection=(value:Pick<CreationContent,'assignmentId'|'publicationId'|'version'|'attemptId'>)=>({assignmentId:value.assignmentId,publicationId:value.publicationId,version:value.version,attemptId:value.attemptId});
async function hash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
export const creationHash=(value:CreationContent)=>hash(canonicalCreation(value));
const key=(session:PageSession)=>{if(!validStaffSession(session)||!['owner','supervisor'].includes(session.staffRole||''))return fail('session');return `understood:clarification-create:${session.clientContext}`;};
function stored(storage:Store,session:PageSession){
  const name=key(session);let raw:string|null;try{raw=storage.getItem(name);}catch{return fail('storage');}if(raw===null)return {raw,value:null};
  let value;try{value=JSON.parse(raw);}catch{return fail('storage');}
  if(raw.length>300||!exact(value,['id','hash','selectionHash'])||!uuid(value.id)||!digest(value.hash)||!digest(value.selectionHash))return fail('storage');
  return {raw,value:value as PendingCreation};
}
export const readCreation=(storage:Store,session:PageSession)=>stored(storage,session).value;
export async function retainCreation(storage:Store,session:PageSession,value:CreationContent,current:()=>boolean){
  const binding=staffRequestBinding(session),name=key(session),assertCurrent=()=>{if(!current()||!validStaffSession(session)||staffRequestBinding(session)!==binding)return fail('session');};
  assertCurrent();const before=stored(storage,session),content=canonicalCreation(value);
  const [intentHash,selectionHash]=await Promise.all([hash(content),hash(selection(content))]);assertCurrent();
  if(stored(storage,session).raw!==before.raw)return fail('conflict');
  if(before.value&&(before.value.hash!==intentHash||before.value.selectionHash!==selectionHash))return fail('conflict');
  const pending=before.value||{id:crypto.randomUUID(),hash:intentHash,selectionHash},raw=JSON.stringify(pending);assertCurrent();
  try{storage.setItem(name,raw);if(storage.getItem(name)!==raw)return fail('storage');}catch{return fail('storage');}return pending;
}
export function clearCreation(storage:Store,session:PageSession,pending:PendingCreation){
  const value=readCreation(storage,session);if(!value||value.id!==pending.id||value.hash!==pending.hash||value.selectionHash!==pending.selectionHash)return fail('conflict');
  try{const name=key(session);storage.removeItem(name);if(storage.getItem(name)!==null)return fail('storage');}catch{return fail('storage');}
}
function context(value:Record<string,unknown>,expected:string){if(!digest(expected))return fail('invalid');if(value.clientContext!==expected)return fail('session');}
const subjectKeys=['assignmentId','worker','publicationId','version','title','language','createdAt'];
function subject(value:Record<string,unknown>){return id(value.assignmentId)&&id(value.publicationId)&&text(value.worker,200)&&integer(value.version,1,Number.MAX_SAFE_INTEGER)
  &&(value.title===null||text(value.title,120))&&['en','ar','ur'].includes(value.language as string)&&date(value.createdAt);}
export function checkedCreationSubjects(value:unknown,page:number,search:string,expected:string):CreationSubjects{
  if(!exact(value,['items','total','page','pageSize','search','clientContext']))return fail('invalid');context(value,expected);
  if(!integer(page,1,5000)||value.page!==page||value.pageSize!==10||value.search!==search.trim()||!integer(value.total,0,5000)||!Array.isArray(value.items)
    ||value.items.length!==Math.min(10,Math.max(0,Number(value.total)-(page-1)*10)))return fail('invalid');
  const ids=new Set<string>();for(const row of value.items){if(!exact(row,subjectKeys)||!subject(row)||ids.has(row.assignmentId as string))return fail('invalid');ids.add(row.assignmentId as string);}
  return value as unknown as CreationSubjects;
}
export function checkedCreationSubject(value:unknown,assignmentId:string,expected:string):CreationSubjectDetail{
  if(!id(assignmentId)||!exact(value,[...subjectKeys,'latestAttempt','clientContext']))return fail('invalid');context(value,expected);
  if(!subject(value)||value.assignmentId!==assignmentId)return fail('invalid');const attempt=value.latestAttempt;
  if(attempt!==null&&(!exact(attempt,['id','text','outcome','complete','receivedAt','existingCaseId'])||!id(attempt.id)||!text(attempt.text,20000)
    ||![null,'matched','clarification','unassessable'].includes(attempt.outcome as string|null)||typeof attempt.complete!=='boolean'
    ||attempt.complete!==(attempt.outcome!==null)||!date(attempt.receivedAt)||!nullableId(attempt.existingCaseId)||!attempt.complete&&attempt.existingCaseId!==null))return fail('invalid');
  return value as unknown as CreationSubjectDetail;
}
export async function checkedCreationReceipt(value:unknown,pending:PendingCreation,session:PageSession):Promise<CreationReceipt>{
  if(!validStaffSession(session)||!exact(value,['requestId','caseId','assignmentId','publicationId','version','attemptId','actorId','actorRole','requestHash','selectionHash','createdAt','clientContext']))return fail('invalid');context(value,session.clientContext!);
  const actor=JSON.parse(session.staffScope!)[2];
  if(!uuid(value.requestId)||value.requestId!==pending.id||value.caseId!==pending.id||!id(value.assignmentId)||!id(value.publicationId)||!integer(value.version,1,Number.MAX_SAFE_INTEGER)||!nullableId(value.attemptId)
    ||value.actorId!==actor||value.actorRole!==session.staffRole||!['owner','supervisor'].includes(value.actorRole as string)||!date(value.createdAt)
    ||value.requestHash!==pending.hash||value.selectionHash!==pending.selectionHash)return fail('invalid');
  const row=value as unknown as CreationReceipt;if(await hash(selection(row))!==pending.selectionHash)return fail('invalid');return row;
}
