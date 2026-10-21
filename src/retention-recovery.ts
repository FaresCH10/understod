import {retentionInput} from '../server/retention-input.mjs';
export type RetentionChange={requestId:string;revision:number;audioDays:number;confirmed:true};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:retention:${scope}`;
export function readPendingRetention(storage:Storage,scope:string):RetentionChange|null{
  const raw=storage.getItem(key(scope));if(raw===null)return null;
  try{if(raw.length>1000)throw new Error();const value=JSON.parse(raw);retentionInput(value);return value;}
  catch{throw new Error('Pending retention policy cannot be verified.');}
}
export function storePendingRetention(storage:Storage,scope:string,value:RetentionChange){
  retentionInput(value);const old=readPendingRetention(storage,scope);
  if(old&&JSON.stringify(old)!==JSON.stringify(value))throw new Error('Resolve the pending retention policy first.');
  const raw=JSON.stringify(value);storage.setItem(key(scope),raw);
  if(storage.getItem(key(scope))!==raw)throw new Error('Retention recovery storage is unavailable. No request was sent.');
}
export function clearPendingRetention(storage:Storage,scope:string,requestId:string,expected?:RetentionChange){
  const pending=readPendingRetention(storage,scope);
  if(pending?.requestId!==requestId || expected && (!pending || pending.revision!==expected.revision || pending.audioDays!==expected.audioDays || pending.confirmed!==expected.confirmed))throw new Error('Pending retention policy changed.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null)throw new Error('Retention recovery storage could not be cleared.');
}
export function verifyRetentionReceipt(value:unknown,pending:RetentionChange){
  const row=value as {requestId?:string;request?:RetentionChange;revision?:number};
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).sort().join(',')!=='request,requestId,revision'
    || row.requestId!==pending.requestId || row.revision!==pending.revision+1 || !row.request
    || Object.keys(row.request).sort().join(',')!=='audioDays,confirmed,revision'
    || row.request.revision!==pending.revision || row.request.audioDays!==pending.audioDays || row.request.confirmed!==true)throw new Error('Retention receipt cannot be verified.');
}
