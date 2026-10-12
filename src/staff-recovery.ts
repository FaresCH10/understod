import {staffChangeInput,staffReference,staffSignature,staffRoles} from '../server/staff-input.mjs';
export type StaffAction='role'|'revoke'|'restore';
export type PendingStaff={requestId:string;id:string;action:StaffAction;body:{revision:number;role?:string;confirmed:true}};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:staff-access:${scope}`;
export function pendingStaffSignature(value:PendingStaff) {
  if(!value || Object.keys(value).some(k=>!['requestId','id','action','body'].includes(k)) || !value.body || 'requestId' in value.body) throw new Error('Pending staff request is invalid.');
  staffReference(value.id);return staffSignature(value.id,value.action,staffChangeInput(value.action,{...value.body,requestId:value.requestId}));
}
export function readPendingStaff(storage:Storage,scope:string):PendingStaff|null {
  let raw;try {raw=storage.getItem(key(scope));}catch {throw new Error('Staff recovery storage is unavailable.');}
  if(raw===null) return null;
  try {if(raw.length>2000) throw new Error();const value=JSON.parse(raw);pendingStaffSignature(value);return value;}catch {throw new Error('Pending staff request cannot be verified.');}
}
export function savePendingStaff(storage:Storage,scope:string,value:PendingStaff) {
  const signature=pendingStaffSignature(value),old=readPendingStaff(storage,scope),raw=JSON.stringify(value);
  if(old && (old.requestId!==value.requestId || pendingStaffSignature(old)!==signature)) throw new Error('Resolve the pending staff request first.');
  try {storage.setItem(key(scope),raw);if(storage.getItem(key(scope))!==raw) throw new Error();}catch {throw new Error('Staff recovery storage is unavailable. No request was sent.');}
}
export function clearPendingStaff(storage:Storage,scope:string,requestId:string) {
  if(readPendingStaff(storage,scope)?.requestId!==requestId) throw new Error('Pending staff request changed.');
  try {storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null) throw new Error();}catch {throw new Error('Staff recovery storage could not be cleared.');}
}
export function checkedStaffResult(value:unknown,pending:PendingStaff) {
  const row=value as {id:string;revision:number;role:string;active:boolean};
  if(!row || row.id!==pending.id || row.revision!==pending.body.revision+1 || !staffRoles.includes(row.role)
    || (pending.action==='role' && row.role!==pending.body.role) || row.active!==(pending.action!=='revoke')) throw new Error('Staff receipt response cannot be verified.');
  return row;
}
