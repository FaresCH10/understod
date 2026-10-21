const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reference=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function processingRetryId(value){if(typeof value!=='string' || !uuid.test(value))throw Error('Invalid processing retry request');return value;}
export function processingRetryJob(value){
  if(typeof value!=='string')throw Error('Invalid processing retry job');
  const match=/^(response_transcription|answer_check):([A-Za-z0-9_-]{1,100})$/.exec(value);
  if(!match)throw Error('Invalid processing retry job');return {kind:match[1],id:match[2]};
}
export function processingRetryInput(jobId,value){
  processingRetryJob(jobId);
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='assignmentId,confirmed,generation,jobId,publicationId,requestId'
    || value.jobId!==jobId || value.confirmed!==true || !reference(value.assignmentId) || !reference(value.publicationId)
    || !Number.isSafeInteger(value.generation) || value.generation<0 || value.generation>1000000)throw Error('Invalid processing retry request');
  return {requestId:processingRetryId(value.requestId),jobId,publicationId:value.publicationId,assignmentId:value.assignmentId,generation:value.generation,confirmed:true};
}
export function processingRetryReceipt(row){
  const jobId=`${row.kind}:${row.job_id}`,request=processingRetryInput(jobId,{...row.request_json,requestId:row.request_id});
  if(request.publicationId!==row.publication_id || request.assignmentId!==row.assignment_id || request.generation!==row.generation || !Number.isFinite(Date.parse(row.created_at)))throw Error('Processing retry receipt invalid');
  return {found:true,request,result:{jobId,state:'queued',acceptedAt:new Date(row.created_at).toISOString()}};
}
