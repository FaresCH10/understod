import {glossaryInput,glossarySignature} from '../server/glossary-input.mjs';
export type GlossaryKind='create'|'edit'|'remove'|'restore'|'regenerate';
export type PendingGlossary={requestId:string;kind:GlossaryKind;termId:string|null;body:Record<string,unknown>};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:glossary:${scope}`;
export function pendingGlossarySignature(value:PendingGlossary) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='body,kind,requestId,termId' || !value.body || typeof value.body!=='object' || Array.isArray(value.body) || 'requestId' in value.body || (value.kind==='create' ? value.termId!==null : typeof value.termId!=='string')) throw new Error('Pending glossary request is invalid.');
  return glossarySignature(glossaryInput(value.kind,value.termId,{...value.body,requestId:value.requestId}));
}
export function readPendingGlossary(storage:Storage,scope:string):PendingGlossary|null {
  let raw:string|null;try {raw=storage.getItem(key(scope));}catch {throw new Error('Glossary recovery storage is unavailable.');}
  if(raw===null) return null;
  try {if(new TextEncoder().encode(raw).length>6000) throw new Error();const value=JSON.parse(raw);pendingGlossarySignature(value);return value;}catch {throw new Error('Pending glossary request cannot be verified.');}
}
export function savePendingGlossary(storage:Storage,scope:string,value:PendingGlossary) {
  const signature=pendingGlossarySignature(value),old=readPendingGlossary(storage,scope),raw=JSON.stringify(value);
  if(old && (old.requestId!==value.requestId || pendingGlossarySignature(old)!==signature)) throw new Error('Resolve the pending glossary request before saving another.');
  if(new TextEncoder().encode(raw).length>6000) throw new Error('Pending glossary request is too large.');
  try {storage.setItem(key(scope),raw);if(storage.getItem(key(scope))!==raw) throw new Error();}catch {throw new Error('Glossary recovery storage is unavailable. No new request was sent.');}
}
export function clearPendingGlossary(storage:Storage,scope:string,requestId:string,expected?:PendingGlossary) {
  const old=readPendingGlossary(storage,scope);
  if(old?.requestId!==requestId || expected && (!old || pendingGlossarySignature(old)!==pendingGlossarySignature(expected))) throw new Error('Pending glossary request changed.');
  try {storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null) throw new Error();}catch {throw new Error('Glossary recovery storage could not be cleared.');}
}
export function checkedGlossaryResult(value:unknown,pending:PendingGlossary):{id:string;revision:number;invalidatedDrafts:number;status:string} {
  const result=value as {id:string;revision:number;invalidatedDrafts:number;status:string;duplicate?:boolean};
  if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).some(key=>!['id','revision','invalidatedDrafts','status','duplicate'].includes(key))
    || 'duplicate' in result && typeof result.duplicate!=='boolean' || result.id!==(pending.kind==='create' ? pending.requestId : pending.termId) || result.revision!==(pending.kind==='create' ? 1 : Number(pending.body.revision)+1)
    || !Number.isSafeInteger(result.invalidatedDrafts) || result.invalidatedDrafts<0 || result.status!==(pending.kind==='remove' ? 'removed' : 'active')) throw new Error('Glossary receipt response cannot be verified.');
  return {id:result.id,revision:result.revision,status:result.status,invalidatedDrafts:result.invalidatedDrafts};
}
export function checkedGlossaryReceipt(value:unknown,pending:PendingGlossary) {
  const row=value as {found?:boolean;request?:Record<string,unknown>;result?:unknown};
  if(row?.found===false && Object.keys(row).length===1)return null;
  const expected=glossaryInput(pending.kind,pending.termId,{...pending.body,requestId:pending.requestId});
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).sort().join(',')!=='found,request,result' || row.found!==true
    || !row.request || typeof row.request!=='object' || Array.isArray(row.request) || Object.keys(row.request).sort().join(',')!==Object.keys(expected).sort().join(',')
    || glossarySignature(row.request)!==glossarySignature(expected))throw Error('Glossary saved receipt cannot be verified.');
  return checkedGlossaryResult(row.result,pending);
}
