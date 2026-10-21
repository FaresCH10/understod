export type ProcessingRetryRequest={requestId:string;jobId:string;publicationId:string;assignmentId:string;generation:number;confirmed:true};
export function processingRetryId(value:unknown):string;
export function processingRetryJob(value:unknown):{kind:'response_transcription'|'answer_check';id:string};
export function processingRetryInput(jobId:unknown,value:unknown):ProcessingRetryRequest;
export function processingRetryReceipt(row:unknown):{found:true;request:ProcessingRetryRequest;result:{jobId:string;state:'queued';acceptedAt:string}};
