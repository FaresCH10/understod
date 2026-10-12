export type DeletionReceipt={id:string;workerId:string;reason:'worker_request'|'customer_policy';createdAt:string;completedAt:string|null;status:'queued'|'complete';contentRedactedAt:string|null;identityPseudonymizedAt:string|null};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date=(value:unknown)=>typeof value==='string' && Number.isFinite(Date.parse(value));
export function readDeletionReceipt(value:unknown,workerId:string):DeletionReceipt|null{
  if(value===null)return null;
  const row=value as DeletionReceipt;
  if(!row || typeof row!=='object' || Array.isArray(row) || !uuid.test(row.id) || row.workerId!==workerId
    || !['worker_request','customer_policy'].includes(row.reason) || !date(row.createdAt)
    || !['queued','complete'].includes(row.status)
    || [row.completedAt,row.contentRedactedAt,row.identityPseudonymizedAt].some(value=>value!==null && !date(value))
    || (row.status==='complete')!==(row.completedAt!==null)
    || (row.identityPseudonymizedAt!==null && row.contentRedactedAt===null)
    || (row.completedAt!==null && row.identityPseudonymizedAt===null))throw new Error('Deletion status cannot be verified.');
  return row;
}

export function verifyDeletionAcceptance(value:unknown,requestId:string):void{
  const row=value as {id?:unknown;status?:unknown;duplicate?:unknown};
  if(!row || typeof row!=='object' || Array.isArray(row) || row.id!==requestId
    || !['queued','complete'].includes(String(row.status)) || typeof row.duplicate!=='boolean')throw new Error('Deletion acknowledgement cannot be verified.');
}
