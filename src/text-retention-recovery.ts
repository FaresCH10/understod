import {textRetentionInput} from '../server/text-retention-input.mjs';
export type TextRetentionChange={requestId:string;revision:number;days:number|null;confirmed:true};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:text-retention:${scope}`;
export function readPendingTextRetention(storage:Storage,scope:string):TextRetentionChange|null {
  const raw=storage.getItem(key(scope));if(raw===null)return null;
  try {if(raw.length>1000)throw Error();const value=JSON.parse(raw);textRetentionInput(value);return value;}
  catch {throw Error('Pending text retention policy cannot be verified.');}
}
export function storePendingTextRetention(storage:Storage,scope:string,value:TextRetentionChange) {
  textRetentionInput(value);const old=readPendingTextRetention(storage,scope);
  if(old && (old.requestId!==value.requestId || old.revision!==value.revision || old.days!==value.days))throw Error('Resolve the pending text retention policy first.');
  const raw=JSON.stringify(value);storage.setItem(key(scope),raw);
  if(storage.getItem(key(scope))!==raw)throw Error('Text retention recovery storage is unavailable. No request was sent.');
}
export function clearPendingTextRetention(storage:Storage,scope:string,requestId:string,expected?:TextRetentionChange) {
  const pending=readPendingTextRetention(storage,scope);
  if(pending?.requestId!==requestId || expected && (!pending || pending.revision!==expected.revision || pending.days!==expected.days || pending.confirmed!==expected.confirmed))throw Error('Pending text retention policy changed.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null)throw Error('Text retention recovery storage could not be cleared.');
}
export function verifyTextRetentionReceipt(value:unknown,pending:TextRetentionChange) {
  const row=value as {requestId?:string;request?:Omit<TextRetentionChange,'requestId'>;revision?:number};
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).sort().join(',')!=='request,requestId,revision'
    || row.requestId!==pending.requestId || row.revision!==pending.revision+1 || !row.request
    || Object.keys(row.request).sort().join(',')!=='confirmed,days,revision' || row.request.revision!==pending.revision
    || row.request.days!==pending.days || row.request.confirmed!==true)throw Error('Text retention receipt cannot be verified.');
}
