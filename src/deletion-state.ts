import {validApplicationCleanupEvidence,type ApplicationCleanupEvidence} from '../server/deletion-scope.mjs';
export type DeletionReceipt={id:string;workerId:string;reason:'worker_request'|'customer_policy';createdAt:string;completedAt:string|null;status:'queued'|'complete';contentRedactedAt:string|null;identityPseudonymizedAt:string|null;cleanupEvidence:ApplicationCleanupEvidence};
export type PrivacyWorker={id:string;code:string;active:boolean;deletion_status:'none'|'queued'|'complete';requested_at:string|null;completed_at:string|null;cleanupEvidence:ApplicationCleanupEvidence};
export type PrivacyWorkerPage={items:PrivacyWorker[];total:number;page:number;pageSize:number};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date=(value:unknown)=>typeof value==='string' && Number.isFinite(Date.parse(value));
export function readPrivacyWorkerPage(value:unknown):PrivacyWorkerPage{
  const data=value as PrivacyWorkerPage;
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['items','total','page','pageSize'].includes(key))
    ||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0||!Number.isInteger(data.page)||data.page<1||data.page>5000
    ||!Number.isInteger(data.pageSize)||data.pageSize<1||data.pageSize>100||data.items.length>data.pageSize||data.items.length>data.total
    ||new Set(data.items.map(row=>row?.id)).size!==data.items.length
    ||data.items.some(row=>!row||typeof row!=='object'||Array.isArray(row)
      ||Object.keys(row).some(key=>!['id','code','active','deletion_status','requested_at','completed_at','cleanupEvidence'].includes(key))
      ||typeof row.id!=='string'||!row.id||row.id.length>100||typeof row.code!=='string'||!row.code||row.code.length>80||typeof row.active!=='boolean'
      ||!['none','queued','complete'].includes(row.deletion_status)||!validApplicationCleanupEvidence(row.cleanupEvidence)
      ||(row.requested_at!==null&&!date(row.requested_at))||(row.completed_at!==null&&!date(row.completed_at))
      ||(row.deletion_status==='none')!==(row.requested_at===null)||(row.deletion_status==='complete')!==(row.completed_at!==null)))
    throw new Error('Worker data request status cannot be verified.');
  return data;
}
export function readDeletionReceipt(value:unknown,workerId:string,pending?:{requestId:string;reason:string}):DeletionReceipt|null{
  if(value===null)return null;
  const row=value as DeletionReceipt;
  if(!row || typeof row!=='object' || Array.isArray(row) || !uuid.test(row.id) || row.workerId!==workerId
    || Object.keys(row).some(key=>!['id','workerId','reason','createdAt','completedAt','status','contentRedactedAt','identityPseudonymizedAt','cleanupEvidence'].includes(key))
    || !validApplicationCleanupEvidence(row.cleanupEvidence)
    || !['worker_request','customer_policy'].includes(row.reason) || !date(row.createdAt)
    || !['queued','complete'].includes(row.status)
    || [row.completedAt,row.contentRedactedAt,row.identityPseudonymizedAt].some(value=>value!==null && !date(value))
    || (row.status==='complete')!==(row.completedAt!==null)
    || (row.identityPseudonymizedAt!==null && row.contentRedactedAt===null)
    || (row.completedAt!==null && row.identityPseudonymizedAt===null)
    || pending && (row.id!==pending.requestId || row.reason!==pending.reason))throw new Error('Deletion status cannot be verified.');
  return row;
}

export function verifyDeletionAcceptance(value:unknown,requestId:string):void{
  const row=value as {id?:unknown;status?:unknown;duplicate?:unknown;cleanupEvidence?:unknown};
  if(!row || typeof row!=='object' || Array.isArray(row) || row.id!==requestId
    || !uuid.test(requestId) || Object.keys(row).some(key=>!['id','status','duplicate','cleanupEvidence'].includes(key))
    || !validApplicationCleanupEvidence(row.cleanupEvidence)
    || !['queued','complete'].includes(String(row.status)) || typeof row.duplicate!=='boolean')throw new Error('Deletion acknowledgement cannot be verified.');
}
