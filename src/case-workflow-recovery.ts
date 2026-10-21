import {validStaffSession,type PageSession} from './session-state.ts';
import {StaffRequestError,staffRequestBinding} from './staff-request.ts';
import {caseWorkflowHash} from './case-workflow-contract.ts';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type PendingRepeat={id:string;dueAt:string};
export type PendingReview={id:string;kind:'deadline'|'disagree';hash:string;legacy:boolean};
export type ReviewContent={kind:'deadline';dueAt:string;expectedDueAt:string|null}|{kind:'disagree';reason:string};
export class CaseRecoveryError extends Error{
  readonly code:'session'|'input'|'conflict'|'storage';constructor(code:'session'|'input'|'conflict'|'storage'){super(code);this.code=code;}
}
const fail=(code:CaseRecoveryError['code'])=>{throw new CaseRecoveryError(code);};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function key(session:PageSession,caseId:string,kind:'repeat'|'review'|'review-action'){
  if(!validStaffSession(session)||!/^[A-Za-z0-9_-]{1,100}$/.test(caseId))return fail('session');return `understood:case-${kind}:${session.clientContext}:${caseId}`;
}
function get(storage:Store,name:string){try{return storage.getItem(name);}catch{return fail('storage');}}
function put(storage:Store,name:string,value:unknown){const raw=JSON.stringify(value);try{storage.setItem(name,raw);if(storage.getItem(name)!==raw)return fail('storage');}catch{return fail('storage');}}
function remove(storage:Store,name:string){try{storage.removeItem(name);if(storage.getItem(name)!==null)return fail('storage');}catch{return fail('storage');}}
function parse(raw:string){try{if(raw.length>200)return fail('storage');const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return fail('storage');return value;}catch{return fail('storage');}}
export function readCaseRepeat(storage:Store,session:PageSession,caseId:string):PendingRepeat|null{
  const raw=get(storage,key(session,caseId,'repeat'));if(raw===null)return null;const value=parse(raw);
  if(Object.keys(value).sort().join(',')!=='dueAt,id'||!uuid(value.id)||!date(value.dueAt))return fail('storage');return value;
}
export function retainCaseRepeat(storage:Store,session:PageSession,caseId:string,dueAt:string,current:()=>boolean,now=Date.now()){
  const name=key(session,caseId,'repeat');if(!current())return fail('session');if(!date(dueAt))return fail('input');
  const old=readCaseRepeat(storage,session,caseId);if(old&&old.dueAt!==dueAt)return fail('conflict');
  if(!old&&(Date.parse(dueAt)<=now||Date.parse(dueAt)>now+30*86400000))return fail('input');
  const value=old||{id:crypto.randomUUID(),dueAt};if(!current())return fail('session');put(storage,name,value);return value;
}
export function clearCaseRepeat(storage:Store,session:PageSession,caseId:string,pending:PendingRepeat){
  const old=readCaseRepeat(storage,session,caseId);if(!old||old.id!==pending.id||old.dueAt!==pending.dueAt)return fail('conflict');remove(storage,key(session,caseId,'repeat'));
}
export function canonicalCaseReview(value:ReviewContent):ReviewContent{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('input');
  if(value.kind==='deadline'&&Object.keys(value).sort().join(',')==='dueAt,expectedDueAt,kind'&&date(value.dueAt)&&(value.expectedDueAt===null||date(value.expectedDueAt)))return {kind:'deadline',dueAt:value.dueAt,expectedDueAt:value.expectedDueAt};
  if(value.kind==='disagree'&&Object.keys(value).sort().join(',')==='kind,reason'&&typeof value.reason==='string'&&value.reason.trim().length>=5&&value.reason.length<=1000)return {kind:'disagree',reason:value.reason.trim()};return fail('input');
}
export function readCaseReview(storage:Store,session:PageSession,caseId:string):PendingReview|null{
  const current=get(storage,key(session,caseId,'review-action')),legacy=get(storage,key(session,caseId,'review'));
  if(current!==null&&legacy!==null)return fail('storage');const raw=current??legacy;if(raw===null)return null;const value=parse(raw);
  if(Object.keys(value).sort().join(',')!=='hash,id,kind'||!uuid(value.id)||!digest(value.hash)||!['deadline','disagree'].includes(value.kind))return fail('storage');
  return {...value,legacy:current===null};
}
export async function caseReviewRecoveryHash(content:ReviewContent,legacy=false){
  const value=canonicalCaseReview(content);return caseWorkflowHash(legacy&&value.kind==='disagree'?value.reason:JSON.stringify(value));
}
export async function retainCaseReview(storage:Store,session:PageSession,caseId:string,content:ReviewContent,current:()=>boolean){
  const expected=staffRequestBinding(session),assertCurrent=()=>{if(!current()||!validStaffSession(session)||staffRequestBinding(session)!==expected)return fail('session');};
  assertCurrent();const canonical=canonicalCaseReview(content),old=readCaseReview(storage,session,caseId);
  if(!old&&canonical.kind==='deadline'&&(Date.parse(canonical.dueAt)<=Date.now()||Date.parse(canonical.dueAt)>Date.now()+30*86400000))return fail('input');
  const hash=await caseReviewRecoveryHash(canonical,old?.legacy);assertCurrent();
  // A different tab may have retained a command while hashing; never overwrite it.
  const latest=readCaseReview(storage,session,caseId);if(JSON.stringify(latest)!==JSON.stringify(old)||old&&(old.kind!==canonical.kind||old.hash!==hash))return fail('conflict');
  const value=old||{id:crypto.randomUUID(),kind:canonical.kind,hash,legacy:false};assertCurrent();
  put(storage,key(session,caseId,value.legacy?'review':'review-action'),{id:value.id,kind:value.kind,hash:value.hash});return value;
}
export function clearCaseReview(storage:Store,session:PageSession,caseId:string,pending:PendingReview){
  const old=readCaseReview(storage,session,caseId);if(!old||old.id!==pending.id||old.kind!==pending.kind||old.hash!==pending.hash||old.legacy!==pending.legacy)return fail('conflict');remove(storage,key(session,caseId,old.legacy?'review':'review-action'));
}
export function mayReleaseFreshCaseRejection(fresh:boolean,error:unknown){
  // A known first-attempt rejection cannot erase recovery from an earlier uncertain attempt.
  return fresh&&error instanceof StaffRequestError&&!error.fenced&&!error.uncertain&&error.status!==null&&[400,403,404,409,413,422].includes(error.status);
}
