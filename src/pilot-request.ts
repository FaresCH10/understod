export type PilotReceipt={found:true;id:string;delivery:'saved'|'queued'|'processing'|'sent'|'failed'|'expired';createdAt:string;expiresAt:string}|{found:false};
export type PilotIdentity={requestId:string;receiptToken:string};
export type PilotBody=PilotIdentity & {company:string;email:string;teamSize:number;languages:string[];message:string;consent:true};
const key='understood:public-pilot-receipt:v1';
export function pilotIdentity(value:unknown):value is PilotIdentity {
  const v=value as PilotIdentity;
  return !!v && typeof v==='object' && Object.keys(v).length===2 && typeof v.requestId==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.requestId) && typeof v.receiptToken==='string' && /^[a-f0-9]{64}$/.test(v.receiptToken);
}
export function readPilotIdentity(storage:Storage=sessionStorage):PilotIdentity|null {
  const raw=storage.getItem(key);if(!raw)return null;
  if(raw.length>256)throw Error('Saved request receipt is unreadable');
  const value:unknown=JSON.parse(raw);if(!pilotIdentity(value))throw Error('Saved request receipt is unreadable');return value;
}
export function savePilotIdentity(identity:PilotIdentity,storage:Storage=sessionStorage) {
  if(!pilotIdentity(identity) || readPilotIdentity(storage))throw Error('An earlier request needs checking');
  storage.setItem(key,JSON.stringify(identity));
  if(JSON.stringify(readPilotIdentity(storage))!==JSON.stringify(identity))throw Error('Request receipt could not be saved');
}
export function clearPilotIdentity(identity:PilotIdentity,storage:Storage=sessionStorage) {
  if(JSON.stringify(readPilotIdentity(storage))!==JSON.stringify(identity))throw Error('Saved request changed');storage.removeItem(key);
}
export async function requestPilot(identity:PilotIdentity,body?:PilotBody,fetchImpl=fetch):Promise<PilotReceipt> {
  const response=await fetchImpl(body?'/api/public/pilot':`/api/public/pilot/${identity.requestId}`,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:body?{'content-type':'application/json'}:{'x-pilot-receipt':identity.receiptToken},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error(response.status===429?'Too many requests. Please try again later.':response.status===409?'This request conflicts with a saved request. Check its receipt.':'The request could not be confirmed. Check its receipt before trying again.');
  const value=await response.json();
  if(value?.found===false && !body && Object.keys(value).length===1)return {found:false};
  if(value?.found!==true || value.id!==identity.requestId || !['saved','queued','processing','sent','failed','expired'].includes(value.delivery)
    || typeof value.createdAt!=='string' || typeof value.expiresAt!=='string' || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt)<=Date.parse(value.createdAt)
    || Object.keys(value).some(k=>!['found','id','delivery','createdAt','expiresAt'].includes(k)))throw Error('The request receipt could not be verified');
  return value;
}
