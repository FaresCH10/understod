import {processingRetryInput,processingRetryJob,type ProcessingRetryRequest} from '../server/processing-retry-input.mjs';
export type PendingProcessingRetry={requestId:string;body:Omit<ProcessingRetryRequest,'requestId'>};
export type ProcessingRetryContext={jobId:string;publicationId:string;assignmentId:string;generation:number;status:string;available:boolean};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
const keys=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).sort().join(',')===fields.sort().join(',');
const storageKey=(scope:string,jobId:string)=>{processingRetryJob(jobId);return `understood:processing-retry:${scope}:${jobId}`;};
export function pendingProcessingRetryInput(value:PendingProcessingRetry){
  if(!object(value) || !keys(value,['requestId','body']) || !object(value.body) || 'requestId' in value.body)throw Error('Invalid saved processing retry');
  return processingRetryInput(value.body.jobId,{...value.body,requestId:value.requestId});
}
const signature=(value:PendingProcessingRetry)=>JSON.stringify(pendingProcessingRetryInput(value));
export function readPendingProcessingRetry(storage:Store,scope:string,jobId:string):PendingProcessingRetry|null{
  const raw=storage.getItem(storageKey(scope,jobId));if(raw===null)return null;
  try{if(raw.length>1000)throw Error();const value=JSON.parse(raw);pendingProcessingRetryInput(value);if(value.body.jobId!==jobId)throw Error();return value;}
  catch{throw Error('Saved processing retry cannot be verified. It has not been repeated or removed.');}
}
export function savePendingProcessingRetry(storage:Store,scope:string,value:PendingProcessingRetry){
  const expected=signature(value),old=readPendingProcessingRetry(storage,scope,value.body.jobId);
  if(old && signature(old)!==expected)throw Error('Recover the saved processing retry first.');
  const raw=JSON.stringify(value);if(raw.length>1000)throw Error('Saved processing retry exceeds its limit.');
  storage.setItem(storageKey(scope,value.body.jobId),raw);
  if(storage.getItem(storageKey(scope,value.body.jobId))!==raw)throw Error('This tab cannot retain the processing retry. No request was sent.');
}
export function clearPendingProcessingRetry(storage:Store,scope:string,id:string,expected:PendingProcessingRetry){
  const old=readPendingProcessingRetry(storage,scope,expected.body.jobId);
  if(!old || old.requestId!==id || signature(old)!==signature(expected))throw Error('Saved processing retry changed.');
  storage.removeItem(storageKey(scope,expected.body.jobId));
  if(storage.getItem(storageKey(scope,expected.body.jobId))!==null)throw Error('Saved processing retry could not be cleared.');
}
export function checkedProcessingRetryContext(value:unknown,jobId:string,publicationId:string,assignmentId:string):ProcessingRetryContext{
  if(!object(value) || !keys(value,['jobId','publicationId','assignmentId','generation','status','available']) || value.jobId!==jobId || value.publicationId!==publicationId || value.assignmentId!==assignmentId
    || !Number.isSafeInteger(value.generation) || Number(value.generation)<0 || Number(value.generation)>1000000 || !['queued','processing','complete','failed','blocked'].includes(String(value.status))
    || typeof value.available!=='boolean' || value.available && !['failed','blocked'].includes(String(value.status)))throw Error('Processing retry state cannot be verified.');
  processingRetryInput(jobId,{requestId:'00000000-0000-0000-0000-000000000000',jobId,publicationId,assignmentId,generation:value.generation,confirmed:true});return value as ProcessingRetryContext;
}
export function checkedProcessingRetryResult(value:unknown,pending:PendingProcessingRetry){
  pendingProcessingRetryInput(pending);
  if(!object(value) || !keys(value,['jobId','state','acceptedAt']) || value.jobId!==pending.body.jobId || value.state!=='queued'
    || typeof value.acceptedAt!=='string' || !Number.isFinite(Date.parse(value.acceptedAt)) || new Date(value.acceptedAt).toISOString()!==value.acceptedAt)throw Error('Processing retry acknowledgement cannot be verified.');
  return {jobId:value.jobId as string,state:'queued',acceptedAt:value.acceptedAt};
}
export function checkedProcessingRetryReceipt(value:unknown,pending:PendingProcessingRetry){
  if(object(value) && keys(value,['found']) && value.found===false)return null;
  const expected=pendingProcessingRetryInput(pending);
  if(!object(value) || !keys(value,['found','request','result']) || value.found!==true || !object(value.request)
    || JSON.stringify(processingRetryInput(value.request.jobId,value.request))!==JSON.stringify(expected))throw Error('Processing retry receipt does not match the saved request.');
  return checkedProcessingRetryResult(value.result,pending);
}
