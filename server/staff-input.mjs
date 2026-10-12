export const staffRoles=['owner','administrator','supervisor','auditor'];
export const staffRecoveryScope=session=>session?.principal_type==='staff' && ['owner','administrator','auditor'].includes(session.role) ? JSON.stringify([session.org_id,session.site_id,session.principal_id]) : null;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function staffReference(id) {if(typeof id!=='string' || !id || id.length>100) throw new Error('Invalid staff request');return id;}
function keys(input,allowed,message) {if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!allowed.includes(k))) throw new Error(message);}
export function staffChangeInput(action,input) {
  if(!['role','revoke','restore'].includes(action)) throw new Error('Invalid staff request');
  keys(input,['requestId','revision','role','confirmed'],'Invalid staff request');
  if(typeof input.requestId!=='string' || !uuid.test(input.requestId) || !Number.isSafeInteger(input.revision) || input.revision<1 || input.confirmed!==true
    || (action==='role' ? !staffRoles.includes(input.role) : input.role!==undefined)) throw new Error('Invalid staff request');
  return {revision:input.revision,...(action==='role' ? {role:input.role} : {})};
}
export function staffFilters(input={}) {
  keys(input,['search','role','status','page','pageSize'],'Invalid staff filter');
  const search=input.search ?? '',role=input.role ?? 'all',status=input.status ?? 'all',page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 5);
  if(typeof search!=='string' || search.length>120 || /[\u0000-\u001f\u007f]/.test(search) || !['all',...staffRoles].includes(role)
    || !['all','active','revoked'].includes(status) || !Number.isInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50) throw new Error('Invalid staff filter');
  return {search:search.trim(),role,status,page,pageSize};
}
export function sameStaffRequest(a,b) {return a.revision===b.revision && a.role===b.role;}
export function staffSignature(id,action,value) {return JSON.stringify([id,action,value.revision,value.role ?? null]);}
export function staffPolicy(actor,target,action,value,activeOwners) {
  if(!['owner','administrator'].includes(actor.role)) throw new Error('Forbidden');
  if(actor.role==='administrator' && (['owner','administrator'].includes(target.role) || (action==='role' && ['owner','administrator'].includes(value.role)))) throw new Error('Forbidden');
  if(target.revision!==value.revision) throw new Error('Staff revision changed');
  if(action==='role' && !target.active) throw new Error('Staff access is revoked');
  if((action==='role' && target.role===value.role) || (action==='revoke' && !target.active) || (action==='restore' && target.active)) throw new Error('Staff access unchanged');
  if(target.active && target.role==='owner' && (action==='revoke' || (action==='role' && value.role!=='owner')) && activeOwners<=1) throw new Error('Last active site owner must be retained');
  if(!Number.isSafeInteger(target.revision+1)) throw new Error('Staff revision changed');
  return {role:action==='role' ? value.role : target.role,active:action==='revoke' ? false : action==='restore' ? true : !!target.active,revision:target.revision+1};
}
export function staffDto(row) {return {id:row.id,name:row.name,role:row.role,active:!!row.active,revision:Number(row.revision)};}
