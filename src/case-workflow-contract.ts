export type RepeatRow={id:string;caseId:string;status:'pending'|'submitted'|'cancelled'|'expired';dueAt:string;createdAt:string;submittedAt:string|null};
export type ReviewRow={id:string;caseId:string;kind:'deadline'|'disagree';createdAt:string;dueAt:string|null;expectedDueAt:string|null;reason:string|null;attemptId:string|null;actorId:string;requestHash:string};
export type WorkflowBlocked='read_only'|'workspace_archived'|'worker_unavailable'|'content_expired'|null;
export type RepeatPage={caseId:string;caseStatus:'open'|'resolved';items:RepeatRow[];total:number;page:number;pageSize:number;canRequest:boolean;blockedReason:WorkflowBlocked|'case_resolved'|'publication_unavailable'|'no_answer'|'active_repeat';clientContext:string};
export type ReviewPage={caseId:string;caseStatus:'open'|'resolved';items:ReviewRow[];total:number;page:number;pageSize:number;effectiveDueAt:string|null;hasAssessment:boolean;canChangeDeadline:boolean;canDisagree:boolean;blockedReason:WorkflowBlocked;clientContext:string};
export class CaseWorkflowError extends Error{
  readonly code:'invalid'|'session'|'retired';constructor(code:'invalid'|'session'|'retired'){super(code);this.code=code;}
}
const bad=()=>{throw new CaseWorkflowError('invalid');};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const nullable=(value:unknown,check:(value:unknown)=>boolean)=>value===null||check(value);
const integer=(value:unknown,min:number,max:number)=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
function scoped(value:Record<string,unknown>,caseId:string,context:string){
  if(!id(caseId)||value.caseId!==caseId||!digest(context))return bad();
  if(value.clientContext!==context)throw new CaseWorkflowError('session');
}
const repeatKeys=['id','caseId','status','dueAt','createdAt','submittedAt'];
const reviewKeys=['id','caseId','kind','createdAt','dueAt','expectedDueAt','reason','attemptId','actorId','requestHash'];
function repeat(value:Record<string,unknown>,caseId:string){
  return uuid(value.id)&&value.caseId===caseId&&['pending','submitted','cancelled','expired'].includes(value.status as string)&&date(value.dueAt)&&date(value.createdAt)&&value.dueAt>value.createdAt
    &&(value.status==='submitted'?date(value.submittedAt)&&value.submittedAt>=value.createdAt&&value.submittedAt<value.dueAt:value.submittedAt===null);
}
function review(value:Record<string,unknown>,caseId:string){
  return uuid(value.id)&&value.caseId===caseId&&id(value.actorId)&&digest(value.requestHash)&&date(value.createdAt)
    &&(value.kind==='deadline'?date(value.dueAt)&&nullable(value.expectedDueAt,date)&&value.reason===null&&value.attemptId===null
      :value.kind==='disagree'&&value.dueAt===null&&value.expectedDueAt===null&&id(value.attemptId)&&typeof value.reason==='string'&&value.reason.trim().length>=5&&value.reason.length<=1000);
}
function pageBase(value:Record<string,unknown>,page:number,pageSize:number){
  return integer(page,1,5000)&&[5,10,20].includes(pageSize)&&value.page===page&&value.pageSize===pageSize&&integer(value.total,0,25000)
    &&['open','resolved'].includes(value.caseStatus as string)&&Array.isArray(value.items)&&value.items.length===Math.min(pageSize,Math.max(0,Number(value.total)-(page-1)*pageSize));
}
const commonBlocked=['read_only','workspace_archived','worker_unavailable','content_expired',null];
export function checkedRepeatPage(value:unknown,caseId:string,page:number,pageSize:number,context:string):RepeatPage{
  if(!exact(value,['caseId','caseStatus','items','total','page','pageSize','canRequest','blockedReason','clientContext']))return bad();scoped(value,caseId,context);
  if(!pageBase(value,page,pageSize)||typeof value.canRequest!=='boolean'||![...commonBlocked,'case_resolved','publication_unavailable','no_answer','active_repeat'].includes(value.blockedReason as string|null)
    ||value.canRequest!==(value.blockedReason===null)||value.canRequest&&value.caseStatus!=='open')return bad();
  const ids=new Set<string>();let previous='9999';for(const row of value.items as unknown[]){if(!exact(row,repeatKeys)||!repeat(row,caseId)||ids.has(row.id as string)||(row.createdAt as string)>previous)return bad();ids.add(row.id as string);previous=row.createdAt as string;}
  return value as unknown as RepeatPage;
}
export function checkedReviewPage(value:unknown,caseId:string,page:number,pageSize:number,context:string):ReviewPage{
  if(!exact(value,['caseId','caseStatus','items','total','page','pageSize','effectiveDueAt','hasAssessment','canChangeDeadline','canDisagree','blockedReason','clientContext']))return bad();scoped(value,caseId,context);
  if(!pageBase(value,page,pageSize)||!nullable(value.effectiveDueAt,date)||!['hasAssessment','canChangeDeadline','canDisagree'].every(key=>typeof value[key]==='boolean')||!commonBlocked.includes(value.blockedReason as string|null)
    ||value.canChangeDeadline!==(value.blockedReason===null&&value.caseStatus==='open')||value.canDisagree!==(value.blockedReason===null&&value.hasAssessment===true))return bad();
  const ids=new Set<string>();for(const row of value.items as unknown[]){if(!exact(row,reviewKeys)||!review(row,caseId)||ids.has(row.id as string))return bad();ids.add(row.id as string);}
  return value as unknown as ReviewPage;
}
export function checkedRepeatReceipt(value:unknown,caseId:string,pending:{id:string;dueAt:string},context:string):RepeatRow&{clientContext:string}{
  if(!exact(value,[...repeatKeys,'clientContext']))return bad();scoped(value,caseId,context);
  if(!repeat(value,caseId)||value.id!==pending.id||value.dueAt!==pending.dueAt)return bad();return value as unknown as RepeatRow&{clientContext:string};
}
export async function caseWorkflowHash(value:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function checkedReviewReceipt(value:unknown,caseId:string,pending:{id:string;kind:string;hash:string;legacy:boolean},context:string):Promise<ReviewRow&{clientContext:string}>{
  if(!exact(value,[...reviewKeys,'clientContext']))return bad();scoped(value,caseId,context);
  if(!review(value,caseId)||value.id!==pending.id||value.kind!==pending.kind||!digest(pending.hash)||(!pending.legacy||pending.kind==='deadline')&&value.requestHash!==pending.hash)return bad();
  const row=value as unknown as ReviewRow&{clientContext:string},canonical=row.kind==='deadline'?{kind:'deadline',dueAt:row.dueAt,expectedDueAt:row.expectedDueAt}:{kind:'disagree',reason:row.reason};
  const calculated=await caseWorkflowHash(JSON.stringify(canonical)),retired=row.kind==='disagree'&&['[Deleted]','[Expired]'].includes(row.reason!)&&calculated!==row.requestHash;
  if(calculated!==row.requestHash&&!retired)return bad();
  if(pending.legacy&&pending.kind==='disagree'&&await caseWorkflowHash(row.reason!)!==pending.hash){if(retired)throw new CaseWorkflowError('retired');return bad();}
  return row;
}
