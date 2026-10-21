const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function preparationRequestId(value) {
  if(typeof value!=='string' || !uuid.test(value))throw Error('Invalid preparation request');
  return value;
}
export function preparationReference(value) {
  if(typeof value!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value))throw Error('Invalid preparation reference');
  return value;
}
export function preparationRequestInput(briefingId,value) {
  preparationReference(briefingId);
  if(!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).sort().join(',')!=='generation,jobId,requestId,revision'
    || !Number.isSafeInteger(value.revision) || value.revision<1
    || !Number.isSafeInteger(value.generation) || value.generation<0 || value.generation>1000000
    || value.jobId!==null && (typeof value.jobId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.jobId))
    || value.jobId===null && value.generation!==0)throw Error('Invalid preparation request');
  return {requestId:preparationRequestId(value.requestId),briefingId,revision:value.revision,jobId:value.jobId,generation:value.generation};
}
export function preparationRequestReceipt(row) {
  const request=preparationRequestInput(row.briefing_id,{...row.request_json,requestId:row.request_id});
  preparationReference(row.job_id);
  if(request.revision!==row.revision || request.generation!==row.generation || request.jobId!==null && request.jobId!==row.job_id
    || !Number.isFinite(Date.parse(row.created_at)))throw Error('Preparation request receipt invalid');
  return {found:true,request,result:{id:row.job_id,state:'processing',acceptedAt:new Date(row.created_at).toISOString()}};
}
