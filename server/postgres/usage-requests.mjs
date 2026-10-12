import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {usageRequestInput,sameUsageRequest} from '../usage-request-input.mjs';
import {reviewRequestId} from '../briefing-input.mjs';

const roles=['owner','administrator','supervisor'];
const view=row=>({requestId:row.id,request:{kind:row.kind,message:row.message,confirmed:true},createdAt:row.created_at.toISOString(),status:'recorded',delivery:'site_owner_inbox',changesApplied:false});
async function receipt(client,session,id) {
  return (await client.query(`SELECT id,kind,message,created_at FROM usage_change_requests
    WHERE id=$1 AND org_id=$2 AND site_id=$3 AND created_by=$4`,[id,session.org_id,session.site_id,session.principal_id])).rows[0];
}
export function saveUsageRequest(pool,session,input,{schema='public'}={}) {
  const value=usageRequestInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',roles);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`usage-request:${input.requestId}`]);
    const old=await receipt(client,session,input.requestId);
    if(old) {if(!sameUsageRequest({kind:old.kind,message:old.message,confirmed:true},value))throw Error('Usage change request conflict');return {...view(old),duplicate:true};}
    let row;
    try {row=(await client.query(`INSERT INTO usage_change_requests(id,org_id,site_id,created_by,kind,message,confirmed)
      VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id,kind,message,created_at`,[input.requestId,session.org_id,session.site_id,session.principal_id,value.kind,value.message])).rows[0];}
    catch(error){if(error.code==='23505')throw Error('Usage change request conflict');throw error;}
    await domainAudit(client,session,'usage.change_requested',row.id);
    return {...view(row),duplicate:false};
  });
}
export function usageRequestReceipt(pool,session,id,{schema='public'}={}) {
  reviewRequestId(id);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',roles);
    const row=await receipt(client,session,id);return row?{...view(row),found:true}:{found:false};
  });
}
export function listUsageRequests(pool,session,input={},{schema='public'}={}) {
  if(Object.keys(input).some(key=>key!=='page') || (input.page!==undefined && !/^[1-9][0-9]{0,3}$/.test(String(input.page))))throw Error('Invalid usage change request');
  const page=Number(input.page || 1),pageSize=10;
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',roles);
    const args=[session.org_id,session.site_id,session.role==='owner'?null:session.principal_id];
    const where='org_id=$1 AND site_id=$2 AND ($3::text IS NULL OR created_by=$3)';
    const total=(await client.query(`SELECT COUNT(*)::int AS total FROM usage_change_requests WHERE ${where}`,args)).rows[0].total;
    const rows=(await client.query(`SELECT id,kind,message,created_at FROM usage_change_requests WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5`,[...args,pageSize,(page-1)*pageSize])).rows;
    return {items:rows.map(view),page,pageSize,total,scope:session.role==='owner'?'site_owner_inbox':'your_requests'};
  });
}
