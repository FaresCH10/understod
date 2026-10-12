import {publicationInput,schedulePublicationInput,publicationReceiptReference} from '../server/briefing-input.mjs';

export type PendingPublication={briefingId:string;kind:'publish'|'schedule';body:{requestId:string;revision:number;nextVersion:number;workerIds:string[];dueAt:string|null;reminderMinutes?:number;publishAt?:string}};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:publication:${scope}`;
export function publicationSignature(value:PendingPublication) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(name=>!['briefingId','kind','body'].includes(name)) || !value.body || !Number.isSafeInteger(value.body.nextVersion))throw Error('Invalid pending publication');
  publicationReceiptReference(value.briefingId,value.kind,value.body.requestId);
  return JSON.stringify(value.kind==='publish'?publicationInput(value.body):schedulePublicationInput(value.body));
}
export function readPendingPublication(storage:Store,scope:string):PendingPublication|null {
  let raw;try {raw=storage.getItem(key(scope));}catch {throw Error('Publication recovery storage is unavailable.');}
  if(raw===null)return null;
  try {if(raw.length>600000)throw Error();const value=JSON.parse(raw);publicationSignature(value);return value;}
  catch {throw Error('Saved publication request cannot be verified. Check publication and schedule history before making another request.');}
}
export function savePendingPublication(storage:Store,scope:string,value:PendingPublication) {
  const signature=publicationSignature(value),old=readPendingPublication(storage,scope),raw=JSON.stringify(value);
  if(raw.length>600000)throw Error('Publication recovery request exceeds the tab storage limit. No request was sent.');
  if(old && (old.briefingId!==value.briefingId || old.kind!==value.kind || old.body.requestId!==value.body.requestId || publicationSignature(old)!==signature))throw Error('Resolve the saved publication request first.');
  try {storage.setItem(key(scope),raw);if(storage.getItem(key(scope))!==raw)throw Error();}
  catch {throw Error('This tab cannot retain the publication request. No request was sent.');}
}
export function clearPendingPublication(storage:Store,scope:string,value:PendingPublication) {
  const old=readPendingPublication(storage,scope);
  if(!old || old.briefingId!==value.briefingId || old.kind!==value.kind || old.body.requestId!==value.body.requestId || publicationSignature(old)!==publicationSignature(value))throw Error('Saved publication request changed.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null)throw Error('Publication recovery could not be cleared.');
}
export function checkedPublicationResult(value:unknown,pending:PendingPublication) {
  const result=value as Record<string,unknown>|null;
  if(!result || typeof result.id!=='string' || result.id.length>100 || !result.id || result.version!==pending.body.nextVersion
    || (pending.kind==='publish'?result.assigned!==pending.body.workerIds.length:
      result.id!==pending.body.requestId || result.revision!==pending.body.revision || result.recipientCount!==pending.body.workerIds.length
      || result.publishAt!==new Date(pending.body.publishAt!).toISOString() || result.dueAt!==schedulePublicationInput(pending.body).dueAt
      || result.reminderMinutes!==(pending.body.reminderMinutes || 0) || !['queued','cancelled','failed','published'].includes(result.state as string)))throw Error('Publication acknowledgement does not match the saved request.');
  return result;
}
export function checkedPublicationReceipt(value:unknown,pending:PendingPublication) {
  const receipt=value as {accepted?:boolean;requestId?:string;briefingId?:string;kind?:string;request?:Record<string,unknown>;result?:unknown}|null;
  if(!receipt || receipt.requestId!==pending.body.requestId || receipt.briefingId!==pending.briefingId || receipt.kind!==pending.kind || typeof receipt.accepted!=='boolean')throw Error('Publication receipt does not match the saved request.');
  if(!receipt.accepted){if(receipt.request!==undefined || receipt.result!==undefined)throw Error('Publication receipt does not match the saved request.');return null;}
  if(!receipt.request || publicationSignature({...pending,body:{...receipt.request,requestId:pending.body.requestId} as PendingPublication['body']})!==publicationSignature(pending))throw Error('Publication receipt does not match the saved request.');
  return checkedPublicationResult(receipt.result,pending);
}
