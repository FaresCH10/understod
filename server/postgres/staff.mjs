import {domainTransaction,requirePrincipal,domainAudit} from './domain.mjs';
import {responseRead} from './responses.mjs';
import {staffReference,staffChangeInput,staffFilters,sameStaffRequest,staffPolicy,staffDto} from '../staff-input.mjs';
const readRoles=['owner','administrator','auditor'];
const targetSql='SELECT s.id,s.name,s.role,s.active,COALESCE(r.revision,1) AS revision FROM staff s LEFT JOIN staff_access_revisions r ON r.staff_id=s.id AND r.org_id=s.org_id AND r.site_id=s.site_id';
export function listStaff(pool,session,input={}, {schema='public'}={}) {
  const f=staffFilters(input);
  return responseRead(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff',readRoles);
    const where=` WHERE s.org_id=$1 AND s.site_id=$2 AND ($3='' OR strpos(lower(s.name),lower($3))>0)
      AND ($4='all' OR s.role=$4) AND ($5='all' OR ($5='active' AND s.active=true) OR ($5='revoked' AND s.active=false))`;
    const scope=[session.org_id,session.site_id,f.search,f.role,f.status];
    const total=Number((await client.query('SELECT COUNT(*) n FROM staff s'+where,scope)).rows[0].n);
    const items=(await client.query(targetSql+where+' ORDER BY lower(s.name),s.id LIMIT $6 OFFSET $7',[...scope,f.pageSize,(f.page-1)*f.pageSize])).rows;
    const activeOwners=Number((await client.query("SELECT COUNT(*) n FROM staff WHERE org_id=$1 AND site_id=$2 AND role='owner' AND active=true",[session.org_id,session.site_id])).rows[0].n);
    return {items:items.map(staffDto),total,page:f.page,pageSize:f.pageSize,canWrite:['owner','administrator'].includes(session.role),activeOwners};
  });
}
export function staffReceipt(pool,session,requestId,{schema='public'}={}) {
  staffReference(requestId);
  return responseRead(pool,schema,async client=>{await requirePrincipal(client,session,'staff',readRoles);const old=(await client.query('SELECT staff_id,action,request_json,result_json FROM staff_access_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3 AND created_by=$4',[requestId,session.org_id,session.site_id,session.principal_id])).rows[0];return old ? {accepted:true,id:old.staff_id,action:old.action,request:old.request_json,result:old.result_json} : {accepted:false};});
}
export function changeStaff(pool,session,id,action,input,{schema='public'}={}) {
  staffReference(id);const value=staffChangeInput(action,input);
  return domainTransaction(pool,schema,async client=>{
    // Take the site lock before any staff-row locks, including authority. Reciprocal changes cannot deadlock.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`staff-access:${session.org_id}:${session.site_id}`]);
    await requirePrincipal(client,session,'staff',['owner','administrator']);
    const old=(await client.query('SELECT * FROM staff_access_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {if(old.created_by!==session.principal_id || old.staff_id!==id || old.action!==action || !sameStaffRequest(old.request_json,value)) throw new Error('Staff request conflict');return {...old.result_json,duplicate:true};}
    const target=(await client.query(targetSql+' WHERE s.id=$1 AND s.org_id=$2 AND s.site_id=$3 FOR UPDATE OF s',[id,session.org_id,session.site_id])).rows[0];
    if(!target) throw new Error('Staff member unavailable');
    const owners=Number((await client.query("SELECT COUNT(*) n FROM staff WHERE org_id=$1 AND site_id=$2 AND role='owner' AND active=true",[session.org_id,session.site_id])).rows[0].n);
    const next=staffPolicy(session,target,action,value,owners);
    await client.query('UPDATE staff SET role=$1,active=$2 WHERE id=$3 AND org_id=$4 AND site_id=$5',[next.role,next.active,id,session.org_id,session.site_id]);
    await client.query("UPDATE sessions SET revoked_at=clock_timestamp() WHERE principal_type='staff' AND principal_id=$1 AND org_id=$2 AND site_id=$3 AND revoked_at IS NULL",[id,session.org_id,session.site_id]);
    const result={id,...next,duplicate:false};
    await client.query('INSERT INTO staff_access_requests(request_id,org_id,site_id,staff_id,action,request_json,result_json,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[input.requestId,session.org_id,session.site_id,id,action,JSON.stringify(value),JSON.stringify(result),session.principal_id]);
    await domainAudit(client,session,`staff.${action==='role' ? 'role_changed' : action==='revoke' ? 'access_revoked' : 'access_restored'}`,id);
    return result;
  });
}
