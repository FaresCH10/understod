import {usageRequestInput,sameUsageRequest} from '../server/usage-request-input.mjs';
export type UsageSession={clientContext:string;expiresAt:string};
export type PendingUsageRequest=UsageSession & {requestId:string;body:{kind:string;message:string;confirmed:true}};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(session:UsageSession)=>`understood:usage-request:${session.clientContext}`;
function checked(value:PendingUsageRequest,session:UsageSession) {
  if(!session || !/^[a-f0-9]{64}$/.test(session.clientContext) || !Number.isFinite(Date.parse(session.expiresAt))
    || new Date(session.expiresAt).toISOString()!==session.expiresAt || Date.parse(session.expiresAt)<=Date.now())throw Error('The usage request session has ended.');
  if(!value || Object.keys(value).sort().join(',')!=='body,clientContext,expiresAt,requestId'
    || value.clientContext!==session.clientContext || value.expiresAt!==session.expiresAt || !value.body || 'requestId' in value.body)throw Error('Saved usage request cannot be verified.');
  usageRequestInput({...value.body,requestId:value.requestId});return value;
}
export function readUsageRequest(storage:Store,session:UsageSession):PendingUsageRequest|null {
  const raw=storage.getItem(key(session));if(raw===null)return null;
  try{if(raw.length>8000)throw Error();return checked(JSON.parse(raw),session);}catch{throw Error('Saved usage request cannot be verified. No request was sent.');}
}
export function storeUsageRequest(storage:Store,value:PendingUsageRequest) {
  checked(value,value);const old=readUsageRequest(storage,value),raw=JSON.stringify(value);
  if(old && JSON.stringify(old)!==raw)throw Error('Resolve the saved usage request first.');
  storage.setItem(key(value),raw);if(storage.getItem(key(value))!==raw)throw Error('This tab cannot retain the request. No request was sent.');
}
export function clearUsageRequest(storage:Store,value:PendingUsageRequest) {
  const old=readUsageRequest(storage,value);if(!old || JSON.stringify(old)!==JSON.stringify(value))throw Error('Saved usage request changed.');
  storage.removeItem(key(value));if(storage.getItem(key(value))!==null)throw Error('Usage receipt could not be cleared.');
}
export class UsageRequestError extends Error {
  rejected:boolean;
  constructor(message:string,rejected=false){super(message);this.rejected=rejected;}
}
export async function requestUsageChange(value:PendingUsageRequest,send:boolean,fetchImpl=fetch,signal?:AbortSignal):Promise<boolean> {
  checked(value,value);signal?.throwIfAborted();
  const response=await fetchImpl(send?'/api/usage/requests':`/api/usage/requests/${value.requestId}`,{method:send?'POST':'GET',credentials:'include',cache:'no-store',signal,
    headers:{'x-client-session-context':value.clientContext,...(send?{'content-type':'application/json'}:{})},...(send?{body:JSON.stringify({...value.body,requestId:value.requestId})}:{})});
  const data=await response.json();if(!response.ok)throw new UsageRequestError(data?.error || 'Usage request unavailable.',response.status>=400 && response.status<500 && response.status!==429);
  if(!send && data?.found===false && Object.keys(data).length===1)return false;
  if(!data || data.requestId!==value.requestId || data.status!=='recorded' || data.delivery!=='site_owner_inbox' || data.changesApplied!==false
    || !sameUsageRequest(data.request,value.body) || !Number.isFinite(Date.parse(data.createdAt)) || (send?typeof data.duplicate!=='boolean':data.found!==true))throw Error('Usage receipt does not match the saved request.');
  return true;
}
