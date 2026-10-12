import {transaction} from './db.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {reviewRequestId} from './briefing-input.mjs';

export function draftCreationReference(requestId) {
  try {return reviewRequestId(requestId);}catch {throw Error('Invalid draft creation receipt request');}
}
export function draftCreationReceipt(db,session,requestId) {
  draftCreationReference(requestId);
  return transaction(db,()=>{
    scheduleAuthority(db,session);
    const row=db.prepare('SELECT briefing_id,request_hash FROM draft_creations WHERE request_id=? AND org_id=? AND site_id=?').get(requestId,session.org_id,session.site_id);
    return row ? {requestId,accepted:true,result:{id:row.briefing_id,state:'draft',revision:1,requestHash:row.request_hash}} : {requestId,accepted:false};
  });
}
export function draftCreationHttpError(error) {
  const message=error?.message;
  if(['Forbidden','Forbidden origin'].includes(message))return {status:403,error:message};
  if(message==='Sign in required')return {status:401,error:message};
  if(message==='Invalid draft creation receipt request')return {status:400,error:message};
  return {status:503,error:'Draft creation receipt unavailable. The saved outcome is not confirmed.'};
}
