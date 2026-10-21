import {preparationRequestInput,preparationReference} from '../server/preparation-request-input.mjs';
export type PendingPreparation={requestId:string;briefingId:string;body:{revision:number;jobId:string|null;generation:number}};
export type PreparationContext={briefingId:string;revision:number;state:string;job:{id:string;status:string;generation:number}|null};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
const keys=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).sort().join(',')===fields.sort().join(',');
const storageKey=(scope:string,id:string)=>`understood:preparation:${scope}:${preparationReference(id)}`;
export function pendingPreparationInput(value:PendingPreparation) {
  if(!object(value) || !keys(value,['requestId','briefingId','body']) || !object(value.body) || 'requestId' in value.body)throw Error('Invalid pending preparation request');
  return preparationRequestInput(value.briefingId,{...value.body,requestId:value.requestId});
}
const signature=(value:PendingPreparation)=>JSON.stringify(pendingPreparationInput(value));
export function readPendingPreparation(storage:Store,scope:string,id:string):PendingPreparation|null {
  const raw=storage.getItem(storageKey(scope,id));if(raw===null)return null;
  try{if(raw.length>800)throw Error();const value=JSON.parse(raw);pendingPreparationInput(value);if(value.briefingId!==id)throw Error();return value;}
  catch{throw Error('Saved preparation request cannot be verified. It has not been repeated or removed.');}
}
export function savePendingPreparation(storage:Store,scope:string,value:PendingPreparation) {
  const expected=signature(value),old=readPendingPreparation(storage,scope,value.briefingId);
  if(old && signature(old)!==expected)throw Error('Recover the saved preparation request first.');
  const raw=JSON.stringify(value);if(raw.length>800)throw Error('Saved preparation request exceeds its limit.');
  storage.setItem(storageKey(scope,value.briefingId),raw);
  if(storage.getItem(storageKey(scope,value.briefingId))!==raw)throw Error('This tab cannot retain the preparation request. No request was sent.');
}
export function clearPendingPreparation(storage:Store,scope:string,id:string,expected:PendingPreparation) {
  const old=readPendingPreparation(storage,scope,expected.briefingId);
  if(!old || old.requestId!==id || signature(old)!==signature(expected))throw Error('Saved preparation request changed.');
  storage.removeItem(storageKey(scope,expected.briefingId));
  if(storage.getItem(storageKey(scope,expected.briefingId))!==null)throw Error('Saved preparation request could not be cleared.');
}
export function checkedPreparationContext(value:unknown,id:string,revision:number):PreparationContext {
  if(!object(value) || !keys(value,['briefingId','revision','state','job']) || value.briefingId!==id || value.revision!==revision
    || !Number.isSafeInteger(revision) || revision<1 || !['draft','processing','ready','failed'].includes(String(value.state)))throw Error('Preparation state cannot be verified.');
  if(value.job!==null) {
    if(!object(value.job) || !keys(value.job,['id','status','generation']) || !['queued','processing','ready','failed'].includes(String(value.job.status))
      || !Number.isSafeInteger(value.job.generation) || Number(value.job.generation)<0 || Number(value.job.generation)>1000000)throw Error('Preparation queue generation cannot be verified.');
    preparationReference(value.job.id);
  }
  return value as PreparationContext;
}
export function checkedPreparationRequestResult(value:unknown,pending:PendingPreparation) {
  pendingPreparationInput(pending);
  if(!object(value) || Object.keys(value).some(key=>!['id','state','acceptedAt','duplicate'].includes(key)) || value.state!=='processing'
    || typeof value.acceptedAt!=='string' || !Number.isFinite(Date.parse(value.acceptedAt)) || new Date(value.acceptedAt).toISOString()!==value.acceptedAt
    || 'duplicate' in value && typeof value.duplicate!=='boolean')throw Error('Preparation acknowledgement cannot be verified.');
  preparationReference(value.id);
  if(pending.body.jobId!==null && value.id!==pending.body.jobId)throw Error('Preparation acknowledgement refers to another job.');
  return {id:value.id as string,state:'processing',acceptedAt:value.acceptedAt};
}
export function checkedPreparationRequestReceipt(value:unknown,pending:PendingPreparation) {
  if(object(value) && keys(value,['found']) && value.found===false)return null;
  const expected=pendingPreparationInput(pending);
  if(!object(value) || !keys(value,['found','request','result']) || value.found!==true || !object(value.request)
    || !keys(value.request,Object.keys(expected)))throw Error('Preparation receipt cannot be verified.');
  const {briefingId,...body}=value.request;
  if(JSON.stringify(preparationRequestInput(briefingId,body))!==JSON.stringify(expected))throw Error('Preparation receipt does not match the saved request.');
  return checkedPreparationRequestResult(value.result,pending);
}
