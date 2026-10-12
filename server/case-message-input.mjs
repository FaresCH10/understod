import {createHash} from 'node:crypto';

export function caseMessageId(value) {
  if(typeof value!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw Error('Invalid conversation request');
  return value;
}
export function caseMessageInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['requestId','text'].includes(key))
    || typeof input.requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)
    || typeof input.text!=='string' || input.text.trim().length<1 || input.text.length>1000)throw Error('Invalid conversation request');
  const text=input.text.trim();return {id:input.requestId,text,hash:createHash('sha256').update(text).digest('hex')};
}
export function caseMessageFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['page','pageSize'].includes(key)))throw Error('Invalid conversation filter');
  const page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(!Number.isSafeInteger(page) || page<1 || page>5000 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>50)throw Error('Invalid conversation filter');
  return {page,pageSize};
}
export function caseMessageReceipt(row) {
  return {id:row.id,caseId:row.case_id,language:row.language,createdAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at};
}
export function caseMessageRow(row) {
  return {...caseMessageReceipt(row),author:row.actor_type,authorName:row.actor_type==='worker'?'Worker':row.author_name || 'Supervisor',text:row.text};
}
