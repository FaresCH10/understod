import type {SourceUploadSession} from './source-audio-upload';

export type PendingSourceRetry=SourceUploadSession & {requestId:string;sourceRequestId:string;sourceHash:string};
export type SourceRetryReceipt={found:boolean;retryId:string;sourceRequestId:string;sourceHash?:string;acceptedAt?:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const iso=(v:unknown):v is string=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
function sessionCheck(session:SourceUploadSession) {
  if(!session || typeof session.clientContext!=='string' || !hash.test(session.clientContext) || !iso(session.expiresAt) || Date.parse(session.expiresAt)<=Date.now())throw Error('The source retry session has ended.');
}
function checked(value:PendingSourceRetry,session:SourceUploadSession,sourceRequestId:string,sourceHash:string) {
  sessionCheck(session);
  if(!value || Object.keys(value).sort().join(',')!=='clientContext,expiresAt,requestId,sourceHash,sourceRequestId'
    || value.clientContext!==session.clientContext || value.expiresAt!==session.expiresAt
    || typeof value.requestId!=='string' || !uuid.test(value.requestId) || !uuid.test(sourceRequestId) || !hash.test(sourceHash)
    || value.sourceRequestId!==sourceRequestId || value.sourceHash!==sourceHash)throw Error('Saved source retry cannot be verified.');
  return value;
}
const key=(session:SourceUploadSession,id:string)=>`understood:source-retry:${session.clientContext}:${id}`;
export function readSourceRetry(storage:Store,session:SourceUploadSession,id:string,sourceHash:string):PendingSourceRetry|null {
  sessionCheck(session);
  try {const raw=storage.getItem(key(session,id));if(raw===null)return null;if(raw.length>1024)throw Error();return checked(JSON.parse(raw),session,id,sourceHash);}
  catch {throw Error('Saved source retry cannot be verified. No retry was sent.');}
}
export function saveSourceRetry(storage:Store,pending:PendingSourceRetry) {
  checked(pending,pending,pending.sourceRequestId,pending.sourceHash);
  const old=readSourceRetry(storage,pending,pending.sourceRequestId,pending.sourceHash),raw=JSON.stringify(pending);
  if(old && JSON.stringify(old)!==raw)throw Error('Resolve the saved source retry first.');
  try {storage.setItem(key(pending,pending.sourceRequestId),raw);if(storage.getItem(key(pending,pending.sourceRequestId))!==raw)throw Error();}
  catch {throw Error('This tab cannot retain the retry reference. No retry was sent.');}
}
export function clearSourceRetry(storage:Store,pending:PendingSourceRetry) {
  const old=readSourceRetry(storage,pending,pending.sourceRequestId,pending.sourceHash);
  if(!old || JSON.stringify(old)!==JSON.stringify(pending))throw Error('Saved source retry changed.');
  storage.removeItem(key(pending,pending.sourceRequestId));
  if(storage.getItem(key(pending,pending.sourceRequestId))!==null)throw Error('Retry reference could not be cleared.');
}
export function checkedSourceRetryReceipt(value:unknown,pending:PendingSourceRetry):SourceRetryReceipt {
  checked(pending,pending,pending.sourceRequestId,pending.sourceHash);
  const data=value as SourceRetryReceipt;
  if(!data || typeof data.found!=='boolean' || data.retryId!==pending.requestId || data.sourceRequestId!==pending.sourceRequestId
    || Object.keys(data).sort().join(',')!==(data.found?'acceptedAt,found,retryId,sourceHash,sourceRequestId':'found,retryId,sourceRequestId')
    || (data.found && (data.sourceHash!==pending.sourceHash || !iso(data.acceptedAt))))throw Error('Retry receipt does not match the saved request.');
  return data;
}
async function operation(pending:PendingSourceRetry,send:boolean,fetchImpl:typeof fetch,signal?:AbortSignal) {
  checked(pending,pending,pending.sourceRequestId,pending.sourceHash);signal?.throwIfAborted();
  const response=await fetchImpl(`/api/source-audio/${pending.sourceRequestId}/retries${send?'':`/${pending.requestId}`}`,{
    method:send?'POST':'GET',credentials:'include',cache:'no-store',signal,
    headers:{'x-client-session-context':pending.clientContext,...(send?{'content-type':'application/json'}:{})},
    ...(send?{body:JSON.stringify({requestId:pending.requestId,sourceHash:pending.sourceHash,confirmed:true})}:{})});
  const data=await response.json();
  if(!response.ok)throw Error(data?.error || 'Source retry unavailable.');
  const receipt=checkedSourceRetryReceipt(data,pending);
  if(send && !receipt.found)throw Error('Retry acceptance is not confirmed. Check the retry receipt.');
  return receipt;
}
export const checkSourceRetry=(pending:PendingSourceRetry,fetchImpl=fetch,signal?:AbortSignal)=>operation(pending,false,fetchImpl,signal);
export const sendSourceRetry=(pending:PendingSourceRetry,fetchImpl=fetch,signal?:AbortSignal)=>operation(pending,true,fetchImpl,signal);
