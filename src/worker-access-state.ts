import {sameStaffSession,validStaffSession,type PageSession} from './session-state.ts';
import {workerAccessLink} from './worker-access.ts';
export type WorkerGrant={id:string;workerId:string;createdAt:string;expiresAt:string;redeemedAt:string|null;revokedAt:string|null;status:'available'|'redeemed'|'expired'|'revoked'};
export type WorkerGrantPage={items:WorkerGrant[];total:number;page:number;pageSize:number;asOf:string;workerActive:boolean};
export type IssuedWorkerGrant={id:string;workerId:string;token:string;expiresAt:string};
const object=(value:unknown,fields:string[]):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>fields.includes(key));
const reference=(value:unknown)=>typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
export function checkedWorkerGrant(value:unknown,workerId:string,now=Date.now()):IssuedWorkerGrant {
  if(!object(value,['id','workerId','token','expiresAt']) || !reference(value.id) || value.workerId!==workerId || !reference(workerId)
    || typeof value.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !date(value.expiresAt) || Date.parse(value.expiresAt)<=now)throw Error('Access link cannot be verified.');
  return value as IssuedWorkerGrant;
}
export function checkedWorkerGrantPage(value:unknown,workerId:string,page:number):WorkerGrantPage {
  const invalid=()=>Error('Access status cannot be verified.');
  if(!object(value,['items','total','page','pageSize','asOf','workerActive']) || !Array.isArray(value.items) || value.items.length>5
    || !Number.isSafeInteger(value.total) || Number(value.total)<value.items.length || value.page!==page || value.pageSize!==5 || !date(value.asOf) || typeof value.workerActive!=='boolean')throw invalid();
  const ids=new Set<string>();
  for(const row of value.items) {
    if(!object(row,['id','workerId','createdAt','expiresAt','redeemedAt','revokedAt','status']) || !reference(row.id) || ids.has(String(row.id)) || row.workerId!==workerId
      || !date(row.createdAt) || !date(row.expiresAt) || [row.redeemedAt,row.revokedAt].some(value=>value!==null && !date(value)))throw invalid();
    const status=row.revokedAt?'revoked':Date.parse(row.expiresAt)<=Date.parse(value.asOf)?'expired':row.redeemedAt?'redeemed':'available';
    if(row.status!==status)throw invalid();ids.add(String(row.id));
  }
  return value as WorkerGrantPage;
}
export function checkedGrantRevocation(value:unknown) {
  if(!object(value,['ok']) || value.ok!==true)throw Error('Access revocation cannot be verified.');return value;
}
export async function copyWorkerGrant(grant:IssuedWorkerGrant,workerId:string,origin:string,expected:PageSession,readSession:()=>Promise<unknown>,writeText:(value:string)=>Promise<void>,current:()=>boolean,canCopy:()=>boolean=current,now=Date.now) {
  const original=Object.freeze({...expected}),issued=Object.freeze({...grant});
  const assert=()=>{
    if(!current() || !canCopy() || !validStaffSession(original,now()) || !['owner','supervisor'].includes(original.staffRole || '') || original.siteState!=='active')throw Error('Copy unavailable.');
    try{checkedWorkerGrant(issued,workerId,now());}catch{throw Error('Copy unavailable.');}
  };
  assert();const value=workerAccessLink(origin,issued.token),session=await readSession();assert();
  if(!sameStaffSession(original,session,now()))throw Error('Copy unavailable.');
  await writeText(value);assert();
}
