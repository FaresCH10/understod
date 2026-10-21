export function staffRecordingInput(caseId,requestId,language){
  if(typeof caseId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(caseId)||typeof requestId!=='string'
    ||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId)
    ||language!==undefined&&!['en','ar','ur'].includes(language))throw Error('Invalid staff recording request');
  return {caseId,requestId,language};
}
export function staffRecordingPage(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['page','pageSize'].includes(key)))throw Error('Invalid staff recording page');
  for(const key of ['page','pageSize'])if(input[key]!==undefined&&typeof input[key]!=='number'&&(typeof input[key]!=='string'||!/^[1-9][0-9]*$/.test(input[key])))throw Error('Invalid staff recording page');
  const page=Number(input.page??1),pageSize=Number(input.pageSize??10);
  if(!Number.isSafeInteger(page)||page<1||page>5000||pageSize!==10)throw Error('Invalid staff recording page');return {page,pageSize};
}
export function staffRecordingReceipt(row){
  const iso=value=>value instanceof Date?value.toISOString():value??null;
  return {requestId:row.request_id,caseId:row.requested_case_id,assignmentId:row.assignment_id,kind:'in_person',actorId:row.actor_id,actorRole:row.actor_role,
    language:row.language,sha256:row.sha256,bytes:row.bytes,status:row.status,createdAt:iso(row.created_at),receivedAt:iso(row.received_at)};
}
export function exactStaffRecording(row,session,caseId,requestId){
  if(!row||row.request_id!==requestId||row.requested_case_id!==caseId||row.org_id!==session.org_id||row.site_id!==session.site_id
    ||row.actor_type!=='staff'||row.kind!=='in_person'||row.actor_id!==session.principal_id||row.actor_role!==session.role)throw Error('Staff recording receipt unavailable');return row;
}
export function staffRecordingHttpError(error){
  const message=error?.message;
  if(message==='Sign in required')return {status:401,error:message};
  if(['Forbidden','Forbidden origin','Forbidden transport','Workspace access paused','Worker access paused','Site archived'].includes(message))return {status:403,error:message};
  if(['Clarification unavailable','Staff recording receipt unavailable','Staff recording audio unavailable'].includes(message))return {status:404,error:message};
  if(['Staff recording conflict','Session context changed','Staff recording unavailable'].includes(message))return {status:409,error:message};
  if(message==='Request too large')return {status:413,error:message};
  if(['Invalid staff recording request','Invalid staff recording page','Invalid staff recording audio','Expected WAV audio'].includes(message))return {status:400,error:message};
  return {status:503,error:'Staff recording outcome is unconfirmed. Check its receipt before retrying.'};
}
import {inspectWav} from './audio.mjs';

export function inspectStaffRecording(bytes){
  let info;try{info=inspectWav(bytes);}catch{throw Error('Invalid staff recording audio');}
  if(info.durationSeconds<0.25)throw Error('Invalid staff recording audio');return info;
}
