import {randomUUID} from 'node:crypto';
import {NOW,transaction} from './db.mjs';
import {ensureStaffSchema} from './staff-schema.mjs';
import {staffReference,staffChangeInput,staffFilters,sameStaffRequest,staffPolicy,staffDto} from './staff-input.mjs';
export {ensureStaffSchema} from './staff-schema.mjs';
function authority(db,session,write=false) {
  if(session?.principal_type!=='staff' || !(write ? ['owner','administrator'] : ['owner','administrator','auditor']).includes(session.role)
    || !db.prepare('SELECT 1 FROM staff WHERE id=? AND org_id=? AND site_id=? AND active=1 AND role=?').get(session.principal_id,session.org_id,session.site_id,session.role)) throw new Error('Forbidden');
}
const targetSql='SELECT s.id,s.name,s.role,s.active,COALESCE(r.revision,1) AS revision FROM staff s LEFT JOIN staff_access_revisions r ON r.staff_id=s.id AND r.org_id=s.org_id AND r.site_id=s.site_id';
export function listStaff(db,session,input={}) {
  const f=staffFilters(input);ensureStaffSchema(db);
  return transaction(db,()=>{
    authority(db,session);
    const scope=[session.org_id,session.site_id,f.search,f.search,f.role,f.role,f.status,f.status,f.status];
    const where=` WHERE s.org_id=? AND s.site_id=? AND (?='' OR instr(lower(s.name),lower(?))>0)
      AND (?='all' OR s.role=?) AND (?='all' OR (?='active' AND s.active=1) OR (?='revoked' AND s.active=0))`;
    const total=db.prepare('SELECT COUNT(*) n FROM staff s'+where).get(...scope).n;
    const items=db.prepare(targetSql+where+' ORDER BY lower(s.name),s.id LIMIT ? OFFSET ?').all(...scope,f.pageSize,(f.page-1)*f.pageSize);
    return {items:items.map(staffDto),total,page:f.page,pageSize:f.pageSize,canWrite:['owner','administrator'].includes(session.role),
      activeOwners:db.prepare("SELECT COUNT(*) n FROM staff WHERE org_id=? AND site_id=? AND role='owner' AND active=1").get(session.org_id,session.site_id).n};
  });
}
export function staffReceipt(db,session,requestId) {
  staffReference(requestId);ensureStaffSchema(db);
  return transaction(db,()=>{authority(db,session);const old=db.prepare('SELECT staff_id,action,request_json,result_json FROM staff_access_requests WHERE request_id=? AND org_id=? AND site_id=? AND created_by=?').get(requestId,session.org_id,session.site_id,session.principal_id);return old ? {accepted:true,id:old.staff_id,action:old.action,request:JSON.parse(old.request_json),result:JSON.parse(old.result_json)} : {accepted:false};});
}
export function changeStaff(db,session,id,action,input) {
  staffReference(id);const value=staffChangeInput(action,input);ensureStaffSchema(db);
  return transaction(db,()=>{
    authority(db,session,true);
    const old=db.prepare('SELECT * FROM staff_access_requests WHERE request_id=? AND org_id=? AND site_id=?').get(input.requestId,session.org_id,session.site_id);
    if(old) {
      if(old.created_by!==session.principal_id || old.staff_id!==id || old.action!==action || !sameStaffRequest(JSON.parse(old.request_json),value)) throw new Error('Staff request conflict');
      return {...JSON.parse(old.result_json),duplicate:true};
    }
    const target=db.prepare(targetSql+' WHERE s.id=? AND s.org_id=? AND s.site_id=?').get(id,session.org_id,session.site_id);
    if(!target) throw new Error('Staff member unavailable');
    const owners=db.prepare("SELECT COUNT(*) n FROM staff WHERE org_id=? AND site_id=? AND role='owner' AND active=1").get(session.org_id,session.site_id).n;
    const next=staffPolicy(session,target,action,value,owners),now=NOW();
    db.prepare('UPDATE staff SET role=?,active=? WHERE id=? AND org_id=? AND site_id=?').run(next.role,Number(next.active),id,session.org_id,session.site_id);
    db.prepare("UPDATE sessions SET revoked_at=? WHERE principal_type='staff' AND principal_id=? AND org_id=? AND site_id=? AND revoked_at IS NULL").run(now,id,session.org_id,session.site_id);
    const result={id,...next,duplicate:false};
    db.prepare('INSERT INTO staff_access_requests VALUES(?,?,?,?,?,?,?,?,?)').run(input.requestId,session.org_id,session.site_id,id,action,JSON.stringify(value),JSON.stringify(result),session.principal_id,now);
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),session.org_id,session.site_id,'staff',session.principal_id,`staff.${action==='role' ? 'role_changed' : action==='revoke' ? 'access_revoked' : 'access_restored'}`,id,now);
    return result;
  });
}
