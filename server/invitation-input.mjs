import {staffRoles} from './staff-input.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const invalid=()=>new Error('Invalid invitation input');
function keys(input,allowed) {if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!allowed.includes(key))) throw invalid();}
export function invitationReference(id) {if(typeof id!=='string' || !uuid.test(id)) throw invalid();return id;}
export const invitationEmailKey=email=>`invitation-email:${email}`;
export function invitationIssueInput(input) {
  keys(input,['requestId','name','email','role','confirmed']);invitationReference(input.requestId);
  const email=typeof input.email==='string' ? input.email.trim().toLowerCase() : '',name=typeof input.name==='string' ? input.name.trim() : '';
  if(!name || name.length>120 || /[\u0000-\u001f\u007f]/.test(name) || input.confirmed!==true || !staffRoles.includes(input.role)
    || email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw invalid();
  return {name,email,role:input.role};
}
export function invitationChangeInput(input) {
  keys(input,['requestId','revision','confirmed']);invitationReference(input.requestId);
  if(input.confirmed!==true || !Number.isSafeInteger(input.revision) || input.revision<1) throw invalid();
  return {revision:input.revision};
}
export function invitationFilters(input={}) {
  keys(input,['status','page','pageSize']);const status=input.status ?? 'all';
  for(const field of ['page','pageSize']) if(input[field]!==undefined && !(typeof input[field]==='number' || (typeof input[field]==='string' && /^[0-9]{1,5}$/.test(input[field])))) throw invalid();
  const page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 5);
  if(!['all','pending','accepted','cancelled','expired'].includes(status) || !Number.isInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50) throw invalid();
  return {status,page,pageSize};
}
export function invitationTokenInput(input,remoteAddress='') {
  keys(input,['token']);if(typeof input.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token) || typeof remoteAddress!=='string' || remoteAddress.length>128) throw invalid();return input.token;
}
export function invitationAcceptInput(input,kind,remoteAddress) {
  keys(input,kind==='signup' ? ['requestId','token','password','confirmation'] : ['requestId','token']);
  if(!['signup','existing'].includes(kind)) throw invalid();invitationReference(input.requestId);invitationTokenInput({token:input.token},remoteAddress);
  if(kind==='signup' && (input.password!==input.confirmation || typeof input.password!=='string' || input.password.length<12 || input.password.length>256)) throw invalid();
  return {requestId:input.requestId,token:input.token};
}
export function invitationRolePolicy(actor,role) {
  if(!['owner','administrator'].includes(actor?.role) || (actor.role==='administrator' && ['owner','administrator'].includes(role))) throw new Error('Forbidden');
}
