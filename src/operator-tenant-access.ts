export type OperatorAccessWorker={id:string;reference:string;siteId:string;siteName:string;enabled:boolean;siteState:'active'|'archived';admissionState:'active'|'paused';credentialState:'session_active'|'link_available'|'no_current_access';lastSignInAt:string|null};
export type OperatorAccessReport={orgId:string;tenantName:string;tenantState:'active'|'suspended';asOf:string;total:number;page:number;pageSize:number;items:OperatorAccessWorker[]};
export const operatorCredentialLabels={session_active:'Current session',link_available:'Unused link available',no_current_access:'No current link or session'};
const reportKeys=['orgId','tenantName','tenantState','asOf','total','page','pageSize','items'].sort().join(',');
const workerKeys=['id','reference','siteId','siteName','enabled','siteState','admissionState','credentialState','lastSignInAt'].sort().join(',');
const label=(value:unknown,max:number)=>typeof value==='string' && value.length>0 && value.length<=max && !/[\x00-\x1f\x7f]/.test(value);
const timestamp=(value:unknown)=>typeof value==='string' && value.length<=40 && Number.isFinite(Date.parse(value));
export function checkedOperatorAccessReport(value:unknown,orgId:string,page:number):OperatorAccessReport {
  const r=value as OperatorAccessReport;
  if(!r || Object.keys(r).sort().join(',')!==reportKeys || r.orgId!==orgId || !label(r.tenantName,200) || r.page!==page
    || r.pageSize!==20 || !Number.isSafeInteger(r.total) || r.total<0 || !['active','suspended'].includes(r.tenantState) || !timestamp(r.asOf)
    || !Array.isArray(r.items) || r.items.length>20 || r.items.length>r.total
    || r.items.some(w=>!w || Object.keys(w).sort().join(',')!==workerKeys || !label(w.id,100) || !label(w.reference,100)
      || !label(w.siteId,100) || !label(w.siteName,200) || typeof w.enabled!=='boolean' || !['active','archived'].includes(w.siteState)
      || !['active','paused'].includes(w.admissionState) || !Object.hasOwn(operatorCredentialLabels,w.credentialState)
      || w.lastSignInAt!==null && !timestamp(w.lastSignInAt)) || new Set(r.items.map(w=>w.id)).size!==r.items.length)
    throw Error('Tenant access could not be verified');
  return r;
}
