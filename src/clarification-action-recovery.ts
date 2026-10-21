import {validStaffSession,type PageSession} from './session-state.ts';
import {staffRequestBinding} from './staff-request.ts';
import type {ClarificationActionKind} from './clarification-contract.ts';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type ClarificationActionContent={kind:'resolve';notes:string}|{kind:'assign';ownerId:string|null;expectedOwnerId:string|null};
export type PendingClarificationAction={id:string;hash:string;kind:ClarificationActionKind};
export class ClarificationRecoveryError extends Error {
  readonly code:'session'|'input'|'conflict'|'storage';
  constructor(code:'session'|'input'|'conflict'|'storage'){super(code);this.code=code;}
}
const fail=(code:ClarificationRecoveryError['code'])=>{throw new ClarificationRecoveryError(code);};
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nullableId=(value:unknown)=>value===null||id(value);
const key=(session:PageSession,caseId:string)=>{if(!validStaffSession(session)||!id(caseId))return fail('session');return `understood:case-action:${session.clientContext}:${caseId}`;};
export function canonicalClarificationAction(value:ClarificationActionContent):ClarificationActionContent{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('input');
  if(value.kind==='resolve'&&Object.keys(value).sort().join(',')==='kind,notes'&&typeof value.notes==='string'&&value.notes.trim().length>=5&&value.notes.length<=1000)return {kind:'resolve',notes:value.notes.trim()};
  if(value.kind==='assign'&&Object.keys(value).sort().join(',')==='expectedOwnerId,kind,ownerId'&&nullableId(value.ownerId)&&nullableId(value.expectedOwnerId))
    return {kind:'assign',ownerId:value.ownerId,expectedOwnerId:value.expectedOwnerId};
  return fail('input');
}
export async function clarificationActionHash(content:ClarificationActionContent){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonicalClarificationAction(content))));
  return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
}
export function readClarificationAction(storage:Store,session:PageSession,caseId:string):PendingClarificationAction|null{
  const name=key(session,caseId);let raw:string|null;
  try{raw=storage.getItem(name);}catch{return fail('storage');}if(raw===null)return null;
  let value;try{value=JSON.parse(raw);}catch{return fail('storage');}
  if(raw.length>200||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='hash,id,kind'||!uuid(value.id)||!digest(value.hash)||!['assign','resolve'].includes(value.kind))return fail('storage');
  return value;
}
export async function retainClarificationAction(storage:Store,session:PageSession,caseId:string,content:ClarificationActionContent,current:()=>boolean){
  const expected=staffRequestBinding(session),name=key(session,caseId),assertCurrent=()=>{if(!current()||!validStaffSession(session)||staffRequestBinding(session)!==expected)return fail('session');};
  assertCurrent();const canonical=canonicalClarificationAction(content),hash=await clarificationActionHash(canonical);assertCurrent();
  const old=readClarificationAction(storage,session,caseId);if(old&&(old.hash!==hash||old.kind!==canonical.kind))return fail('conflict');
  const value=old||{id:crypto.randomUUID(),hash,kind:canonical.kind},raw=JSON.stringify(value);assertCurrent();
  try{storage.setItem(name,raw);if(storage.getItem(name)!==raw)return fail('storage');}catch{return fail('storage');}
  return value;
}
export function clearClarificationAction(storage:Store,session:PageSession,caseId:string,pending:PendingClarificationAction){
  const old=readClarificationAction(storage,session,caseId);if(!old||old.id!==pending.id||old.hash!==pending.hash||old.kind!==pending.kind)return fail('conflict');
  try{const name=key(session,caseId);storage.removeItem(name);if(storage.getItem(name)!==null)return fail('storage');}catch(error){if(error instanceof ClarificationRecoveryError)throw error;return fail('storage');}
}
