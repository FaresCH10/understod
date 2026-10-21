import {templateInput,templateSignature} from '../server/template-input.mjs';
export type TemplateKind='create'|'edit'|'archive'|'restore'|'duplicate'|'use';
export type PendingTemplate={requestId:string;kind:TemplateKind;templateId:string|null;body:Record<string,unknown>};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:templates:${scope}`;
export function pendingTemplateSignature(value:PendingTemplate) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='body,kind,requestId,templateId'
    || (value.kind==='create' ? value.templateId!==null : typeof value.templateId!=='string') || !value.body || typeof value.body!=='object' || Array.isArray(value.body) || 'requestId' in value.body) throw new Error('Invalid pending template request');
  return templateSignature(templateInput(value.kind,value.templateId,{...value.body,requestId:value.requestId}));
}
export function checkedTemplateResult(value:unknown,pending:PendingTemplate):{id:string;revision:number;status?:string;state?:string} {
  const result=value as {id?:unknown;revision?:unknown;status?:unknown;state?:unknown;duplicate?:boolean}|null,fresh=['create','duplicate','use'].includes(pending.kind),use=pending.kind==='use';
  if(!result || typeof result!=='object' || Array.isArray(result) || Object.keys(result).some(key=>!['id','revision','duplicate',use?'state':'status'].includes(key))
    || 'duplicate' in result && typeof result.duplicate!=='boolean' || result.id!==(fresh ? pending.requestId : pending.templateId) || result.revision!==(fresh ? 1 : Number(pending.body.revision)+1)
    || (use?result.state!=='processing':result.status!==(pending.kind==='archive'?'archived':'active'))) throw new Error('Template acknowledgement does not match the pending request. Check its saved receipt.');
  return {id:result.id as string,revision:result.revision as number,...(use?{state:'processing'}:{status:result.status as string})};
}
export function readPendingTemplate(storage:Store,scope:string):PendingTemplate|null {
  const raw=storage.getItem(key(scope));if(raw===null) return null;
  try {
    if(raw.length>20000) throw new Error();
    const value=JSON.parse(raw) as PendingTemplate;
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(name=>!['requestId','kind','templateId','body'].includes(name))
      || (value.kind==='create' ? value.templateId!==null : typeof value.templateId!=='string')
      || !value.body || typeof value.body!=='object' || Array.isArray(value.body) || 'requestId' in value.body) throw new Error();
    pendingTemplateSignature(value);return value;
  } catch {throw new Error('Pending template request cannot be read. Check the template history before creating another request.');}
}
export function savePendingTemplate(storage:Store,scope:string,value:PendingTemplate) {
  pendingTemplateSignature(value);
  const old=readPendingTemplate(storage,scope);
  if(old && (old.requestId!==value.requestId || pendingTemplateSignature(old)!==pendingTemplateSignature(value))) throw new Error('Recover the pending template request first.');
  const raw=JSON.stringify(value);storage.setItem(key(scope),raw);
  if(storage.getItem(key(scope))!==raw) throw new Error('This tab cannot retain the template request. No request was sent.');
}
export function clearPendingTemplate(storage:Store,scope:string,id:string,expected?:PendingTemplate) {
  const old=readPendingTemplate(storage,scope);if(!old || old.requestId!==id || expected && pendingTemplateSignature(old)!==pendingTemplateSignature(expected)) throw new Error('Another template request is pending.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null) throw new Error('Pending template receipt could not be cleared.');
}
export function checkedTemplateReceipt(value:unknown,pending:PendingTemplate) {
  const row=value as {found?:boolean;request?:Record<string,unknown>;result?:unknown};
  if(row?.found===false && Object.keys(row).length===1)return null;
  const expected=templateInput(pending.kind,pending.templateId,{...pending.body,requestId:pending.requestId});
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).sort().join(',')!=='found,request,result' || row.found!==true
    || !row.request || typeof row.request!=='object' || Array.isArray(row.request) || Object.keys(row.request).sort().join(',')!==Object.keys(expected).sort().join(',')
    || templateSignature(row.request)!==templateSignature(expected))throw Error('Template saved receipt cannot be verified.');
  return checkedTemplateResult(row.result,pending);
}
