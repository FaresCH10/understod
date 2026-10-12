import {domainTransaction} from './domain.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {publicationReceiptReference} from '../briefing-input.mjs';
import {scheduleReceipt} from '../schedule-input.mjs';

export async function publicationReceipt(pool,session,briefingId,kind,requestId,{schema='public'}={}) {
  publicationReceiptReference(briefingId,kind,requestId);
  return domainTransaction(pool,schema,async client=>{
    await scheduleAuthority(client,session);
    if(!(await client.query('SELECT 1 FROM briefings WHERE id=$1 AND org_id=$2 AND site_id=$3',[briefingId,session.org_id,session.site_id])).rows.length)throw Error('Briefing unavailable');
    const base={requestId,briefingId,kind},args=[requestId,briefingId,session.org_id,session.site_id];
    if(kind==='schedule') {
      const row=(await client.query('SELECT * FROM publication_schedules WHERE id=$1 AND briefing_id=$2 AND org_id=$3 AND site_id=$4',args)).rows[0];
      return row ? {...base,accepted:true,request:row.request_json,result:scheduleReceipt(row)} : {...base,accepted:false};
    }
    const row=(await client.query(`SELECT r.request_json,p.id,p.version,(SELECT count(*)::int FROM assignments a WHERE a.publication_id=p.id) AS assigned
      FROM publication_requests r JOIN publications p ON p.id=r.publication_id AND p.org_id=r.org_id AND p.site_id=r.site_id AND p.briefing_id=r.briefing_id
      WHERE r.request_id=$1 AND r.briefing_id=$2 AND r.org_id=$3 AND r.site_id=$4`,args)).rows[0];
    return row ? {...base,accepted:true,request:row.request_json,result:{id:row.id,version:row.version,assigned:row.assigned}} : {...base,accepted:false};
  });
}
