import {completeStaffRequest} from './staff-request.ts';

export type RetentionCategory='response'|'case'|'generated'|'activity'|'briefing';
export function policyReceiptPath(policy:{endpoint:string;receiptEndpoint?:string},requestId:string){
  return `${policy.receiptEndpoint || `${policy.endpoint}/requests`}/${encodeURIComponent(requestId)}`;
}
export function policyRecoveryScope(value:unknown,staffScope:string|null|undefined,canWrite:boolean,category:RetentionCategory='response') {
  const expected=staffScope && category!=='response'?`${category}:${staffScope}`:staffScope;
  // Supervisors have read-only policy access without a recovery ledger scope.
  if(value===null && !canWrite)return null;
  if(!expected || value!==expected)throw Error('Policy recovery scope cannot be verified.');
  return expected;
}
export async function completePolicySave<C extends {requestId:string;revision:number}>(value:unknown,change:C,
  acknowledgement:(value:unknown,change:C)=>void,receipt:(value:unknown,change:C)=>void,
  readReceipt:()=>Promise<unknown>,complete:()=>void,current:()=>boolean,canComplete:()=>boolean=current) {
  return completeStaffRequest(value,async row=>{
    acknowledgement(row,change);receipt(await readReceipt(),change);
  },complete,current,canComplete);
}
export async function completePolicyRejection<C>(change:C,receipt:(value:unknown,change:C)=>void,
  readReceipt:()=>Promise<unknown>,complete:(accepted:boolean)=>void,current:()=>boolean,canComplete:()=>boolean=current) {
  return completeStaffRequest(null,async()=>{
    const row=await readReceipt();if(row!==null)receipt(row,change);return row!==null;
  },complete,current,canComplete);
}
export function verifyPolicyAcknowledgement(value:unknown,change:{requestId:string;revision:number},notice=false) {
  const row=value as {requestId?:string;revision?:number;duplicate?:boolean};
  if(!row || typeof row!=='object' || Array.isArray(row)
    || Object.keys(row).sort().join(',')!==(notice?'duplicate,requestId,revision':'duplicate,revision')
    || row.revision!==change.revision+1 || typeof row.duplicate!=='boolean' || notice && row.requestId!==change.requestId)
    throw Error('Policy save acknowledgement cannot be verified.');
}
