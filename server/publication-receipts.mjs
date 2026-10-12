import {transaction} from './db.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {publicationReceiptReference} from './briefing-input.mjs';
import {scheduleReceipt} from './schedule-input.mjs';

export function publicationReceipt(db,session,briefingId,kind,requestId) {
  publicationReceiptReference(briefingId,kind,requestId);
  return transaction(db,()=>{
    scheduleAuthority(db,session);
    if(!db.prepare('SELECT 1 FROM briefings WHERE id=? AND org_id=? AND site_id=?').get(briefingId,session.org_id,session.site_id)) throw Error('Briefing unavailable');
    const base={requestId,briefingId,kind};
    if(kind==='schedule') {
      const row=db.prepare('SELECT * FROM publication_schedules WHERE id=? AND briefing_id=? AND org_id=? AND site_id=?').get(requestId,briefingId,session.org_id,session.site_id);
      return row ? {...base,accepted:true,request:JSON.parse(row.request_json),result:scheduleReceipt(row)} : {...base,accepted:false};
    }
    const row=db.prepare(`SELECT r.request_json,p.id,p.version,(SELECT count(*) FROM assignments a WHERE a.publication_id=p.id) AS assigned
      FROM publication_requests r JOIN publications p ON p.id=r.publication_id AND p.org_id=r.org_id AND p.site_id=r.site_id AND p.briefing_id=r.briefing_id
      WHERE r.request_id=? AND r.briefing_id=? AND r.org_id=? AND r.site_id=?`).get(requestId,briefingId,session.org_id,session.site_id);
    return row ? {...base,accepted:true,request:JSON.parse(row.request_json),result:{id:row.id,version:row.version,assigned:row.assigned}} : {...base,accepted:false};
  });
}
export function publicationReceiptHttpError(error) {
  const message=error?.message;
  if(['Forbidden','Forbidden origin'].includes(message))return {status:403,error:message};
  if(message==='Sign in required')return {status:401,error:message};
  if(message==='Briefing unavailable')return {status:404,error:message};
  if(message==='Invalid publication receipt request')return {status:400,error:message};
  return {status:503,error:'Publication receipt unavailable. The saved outcome is not confirmed.'};
}
