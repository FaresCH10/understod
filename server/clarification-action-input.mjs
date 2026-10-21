import {createHash} from 'node:crypto';
import {resolutionInput,ownerInput} from './clarification-input.mjs';

export const clarificationActionId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const clarificationCaseId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const nullableId=value=>value===null||clarificationCaseId(value);
export function clarificationActionCommand(kind,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(input,'requestId'))return null;
  if(!clarificationActionId(input.requestId))throw Error('Invalid clarification action');
  let content;
  if(kind==='resolve'&&Object.keys(input).sort().join(',')==='notes,requestId')content={kind,notes:resolutionInput({notes:input.notes})};
  else if(kind==='assign'&&Object.keys(input).sort().join(',')==='expectedOwnerId,ownerId,requestId'&&nullableId(input.ownerId)&&nullableId(input.expectedOwnerId))
    content={kind,ownerId:ownerInput({ownerId:input.ownerId}),expectedOwnerId:input.expectedOwnerId};
  else throw Error('Invalid clarification action');
  return {id:input.requestId,kind,content,hash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}
export function clarificationActionReceiptRow(row){
  return {requestId:row.request_id,caseId:row.case_id,kind:row.kind,requestHash:row.request_hash,effect:row.effect,
    status:row.result_status,ownerId:row.result_owner_id,reasonCode:row.reason_code,
    createdAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at};
}
export function exactClarificationAction(row,session,caseId,command){
  const matches=row&&row.org_id===session.org_id&&row.site_id===session.site_id&&row.case_id===caseId&&row.actor_id===session.principal_id&&row.actor_role===session.role;
  if(!matches||command&&(row.kind!==command.kind||row.request_hash!==command.hash))throw Error(command?'Clarification action conflict':'Clarification action receipt unavailable');
  return clarificationActionReceiptRow(row);
}
