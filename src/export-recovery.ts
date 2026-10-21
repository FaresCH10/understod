import {exportInput,exportRetryInput,exportRequestId,reportScope,type ReportFilters} from '../server/report-input.mjs';
export type PendingExport={kind:'create'|'retry';requestId:string;exportId:string|null;body:Record<string,unknown>};
export type ExportRow={id:string;status:string;createdAt:string;expiresAt:string;filename:string;attempts:number;error:string|null;filters:ReportFilters & {timezone?:string}};
export type ExportAccepted={id:string;createdAt?:string;expiresAt?:string;filters?:ReportFilters & {timezone?:string};requestId?:string;attempts?:number;acceptedAt?:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:exports:${scope}`;
const date=(value:unknown)=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
const sameKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join(',')===keys.sort().join(',');
export function pendingExportInput(value:PendingExport) {
  if(!object(value) || !sameKeys(value,['kind','requestId','exportId','body']) || !object(value.body) || 'requestId' in value.body)throw Error('Invalid pending export request');
  if(value.kind==='create' && value.exportId===null)return exportInput({...value.body,requestId:value.requestId});
  if(value.kind==='retry' && typeof value.exportId==='string')return exportRetryInput(value.exportId,{...value.body,requestId:value.requestId});
  throw Error('Invalid pending export request');
}
export const pendingExportSignature=(value:PendingExport)=>JSON.stringify(pendingExportInput(value));
export function readPendingExport(storage:Store,scope:string):PendingExport|null {
  const raw=storage.getItem(key(scope));if(raw===null)return null;
  try {if(raw.length>1500)throw Error();const value=JSON.parse(raw);pendingExportInput(value);return value;}
  catch{throw Error('Saved export request cannot be verified. It has not been repeated or removed.');}
}
export function savePendingExport(storage:Store,scope:string,value:PendingExport) {
  const signature=pendingExportSignature(value),old=readPendingExport(storage,scope);
  if(old && (old.requestId!==value.requestId || pendingExportSignature(old)!==signature))throw Error('Recover the saved export request first.');
  const raw=JSON.stringify(value);if(raw.length>1500)throw Error('Saved export request exceeds its limit.');
  storage.setItem(key(scope),raw);if(storage.getItem(key(scope))!==raw)throw Error('This tab cannot retain the export request. No request was sent.');
}
export function clearPendingExport(storage:Store,scope:string,id:string,expected:PendingExport) {
  const old=readPendingExport(storage,scope);
  if(!old || old.requestId!==id || pendingExportSignature(old)!==pendingExportSignature(expected))throw Error('Saved export request changed.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null)throw Error('Saved export request could not be cleared.');
}
export function checkedExportRow(value:unknown):ExportRow {
  if(!object(value) || Object.keys(value).some(field=>!['id','status','createdAt','expiresAt','filename','attempts','error','filters','duplicate'].includes(field)))throw Error('Export status cannot be verified.');
  exportRequestId(value.id);
  if(!['queued','processing','ready','failed','expired'].includes(String(value.status)) || !date(value.createdAt) || !date(value.expiresAt)
    || Date.parse(value.expiresAt as string)<=Date.parse(value.createdAt as string) || value.filename!==`briefing-activity-${value.id}.csv`
    || !Number.isInteger(value.attempts) || Number(value.attempts)<0 || Number(value.attempts)>3 || value.error!==null && (typeof value.error!=='string' || value.error.length>300)
    || 'duplicate' in value && typeof value.duplicate!=='boolean' || !object(value.filters))throw Error('Export status cannot be verified.');
  const {timezone,...input}=value.filters,filters=reportScope(input);
  if(timezone!==undefined && (typeof timezone!=='string' || timezone.length>100))throw Error('Export timezone cannot be verified.');
  if(timezone!==undefined)try{new Intl.DateTimeFormat('en',{timeZone:timezone as string});}catch{throw Error('Export timezone cannot be verified.');}
  return {id:value.id as string,status:value.status as string,createdAt:value.createdAt as string,expiresAt:value.expiresAt as string,filename:value.filename as string,attempts:value.attempts as number,error:value.error as string|null,filters:{...filters,...(timezone!==undefined?{timezone:timezone as string}:{})}};
}
export function checkedExportResult(value:unknown,pending:PendingExport):ExportAccepted {
  pendingExportInput(pending);
  if(pending.kind==='create') {
    const row=checkedExportRow(value);
    const {timezone,...filters}=row.filters;
    if(row.id!==pending.requestId || JSON.stringify(filters)!==JSON.stringify(reportScope(pending.body.filters)))throw Error('Export acknowledgement does not match the saved filters.');
    // Queue progress can change between acknowledgement and receipt; only frozen acceptance is compared.
    return {id:row.id,createdAt:row.createdAt,expiresAt:row.expiresAt,filters:row.filters};
  }
  if(!object(value) || Object.keys(value).some(field=>!['requestId','id','attempts','acceptedAt','duplicate'].includes(field))
    || value.requestId!==pending.requestId || value.id!==pending.exportId || value.attempts!==pending.body.attempts || !date(value.acceptedAt)
    || 'duplicate' in value && typeof value.duplicate!=='boolean')throw Error('Export retry acknowledgement cannot be verified.');
  return {requestId:value.requestId as string,id:value.id as string,attempts:value.attempts as number,acceptedAt:value.acceptedAt as string};
}
export function checkedExportReceipt(value:unknown,pending:PendingExport) {
  if(object(value) && sameKeys(value,['found']) && value.found===false)return null;
  const expected=pendingExportInput(pending);
  if(!object(value) || !sameKeys(value,['found','request','result']) || value.found!==true || !object(value.request)
    || !sameKeys(value.request,Object.keys(expected)) || JSON.stringify(pending.kind==='create'?exportInput(value.request):exportRetryInput(value.request.exportId,{requestId:value.request.requestId,attempts:value.request.attempts}))!==JSON.stringify(expected))throw Error('Saved export receipt does not match the original request.');
  return checkedExportResult(value.result,pending);
}
