import {createHash} from 'node:crypto';
import {reviewRequestId} from './briefing-input.mjs';

export function operatorContext(row) {
  return createHash('sha256').update('understood:operator-session:v1\0').update(JSON.stringify([row.token_hash,row.operator_id,new Date(row.expires_at).toISOString()])).digest('hex');
}
export function operatorControlInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.confirmed!==true || !Number.isSafeInteger(input.revision) || input.revision<0 || input.revision>1000000000)throw Error('Invalid operator command');
  reviewRequestId(input.requestId);
  if(input.kind==='tenant') {
    if(Object.keys(input).some(key=>!['requestId','kind','orgId','revision','state','reason','confirmed'].includes(key))
      || typeof input.orgId!=='string' || !input.orgId || input.orgId.length>100 || /[\x00-\x1f\x7f]/.test(input.orgId)
      || !['active','suspended'].includes(input.state) || !['pilot_review','security_review','owner_request','maintenance'].includes(input.reason))throw Error('Invalid operator command');
    return {kind:'tenant',orgId:input.orgId,revision:input.revision,state:input.state,reason:input.reason,confirmed:true};
  }
  if(input.kind!=='system' || Object.keys(input).some(key=>!['requestId','kind','revision','jobsPaused','providerPaused','confirmed'].includes(key)) || typeof input.jobsPaused!=='boolean' || typeof input.providerPaused!=='boolean')throw Error('Invalid operator command');
  return {kind:'system',revision:input.revision,jobsPaused:input.jobsPaused,providerPaused:input.providerPaused,confirmed:true};
}
export function operatorRetryInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='attempts,confirmed,jobId,kind,requestId'
    || input.confirmed!==true || !['preparation','assessment','export'].includes(input.kind) || typeof input.jobId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.jobId)
    || !Number.isInteger(input.attempts) || input.attempts<1 || input.attempts>100)throw Error('Invalid operator command');
  reviewRequestId(input.requestId);
  return {kind:input.kind,jobId:input.jobId,attempts:input.attempts,confirmed:true};
}
export function operatorFilters(input={}) {
  if(Object.keys(input).some(key=>!['search','page','pageSize','state'].includes(key)))throw Error('Invalid operator filters');
  const search=input.search ?? '',page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20),state=input.state ?? 'all';
  if(typeof search!=='string' || search.length>100 || /[\x00-\x1f\x7f]/.test(search) || !Number.isInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50 || !['all','active','suspended'].includes(state))throw Error('Invalid operator filters');
  return {search:search.trim().toLowerCase(),page,pageSize,state};
}
export function operatorHttpError(error) {
  const message=error?.message;
  if(message==='Operator sign in required')return {status:401,error:message};
  if(message==='Invalid credentials')return {status:401,error:message};
  if(message==='Operator context changed')return {status:409,error:message};
  if(['Operator request conflict','Operator revision changed','Job is not retryable','Workspace access paused','Provider verification configuration changed'].includes(message))return {status:409,error:message};
  if(['Invalid operator command','Invalid operator filters','Invalid operator login','Invalid JSON','Unsupported provider stage test'].includes(message))return {status:400,error:message};
  if(message==='Request too large')return {status:413,error:message};
  if(message==='Tenant unavailable')return {status:404,error:message};
  if(['Provider quota is closed','Provider request quota reached','Provider dispatch paused','Provider verification unavailable','Provider verification worker unavailable'].includes(message))return {status:409,error:message};
  return {status:503,error:'Operations are temporarily unavailable'};
}
