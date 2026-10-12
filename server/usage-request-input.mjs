import {reviewRequestId} from './briefing-input.mjs';

export function usageRequestInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.confirmed!==true
    || Object.keys(input).sort().join(',')!=='confirmed,kind,message,requestId'
    || !['plan','quota','contact'].includes(input.kind) || typeof input.message!=='string'
    || input.message!==input.message.trim() || input.message.length<1 || input.message.length>1000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.message))throw Error('Invalid usage change request');
  reviewRequestId(input.requestId);
  return {kind:input.kind,message:input.message,confirmed:true};
}
export const sameUsageRequest=(a,b)=>JSON.stringify(usageRequestInput({...a,requestId:'00000000-0000-4000-8000-000000000000'}))===JSON.stringify(usageRequestInput({...b,requestId:'00000000-0000-4000-8000-000000000000'}));
