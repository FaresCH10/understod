import {reviewRequestId} from './briefing-input.mjs';
import {stageTest} from './ai/provider-stage-verification.mjs';
export function providerPolicyInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='confirmed,enabled,kind,maxDailyRequests,orgId,requestId,revision'
    || input.kind!=='provider-policy' || input.confirmed!==true || typeof input.enabled!=='boolean' || !Number.isInteger(input.maxDailyRequests) || input.maxDailyRequests<0 || input.maxDailyRequests>100000
    || !Number.isSafeInteger(input.revision) || input.revision<0 || input.revision>1e9 || input.orgId!==null && (typeof input.orgId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.orgId)))throw Error('Invalid operator command');
  reviewRequestId(input.requestId);
  return {kind:'provider-policy',orgId:input.orgId,revision:input.revision,enabled:input.enabled,maxDailyRequests:input.maxDailyRequests,confirmed:true};
}
export function providerVerificationInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='confirmed,kind,maxRequests,requestId'
    || input.kind!=='provider-verification' || input.confirmed!==true || input.maxRequests!==1)throw Error('Invalid operator command');
  reviewRequestId(input.requestId);return {kind:'provider-verification',maxRequests:1,confirmed:true};
}
export function providerStageVerificationInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='confirmed,kind,language,maxRequests,requestId,stage'
    || input.kind!=='provider-stage-verification' || input.confirmed!==true)throw Error('Invalid operator command');
  reviewRequestId(input.requestId);const test=stageTest(input.stage,input.language);
  if(input.maxRequests!==test.maxRequests)throw Error('Invalid operator command');
  return {kind:'provider-stage-verification',stage:test.stage,language:test.language,maxRequests:test.maxRequests,confirmed:true};
}
