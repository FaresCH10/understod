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
export type UsageRecord={requestId:string;request:{kind:string;message:string;confirmed:true};createdAt:string;status:'recorded';delivery:'site_owner_inbox';changesApplied:false};
export type UsageInbox={items:UsageRecord[];page:number;total:number;pageSize:number;scope:string};
const keys=(row:unknown,list:string)=>!!row && typeof row==='object' && !Array.isArray(row) && Object.keys(row).sort().join(',')===list;
export function checkedUsageRecord(raw:unknown):UsageRecord {
  const row=raw as UsageRecord;
  if(!keys(row,'changesApplied,createdAt,delivery,request,requestId,status') || row.status!=='recorded' || row.delivery!=='site_owner_inbox' || row.changesApplied!==false
    || typeof row.createdAt!=='string' || !Number.isFinite(Date.parse(row.createdAt)) || new Date(row.createdAt).toISOString()!==row.createdAt
    || !keys(row.request,'confirmed,kind,message'))throw Error('Usage receipt cannot be verified.');
  const request=usageRequestInput({...row.request,requestId:row.requestId});
  return {requestId:row.requestId,request,createdAt:row.createdAt,status:row.status,delivery:row.delivery,changesApplied:row.changesApplied};
}
function exactUsageRecord(raw:unknown,expected:PendingUsageRequest) {
  checked(expected,expected);const row=checkedUsageRecord(raw);
  if(row.requestId!==expected.requestId || !sameUsageRequest(row.request,expected.body))throw Error('Usage receipt does not match the saved request.');return row;
}
export function checkedUsageResult(raw:unknown,expected:PendingUsageRequest):UsageRecord {
  const row=raw as UsageRecord & {duplicate:boolean};
  if(!keys(row,'changesApplied,createdAt,delivery,duplicate,request,requestId,status') || typeof row.duplicate!=='boolean')throw Error('Usage acknowledgement cannot be verified.');
  const {duplicate,...record}=row;return exactUsageRecord(record,expected);
}
export function checkedUsageReceipt(raw:unknown,expected:PendingUsageRequest):UsageRecord|null {
  checked(expected,expected);const row=raw as UsageRecord & {found:boolean};
  if(keys(row,'found') && row.found===false)return null;
  if(!keys(row,'changesApplied,createdAt,delivery,found,request,requestId,status') || row.found!==true)throw Error('Usage receipt cannot be verified.');
  const {found,...record}=row;return exactUsageRecord(record,expected);
}
export function checkedUsageInbox(raw:unknown,page:number,role:string):UsageInbox {
  const row=raw as UsageInbox;
  if(!['owner','administrator','supervisor'].includes(role) || !keys(row,'items,page,pageSize,scope,total') || !Number.isSafeInteger(page) || page<1 || page>9999
    || row.page!==page || row.pageSize!==10 || !Number.isSafeInteger(row.total) || row.total<0 || row.scope!==(role==='owner'?'site_owner_inbox':'your_requests')
    || !Array.isArray(row.items) || row.items.length>Math.max(0,Math.min(10,row.total-(page-1)*10)) || new Set(row.items.map(item=>item?.requestId)).size!==row.items.length)throw Error('Usage inbox cannot be verified.');
  return {...row,items:row.items.map(checkedUsageRecord)};
}
