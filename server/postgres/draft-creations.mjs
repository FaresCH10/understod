import {domainTransaction} from './domain.mjs';
import {scheduleAuthority} from './schedules.mjs';
import {draftCreationReference} from '../draft-creations.mjs';

export async function draftCreationReceipt(pool,session,requestId,{schema='public'}={}) {
  draftCreationReference(requestId);
  return domainTransaction(pool,schema,async(client)=>{
    await scheduleAuthority(client,session);
    const row=(await client.query('SELECT briefing_id,request_hash FROM draft_creations WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[requestId,session.org_id,session.site_id])).rows[0];
    return row ? {requestId,accepted:true,result:{id:row.briefing_id,state:'draft',revision:1,requestHash:row.request_hash}} : {requestId,accepted:false};
  });
}
