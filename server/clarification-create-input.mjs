import {createHash} from 'node:crypto';

export const creationIdentifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
export const creationRequestId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export function clarificationCreationInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='assignmentId,attemptId,publicationId,reason,requestId,version'
    ||!creationRequestId(input.requestId)||!creationIdentifier(input.assignmentId)||!creationIdentifier(input.publicationId)
    ||!Number.isSafeInteger(input.version)||input.version<1||!(input.attemptId===null||creationIdentifier(input.attemptId))
    ||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.reason))throw Error('Invalid clarification creation');
  const content={assignmentId:input.assignmentId,publicationId:input.publicationId,version:input.version,attemptId:input.attemptId,reason:input.reason.trim()};
  return {id:input.requestId,content,hash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}
export function clarificationSubjectFilters(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['search','page','pageSize'].includes(key)))throw Error('Invalid clarification subject filter');
  const {search='',page=1,pageSize=10}=input;
  if(typeof search!=='string'||search.length>80||/[\u0000-\u001f\u007f]/.test(search)||!['string','number'].includes(typeof page)
    ||!/^[1-9][0-9]{0,3}$/.test(String(page))||Number(page)>5000||![10,'10'].includes(pageSize))throw Error('Invalid clarification subject filter');
  return {search:search.trim(),page:Number(page),pageSize:10};
}
const iso=value=>value instanceof Date?value.toISOString():value;
export const clarificationCreationSelection=value=>({assignmentId:value.assignmentId,publicationId:value.publicationId,version:value.version,attemptId:value.attemptId});
export const clarificationCreationRow=row=>({requestId:row.request_id,caseId:row.case_id,assignmentId:row.assignment_id,publicationId:row.publication_id,
  version:row.publication_version,attemptId:row.attempt_id??null,actorId:row.actor_id,actorRole:row.actor_role,requestHash:row.request_hash,
  selectionHash:createHash('sha256').update(JSON.stringify(clarificationCreationSelection({assignmentId:row.assignment_id,publicationId:row.publication_id,version:row.publication_version,attemptId:row.attempt_id??null}))).digest('hex'),createdAt:iso(row.created_at)});
export function exactClarificationCreation(row,session,command){
  if(!row)throw Error('Clarification creation receipt unavailable');
  if(row.org_id!==session.org_id||row.site_id!==session.site_id||row.actor_id!==session.principal_id||row.actor_role!==session.role||command&&row.request_hash!==command.hash)throw Error('Clarification creation conflict');
  return clarificationCreationRow(row);
}
export const clarificationSubjectRow=row=>({assignmentId:row.id,worker:row.worker,publicationId:row.publication_id,version:row.version,title:row.title??null,language:row.language,createdAt:iso(row.created_at)});
