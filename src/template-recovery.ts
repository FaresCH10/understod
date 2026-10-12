import {templateInput,templateSignature} from '../server/template-input.mjs';
export type TemplateKind='create'|'edit'|'archive'|'restore'|'duplicate'|'use';
export type PendingTemplate={requestId:string;kind:TemplateKind;templateId:string|null;body:Record<string,unknown>};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>`understood:templates:${scope}`;
export function pendingTemplateSignature(value:PendingTemplate) {
  if((value.kind==='create' ? value.templateId!==null : typeof value.templateId!=='string') || !value.body || 'requestId' in value.body) throw new Error('Invalid pending template request');
  return templateSignature(templateInput(value.kind,value.templateId,{...value.body,requestId:value.requestId}));
}
export function checkedTemplateResult(value:unknown,pending:PendingTemplate):{id:string;revision:number} {
  const result=value as {id?:unknown;revision?:unknown}|null,fresh=['create','duplicate','use'].includes(pending.kind);
  if(!result || result.id!==(fresh ? pending.requestId : pending.templateId) || result.revision!==(fresh ? 1 : Number(pending.body.revision)+1)) throw new Error('Template acknowledgement does not match the pending request. Check its saved receipt.');
  return {id:result.id as string,revision:result.revision as number};
}
export function readPendingTemplate(storage:Store,scope:string):PendingTemplate|null {
  const raw=storage.getItem(key(scope));if(!raw) return null;
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
export function clearPendingTemplate(storage:Store,scope:string,id:string) {
  const old=readPendingTemplate(storage,scope);if(old && old.requestId!==id) throw new Error('Another template request is pending.');
  storage.removeItem(key(scope));if(storage.getItem(key(scope))) throw new Error('Pending template receipt could not be cleared.');
}
